import * as crypto from 'crypto';
import { PassThrough } from 'stream';
import { S3 } from 'aws-sdk';
import { NextFunction, Request, Response } from 'express';
const PromiseRouter = require('express-promise-router');
import { getConfig } from '../config-helper';
import { AWS } from './aws';
import Model from './model';
import getLeaderboard from './model/leaderboard';
import Bucket from './bucket';
import { ClientParameterError } from './utility';

const Transcoder = require('stream-transcoder');

var path = require('path');
var fs = require('fs');
var audiopath = path.join(__dirname, '../../..', 'web', 'audio');

const SALT = '8hd3e8sddFSdfj';

export const hash = (str: string) =>
  crypto
    .createHmac('sha256', SALT)
    .update(str)
    .digest('hex');

/**
 * Clip - Responsibly for saving and serving clips.
 */
export default class Clip {
  private s3: S3;
  private bucket: Bucket;
  private model: Model;

  constructor(model: Model) {
    this.s3 = AWS.getS3();
    this.model = model;
    this.bucket = new Bucket(this.model, this.s3);
  }

  getRouter() {
    const router = PromiseRouter({ mergeParams: true });

    router.use(
      (
        { client_id, params }: Request,
        response: Response,
        next: NextFunction
      ) => {
        const { locale } = params;

        if (client_id && locale) {
          this.model.db
            .saveActivity(client_id, locale)
            .catch((error: any) => console.error('activity save error', error));
        }

        next();
      }
    );

    router.post('/:clipId/votes', this.saveClipVote);
    router.post('*', this.saveClip);

    router.get('/validated_hours', this.serveValidatedHoursCount);
    router.get('/daily_count', this.serveDailyCount);
    router.get('/stats', this.serveClipsStats);
    router.get('/leaderboard', this.serveClipLeaderboard);
    router.get('/votes/leaderboard', this.serveVoteLeaderboard);
    router.get('/voices', this.serveVoicesStats);
    router.get('/votes/daily_count', this.serveDailyVotesCount);
    router.get('*', this.serveRandomClips);

    return router;
  }

  saveClipVote = async (
    { client_id, body, params }: Request,
    response: Response
  ) => {
    const id = params.clipId as string;
    const { isValid } = body;

    const clip = await this.model.db.findClip(id);
    if (!clip || !client_id) {
      throw new ClientParameterError();
    }

    await this.model.db.saveVote(id, client_id, isValid);

    response.json(clip.path);
  };

  /**
   * Save the request body as an audio file.
   */
  saveClip = async (request: Request, response: Response) => {
    const { client_id, headers, params } = request;
    const sentence = decodeURIComponent(headers.sentence as string);

    if (!client_id || !sentence) {
      throw new ClientParameterError();
    }

    const transcoder = this.getTranscoderObject(request);

    // Where is our audio clip going to be located?
    const localFolder = path.join(audiopath, client_id);
    const sentenceId = headers.sentence_id;
    const fullPath = localFolder + path.sep + sentenceId + '.wav';

    this.createDirIfNotExist(audiopath);
    this.createDirIfNotExist(localFolder);
    this.deleteFileIfExists(fullPath);

    const clipModel = this.model;

    transcoder
      .format('wav')
      .audioCodec('pcm_s16le')
      .sampleRate(16000)
      .channels(1)
      .on('finish', () => {
        fs.chmodSync(fullPath, '777');
        clipModel
          .saveClip({
            client_id: client_id,
            locale: params.locale,
            original_sentence_id: sentenceId,
            path: fullPath,
            sentence,
            sentenceId: sentenceId,
          })
          .then(() => {
            response.json(sentenceId);
          });
      })
      .on('error', (e: any) => {
        throw new Error(e);
      })
      .writeToFile(fullPath);
  };

  getTranscoderObject = (request: Request) => {
    // If upload was base64, make sure we decode it first.
    const { headers } = request;
    let transcoder;

    if ((headers['content-type'] as string).includes('base64')) {
      // If we were given base64, we'll need to concat it all first
      // So we can decode it in the next step.
      const chunks: Buffer[] = [];
      new Promise(resolve => {
        request.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        request.on('end', resolve);
      });

      const passThrough = new PassThrough();
      passThrough.end(Buffer.from(Buffer.concat(chunks).toString(), 'base64'));
      transcoder = new Transcoder(passThrough);
    } else {
      // For non-base64 uploads, we can just stream data.
      transcoder = new Transcoder(request);
    }
    return transcoder;
  };

  createDirIfNotExist = (path: string) => {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path);
      fs.chmodSync(path, '777');
    }
  };

  deleteFileIfExists = (path: string) => {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
      console.log('deleted repeated file ' + path);
    }
  };

  serveRandomClips = async (
    { client_id, params, query }: Request,
    response: Response
  ): Promise<void> => {
    const clips = await this.bucket.getRandomClips(
      client_id,
      params.locale,
      parseInt(query.count, 10) || 1
    );
    response.json(clips);
  };

  serveValidatedHoursCount = async (request: Request, response: Response) => {
    response.json(await this.model.getValidatedHours());
  };

  serveDailyCount = async (request: Request, response: Response) => {
    response.json(
      await this.model.db.getDailyClipsCount(request.params.locale)
    );
  };

  serveDailyVotesCount = async (request: Request, response: Response) => {
    response.json(
      await this.model.db.getDailyVotesCount(request.params.locale)
    );
  };

  serveClipsStats = async ({ params }: Request, response: Response) => {
    response.json(await this.model.getClipsStats(params.locale));
  };

  serveVoicesStats = async ({ params }: Request, response: Response) => {
    response.json(await this.model.getVoicesStats(params.locale));
  };

  serveClipLeaderboard = async (
    { client_id, params, query }: Request,
    response: Response
  ) => {
    response.json(
      await getLeaderboard({
        type: 'clip',
        client_id,
        cursor: query.cursor ? JSON.parse(query.cursor) : null,
        locale: params.locale,
      })
    );
  };

  serveVoteLeaderboard = async (
    { client_id, params, query }: Request,
    response: Response
  ) => {
    response.json(
      await getLeaderboard({
        type: 'vote',
        client_id,
        cursor: query.cursor ? JSON.parse(query.cursor) : null,
        locale: params.locale,
      })
    );
  };
}
