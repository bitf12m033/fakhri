import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as RedisClient } from 'ioredis';
import { AppConfig } from '@fakhri/config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Redis');

  constructor(
    @Inject(REDIS_CLIENT) public readonly client: RedisClient,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  onModuleInit(): void {
    this.client.on('connect', () => this.logger.log('connected to redis'));
    this.client.on('error', (err) => this.logger.error(`redis error: ${err.message}`));
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  // Locks: used later for stock ops across instances (DEC-04).
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const res = await this.client.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async releaseLock(key: string, token = '1'): Promise<void> {
    if (token === '1') {
      await this.client.del(`lock:${key}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.disconnect();
  }
}

export const redisClientFactory = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig>) =>
    new RedisClient(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    }),
};