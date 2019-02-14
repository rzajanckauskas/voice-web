import { getConfig } from '../config-helper';
import { config, S3 } from 'aws-sdk';

if (process.env.HTTP_PROXY) {
  // Currently have no TS typings for proxy-agent, so have to use plain require().
  const proxy = require('proxy-agent');

  config.update({
    httpOptions: { agent: proxy(process.env.HTTP_PROXY) },
  });
}

export namespace AWS {
  let s3: any = null;

  export function getS3() {
    return s3;
  }
}
