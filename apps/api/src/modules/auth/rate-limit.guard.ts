import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { AppError } from '@fakhri/shared';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from './auth.decorators';

/**
 * Fixed-window Redis rate limit for the routes that ask for one (FR-45): auth,
 * OTP and anything else worth throttling. Redis rather than in-process, so the
 * limit holds across API instances.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const subject = [
      options.bodyKey ? fieldValue((request.body as Record<string, unknown>)?.[options.bodyKey]) : undefined,
      options.paramKey ? fieldValue(request.params?.[options.paramKey]) : undefined,
      options.byPrincipal ? fieldValue(subjectClaim(request.headers.authorization)) : undefined,
    ]
      .filter(Boolean)
      .join(':');
    const key = `rl:${route}:${request.ip ?? 'unknown'}${subject ? `:${subject}` : ''}`;

    const limit = options.configKey ? this.config.get(options.configKey, { infer: true }) : options.limit;
    const hits = await this.redis.client.incr(key);
    if (hits === 1) await this.redis.client.expire(key, options.windowSeconds);
    if (hits > limit) {
      const ttl = await this.redis.client.ttl(key);
      throw new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
        retryAfterSeconds: ttl > 0 ? ttl : options.windowSeconds,
      });
    }
    return true;
  }
}

/**
 * Bucket discriminator from a request field, hashed: the field is often an email,
 * a phone number or a refresh token, none of which belong in a cache key.
 */
/**
 * The `sub` claim of the bearer token, read without verifying the signature.
 *
 * That is safe here because this is only a bucket label: the access guard still
 * verifies the token immediately afterwards, so a forged subject buys nothing
 * except its own rate-limit bucket on a request that is about to be rejected.
 * Verifying twice would mean doing the crypto before the limiter, which is the
 * thing the limiter exists to prevent.
 */
function subjectClaim(header: string | undefined): string | undefined {
  const token = header?.split(' ')[1];
  const payload = token?.split('.')[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : undefined;
  } catch {
    return undefined;
  }
}

function fieldValue(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}
