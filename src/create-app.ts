import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { getCorsOrigins } from './common/runtime-config';

export async function createApplication() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(
    '/uploads',
    express.static(join(process.cwd(), 'uploads'), {
      setHeaders: (response) => {
        response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('New Zealankanz API')
    .setDescription('The New Zealankans backend API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
  await app.init();
  return app;
}
