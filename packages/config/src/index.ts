/**
 * Single, zod-validated env schema. Fail-fast at boot (docs/aidlc/05 §6, "config" section).
 * Secrets are read from env/provider only — never committed.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Auth (increment 3.4). The signing secret has no default on purpose:
  // a deployment without it must fail to boot rather than sign with a known key.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('fakhri-api'),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),

  // Checkout (increment 3.5). Catalog prices are quoted tax-inclusive in this
  // market, so the default adds no separate tax line; set a rate to break it out.
  TAX_RATE_PERCENT: z.coerce.number().min(0).max(100).default(0),
  CART_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function parseEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return result.data;
}