import { describe, expect, it } from 'vitest';
import { UserRole } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';
import { AdminUsersService } from '../src/modules/auth/admin-users.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { PasswordService } from '../src/modules/auth/password.service';
import type { TokenService } from '../src/modules/auth/token.service';
import type { AuditService } from '../src/audit/audit.service';

/**
 * The system must always keep one way in (REQ-29). Stubbed rather than e2e: the
 * rule counts super admins across the whole database, which parallel specs share.
 */

const SUPER_ADMIN_ROW = {
  id: 'admin-1',
  name: 'Only Super Admin',
  email: 'only@example.test',
  role: UserRole.SUPER_ADMIN,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  passwordHash: 'hash',
};

/** @param otherSuperAdmins how many *other* active super admins exist. */
function service(otherSuperAdmins: number) {
  const calls = { updated: 0, deleted: 0, revoked: 0 };
  const prisma = {
    adminUser: {
      findUnique: async () => SUPER_ADMIN_ROW,
      count: async () => otherSuperAdmins,
      update: async () => {
        calls.updated += 1;
        return SUPER_ADMIN_ROW;
      },
      delete: async () => {
        calls.deleted += 1;
        return SUPER_ADMIN_ROW;
      },
    },
  } as unknown as PrismaService;
  const passwords = { hash: async () => 'new-hash' } as unknown as PasswordService;
  const tokens = {
    revokeAllFor: async () => {
      calls.revoked += 1;
    },
  } as unknown as TokenService;
  const audit = { log: async () => undefined } as unknown as AuditService;
  return { service: new AdminUsersService(prisma, passwords, tokens, audit), calls };
}

const OTHER_ACTOR = { type: 'ADMIN' as const, id: 'admin-2', role: UserRole.SUPER_ADMIN };
const SELF_ACTOR = { type: 'ADMIN' as const, id: SUPER_ADMIN_ROW.id, role: UserRole.SUPER_ADMIN };

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

describe('AdminUsersService guardrails', () => {
  it('refuses to demote, deactivate or delete the last active super admin', async () => {
    const { service: last, calls } = service(0);
    expect(await code(() => last.update(SUPER_ADMIN_ROW.id, { role: UserRole.SUPPORT }, OTHER_ACTOR))).toBe('CONFLICT');
    expect(await code(() => last.update(SUPER_ADMIN_ROW.id, { isActive: false }, OTHER_ACTOR))).toBe('CONFLICT');
    expect(await code(() => last.remove(SUPER_ADMIN_ROW.id, OTHER_ACTOR))).toBe('CONFLICT');
    expect(calls).toMatchObject({ updated: 0, deleted: 0 });
  });

  it('allows the same changes while another super admin remains', async () => {
    const { service: withSpare, calls } = service(1);
    expect(await code(() => withSpare.update(SUPER_ADMIN_ROW.id, { role: UserRole.SUPPORT }, OTHER_ACTOR))).toBe('NO_ERROR');
    expect(await code(() => withSpare.remove(SUPER_ADMIN_ROW.id, OTHER_ACTOR))).toBe('NO_ERROR');
    expect(calls).toMatchObject({ updated: 1, deleted: 1 });
  });

  it('refuses self-deactivation and self-deletion', async () => {
    const { service: own } = service(5);
    expect(await code(() => own.update(SUPER_ADMIN_ROW.id, { isActive: false }, SELF_ACTOR))).toBe('CONFLICT');
    expect(await code(() => own.remove(SUPER_ADMIN_ROW.id, SELF_ACTOR))).toBe('CONFLICT');
  });

  it('revokes live sessions when the password changes', async () => {
    const { service: rotating, calls } = service(2);
    expect(await code(() => rotating.update(SUPER_ADMIN_ROW.id, { password: 'Rotated-pass1' }, OTHER_ACTOR))).toBe('NO_ERROR');
    expect(calls.revoked).toBe(1);
  });
});
