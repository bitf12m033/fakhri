import { Controller, Get } from '@nestjs/common';
import { Public } from '../modules/auth/auth.decorators';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppConfig } from '@fakhri/config';
import { app as appMeta } from '../app.constants';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** Liveness + readiness: DB and Redis must both answer. */
  @Get()
  async health(): Promise<{
    status: 'ok' | 'degraded';
    service: string;
    version: string;
    env: string;
    uptime: number;
    time: string;
    db: { connected: boolean };
    redis: { connected: boolean };
  }> {
    let dbConnected = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbConnected = false;
    }
    const redisConnected = await this.redis.ping();

    const ok = dbConnected && redisConnected;
    return {
      status: ok ? 'ok' : 'degraded',
      service: appMeta.name,
      version: appMeta.version,
      env: this.config.get('NODE_ENV') ?? 'development',
      uptime: process.uptime(),
      time: new Date().toISOString(),
      db: { connected: dbConnected },
      redis: { connected: redisConnected },
    };
  }
}