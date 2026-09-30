import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

export const TEST_ADMIN_PREFIX = 'e2e-admin-';
export const TEST_ADMIN_PASSWORD = 'Test-passw0rd';

export interface TestAdmin {
  id: string;
  email: string;
  token: string;
}

/**
 * Seeds an admin the way a real deployment does (direct row + hashed password),
 * then logs in through the API so tests exercise the real token path.
 */
export async function createAdmin(
  app: INestApplication,
  role: UserRole = UserRole.SUPER_ADMIN,
  label = 'main',
): Promise<TestAdmin> {
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);
  const email = `${TEST_ADMIN_PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const passwordHash = await passwords.hash(TEST_ADMIN_PASSWORD);
  const admin = await prisma.adminUser.create({
    data: { email, name: `Test ${role}`, role, passwordHash },
  });

  const res = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ email, password: TEST_ADMIN_PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { id: admin.id, email, token: res.body.data.accessToken };
}

/**
 * Deletes only the admins the calling spec created. Test files run in parallel,
 * so a prefix-wide delete would sign the other files out mid-run.
 */
export async function deleteAdmins(prisma: PrismaService, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.adminUser.deleteMany({ where: { id: { in: ids } } });
}
