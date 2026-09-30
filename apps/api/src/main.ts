import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { app as appMeta } from './app.constants';

async function bootstrap(): Promise<void> {
  // rawBody: payment callbacks are HMAC-signed over the exact bytes the provider
  // sent, which a re-serialized body would not reproduce (increment 3.6).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  await configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`${appMeta.name} v${appMeta.version} listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();