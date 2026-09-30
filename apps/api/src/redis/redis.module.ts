import { Global, Module } from '@nestjs/common';
import { redisClientFactory, RedisService } from './redis.service';

@Global()
@Module({
  providers: [redisClientFactory, RedisService],
  exports: [RedisService],
})
export class RedisModule {}