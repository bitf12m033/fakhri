import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { actorContextMiddleware } from './common/actor-context';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppConfig } from '@fakhri/config';

export interface BootstrapOptions {
  logger?: Logger;
}

/** Shared app bootstrap: security headers, logger, validation, filters, versioning. */
export async function configureApp(app: INestApplication, _opts: BootstrapOptions = {}): Promise<void> {
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.use(helmet());
  app.use(actorContextMiddleware);

  const config = app.get(ConfigService<AppConfig>);
  const corsOrigins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const httpLogger = pinoHttp({
    level: config.get('LOG_LEVEL') ?? 'info',
    autoLogging: true,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
  app.use(httpLogger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}