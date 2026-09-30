import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

export const TEST_CUSTOMER_PASSWORD = 'Lahore-2026x';

/**
 * A valid Pakistani mobile number unique to this call. Specs run in parallel and
 * share a database, and each file deletes the numbers it allocated — so these
 * must not collide, or one file's cleanup removes another file's customer.
 * Random rather than clock-derived: two files can easily share a millisecond.
 */
export function allocatePhone(): string {
  const national = randomInt(100_000_000, 999_999_999); // 9 digits after the leading 3
  return `+923${national}`;
}

/** Rate-limit buckets a spec may clear, keyed by `rl:<Controller>.<handler>:...`. */
export const RATE_LIMIT_SCOPES = {
  register: 'rl:CustomerAuthController.register*',
  login: 'rl:CustomerAuthController.login*',
  verifyOtp: 'rl:CustomerAuthController.verifyOtp*',
  setPassword: 'rl:CustomersController.setPassword*',
  checkout: 'rl:CheckoutController.place*',
} as const;

/**
 * Clear specific rate-limit buckets so a spec can exercise business behaviour
 * without tripping FR-45.
 *
 * Scopes are explicit on purpose: spec files run in parallel against one Redis,
 * so a wildcard clear would reset a bucket another file is asserting on — which
 * is exactly how the OTP cap test started flaking.
 */
export async function resetRateLimits(
  app: INestApplication,
  scopes: readonly string[] = [RATE_LIMIT_SCOPES.register, RATE_LIMIT_SCOPES.login],
): Promise<void> {
  const redis = app.get(RedisService).client;
  for (const scope of scopes) {
    const keys = await redis.keys(scope);
    if (keys.length > 0) await redis.del(...keys);
  }
}

export interface TestCustomer {
  id: string;
  phone: string;
  token: string;
  refreshToken: string;
}

export async function registerCustomer(app: INestApplication, phone = allocatePhone()): Promise<TestCustomer> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/customer/register')
    .send({ phone, password: TEST_CUSTOMER_PASSWORD, firstName: 'Test' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);

  const prisma = app.get(PrismaService);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone }, select: { id: true } });
  return {
    id: customer.id,
    phone,
    token: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

export async function deleteCustomers(prisma: PrismaService, phones: string[]): Promise<void> {
  if (phones.length === 0) return;
  await prisma.otpCode.deleteMany({ where: { phone: { in: phones } } });
  await prisma.customer.deleteMany({ where: { phone: { in: phones } } });
}
