import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

export const TEST_CUSTOMER_PASSWORD = 'Lahore-2026x';

/**
 * A valid Pakistani mobile number unique to this call. Specs run in parallel and
 * share a database, so each one owns the numbers it allocates and deletes those.
 */
export function allocatePhone(): string {
  const suffix = `${Date.now() % 100_000_000}`.padStart(8, '0');
  const digit = Math.floor(Math.random() * 10);
  return `+9233${digit}${suffix.slice(1)}`;
}

/**
 * Clears per-route rate-limit buckets so a spec can exercise business behaviour
 * without tripping FR-45. Only ever loosens limits, so parallel specs are safe.
 */
export async function resetRateLimits(app: INestApplication): Promise<void> {
  const redis = app.get(RedisService).client;
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) await redis.del(...keys);
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
