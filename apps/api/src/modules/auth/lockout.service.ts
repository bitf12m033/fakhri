import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { AppError } from '@fakhri/shared';
import { RedisService } from '../../redis/redis.service';

/**
 * Failed-attempt counters and temporary lockout (REQ-12), kept in Redis: they are
 * rate-limit state with a natural TTL, not durable business data.
 */
@Injectable()
export class LockoutService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Throws RATE_LIMITED while the subject is locked out. */
  async assertNotLocked(subject: string): Promise<void> {
    const ttl = await this.redis.client.ttl(this.lockKey(subject));
    if (ttl > 0) {
      throw new AppError('RATE_LIMITED', 'Too many failed attempts. Try again later.', { retryAfterSeconds: ttl });
    }
  }

  /** Count a failure and lock the subject once the threshold is reached. */
  async recordFailure(subject: string): Promise<void> {
    const max = this.config.get('AUTH_MAX_FAILED_ATTEMPTS', { infer: true });
    const minutes = this.config.get('AUTH_LOCKOUT_MINUTES', { infer: true });
    const key = this.failKey(subject);
    const failures = await this.redis.client.incr(key);
    if (failures === 1) await this.redis.client.expire(key, minutes * 60);
    if (failures >= max) {
      await this.redis.client.set(this.lockKey(subject), '1', 'EX', minutes * 60);
      await this.redis.client.del(key);
    }
  }

  async clear(subject: string): Promise<void> {
    await this.redis.client.del(this.failKey(subject), this.lockKey(subject));
  }

  private failKey(subject: string): string {
    return `auth:fail:${subject}`;
  }

  private lockKey(subject: string): string {
    return `auth:lock:${subject}`;
  }
}
