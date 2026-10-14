import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { app as appMeta } from './app.constants';

async function bootstrap(): Promise<void> {
  // rawBody: payment callbacks are HMAC-signed over the exact bytes the provider
  // sent, which a re-serialized body would not reproduce (increment 3.6).
  // The default JSON parser stops at 100 KB. A lead CSV is capped at 2 MB and
  // then wrapped in JSON, so the parser has to allow the encoded body.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '3mb' });
  app.useBodyParser('urlencoded', { limit: '3mb', extended: true });
  await configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`${appMeta.name} v${appMeta.version} listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();