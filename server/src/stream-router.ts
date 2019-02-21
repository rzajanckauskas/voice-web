import { Request, Response } from 'express';

const PromiseRouter = require('express-promise-router');
const fs = require('fs');
const router = PromiseRouter();

router.use(require('cookie-parser')());
//todo routas turetu buti pasiekiamas tik prisijungusiems
router.get('/stream', (request: Request, response: Response) => {
  const { query, headers } = request;
  const path = query.file;
  const stat = fs.statSync(path);
  const fileSize = stat.size;
  const range = headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(path, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/*',
    };
    response.writeHead(206, head);
    file.pipe(response);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/*',
    };
    response.writeHead(200, head);
    fs.createReadStream(path).pipe(response);
  }
});

export default router;
