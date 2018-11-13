import * as crypto from 'crypto';
import { PassThrough } from 'stream';
import { S3 } from 'aws-sdk';
import { NextFunction, Request, Response } from 'express';

const PromiseRouter = require('express-promise-router');
import { getConfig } from '../config-helper';
import { AWS } from './aws';
import Model from './model';
import Bucket from './bucket';
import { ClientParameterError } from './utility';

const Transcoder = require('stream-transcoder');

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

    const glob = clip.path.replace('.mp3', '');
    const voteFile = glob + '-by-' + client_id + '.vote';

    await this.s3
      .putObject({
        Bucket: getConfig().BUCKET_NAME,
        Key: voteFile,
        Body: isValid.toString(),
      })
      .promise();

    console.log('clip vote written to s3', voteFile);

    response.json(glob);
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

    // Where is our audio clip going to be located?
    const folder = client_id + '/';
    const filePrefix = headers.sentence_id;
    const clipFileName = folder + client_id + '_' + filePrefix + '.mp3';
    const sentenceFileName = folder + filePrefix + '.txt';

    // if the folder does not exist, we create it
    await this.s3
      .putObject({ Bucket: getConfig().BUCKET_NAME, Key: folder })
      .promise();

    // If upload was base64, make sure we decode it first.
    let transcoder;
    if ((headers['content-type'] as string).includes('base64')) {
      // If we were given base64, we'll need to concat it all first
      // So we can decode it in the next step.
      const chunks: Buffer[] = [];
      await new Promise(resolve => {
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

    await Promise.all([
      this.s3
        .upload({
          Bucket: getConfig().BUCKET_NAME,
          Key: clipFileName,
          Body: transcoder
            .audioCodec('mp3')
            .format('mp3')
            .stream(),
        })
        .promise(),
      this.s3
        .putObject({
          Bucket: getConfig().BUCKET_NAME,
          Key: sentenceFileName,
          Body: sentence,
        })
        .promise(),
    ]);

    console.log('file written to s3', clipFileName);

    await this.model.saveClip({
      client_id: client_id,
      locale: params.locale,
      original_sentence_id: filePrefix,
      path: clipFileName,
      sentence,
      sentenceId: headers.sentence_id,
    });

    response.json(filePrefix);
  };

  serveRandomClips = async (
    { client_id, params, query }: Request,
    response: Response
  ): Promise<void> => {
    if (!client_id) {
      throw new ClientParameterError();
    }

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

  private serveDailyCount = async (request: Request, response: Response) => {
    response.json(await this.model.db.getDailyClipsCount());
  };

  private serveDailyVotesCount = async (
    request: Request,
    response: Response
  ) => {
    response.json(await this.model.db.getDailyVotesCount());
  };

  private serveClipsStats = async ({ params }: Request, response: Response) => {
    response.json(await this.model.getClipsStats(params.locale));
  };

  private serveVoicesStats = async (
    { params }: Request,
    response: Response
  ) => {
    response.json(await this.model.getVoicesStats(params.locale));
  };
}
