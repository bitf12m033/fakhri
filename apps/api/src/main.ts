import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { app as appMeta } from './app.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  await configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`${appMeta.name} v${appMeta.version} listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();