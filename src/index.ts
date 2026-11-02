import express, {
  type NextFunction,
  type Request,
  type Response,
  type RequestHandler,
} from 'express';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from './create-app';

const server: ReturnType<typeof express> = express();
let application: Promise<INestApplication> | undefined;

server.use((request: Request, response: Response, next: NextFunction) => {
  application ??= createApplication();
  void application
    .then((app) => {
      const expressHandler = app
        .getHttpAdapter()
        .getInstance() as RequestHandler;
      expressHandler(request, response, next);
    })
    .catch(next);
});

export default server;
