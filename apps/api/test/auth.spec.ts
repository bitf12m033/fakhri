import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins, TEST_ADMIN_PASSWORD, TestAdmin } from './support/admin';
import { deleteCustomers, registerCustomer, resetAuthState} from './support/customer';

let app: INestApplication;

/** Admin authentication, RBAC and refresh rotation (increment 3.4). Needs postgres + redis. */
describe('Auth and RBAC (e2e)', () => {
  let superAdmin: TestAdmin;
  let catalogAdmin: TestAdmin;
  let ordersAdmin: TestAdmin;
  let customerToken: string;
  const adminIds: string[] = [];
  const phones: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);

    superAdmin = await createAdmin(app, UserRole.SUPER_ADMIN, 'super');
    catalogAdmin = await createAdmin(app, UserRole.CATALOG, 'catalog');
    ordersAdmin = await createAdmin(app, UserRole.ORDERS, 'orders');
    adminIds.push(superAdmin.id, catalogAdmin.id, ordersAdmin.id);

    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    customerToken = customer.token;
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await deleteAdmins(prisma, adminIds);
    await deleteCustomers(prisma, phones);
    await app.close();
  });

  it('closes admin routes to anonymous, malformed and customer callers', async () => {
    const anonymous = await server().get('/api/v1/admin/brands');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');
    expect(anonymous.body.error.traceId).toBeTruthy();

    expect((await bearer('/api/v1/admin/brands', 'not-a-jwt')).status).toBe(401);
    expect((await bearer('/api/v1/admin/brands', `${superAdmin.token}tampered`)).status).toBe(401);

    const asCustomer = await bearer('/api/v1/admin/brands', customerToken);
    expect(asCustomer.status).toBe(403);
    expect(asCustomer.body.error.code).toBe('FORBIDDEN');
  });

  it('enforces role boundaries and lets SUPER_ADMIN through everywhere (REQ-29)', async () => {
    expect((await bearer('/api/v1/admin/brands', catalogAdmin.token)).status).toBe(200);
    expect((await bearer('/api/v1/admin/brands', superAdmin.token)).status).toBe(200);

    const wrongRole = await bearer('/api/v1/admin/brands', ordersAdmin.token);
    expect(wrongRole.status).toBe(403);
    expect(wrongRole.body.error.details).toEqual({ required: [UserRole.CATALOG] });

    // Admin account management is SUPER_ADMIN only.
    expect((await bearer('/api/v1/admin/users', catalogAdmin.token)).status).toBe(403);
    expect((await bearer('/api/v1/admin/users', superAdmin.token)).status).toBe(200);
  });

  it('keeps customer routes closed to admins', async () => {
    expect((await server().get('/api/v1/customers/me')).status).toBe(401);
    const asAdmin = await bearer('/api/v1/customers/me', superAdmin.token);
    expect(asAdmin.status).toBe(403);
    expect(asAdmin.body.error.code).toBe('FORBIDDEN');
  });

  it('answers unknown email and wrong password identically, then locks the account', async () => {
    const admin = await createAdmin(app, UserRole.SUPER_ADMIN, 'lockout');
    adminIds.push(admin.id);

    // Unique per run: the lockout counter for an email lives 15 minutes in Redis,
    // so a constant address would still be locked from the previous run.
    const unknownEmail = `nobody-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
    const unknown = await login(unknownEmail, 'whatever123');
    const wrong = await login(admin.email, 'wrong-password-1');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);

    // One failure already happened above; four more reach the default threshold of five.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login(admin.email, 'wrong-password-1')).status).toBe(401);
    }
    const locked = await login(admin.email, TEST_ADMIN_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
    expect(locked.body.error.message).toContain('failed attempts');
  });

  it('rotates refresh tokens and kills the family when an old one is replayed', async () => {
    const admin = await createAdmin(app, UserRole.SUPER_ADMIN, 'rotate');
    adminIds.push(admin.id);
    const first = await login(admin.email, TEST_ADMIN_PASSWORD);
    expect(first.status).toBe(200);
    const original = first.body.data.refreshToken;

    const rotated = await refresh(original);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(original);
    expect((await bearer('/api/v1/admin/users', rotated.body.data.accessToken)).status).toBe(200);

    const replay = await refresh(original);
    expect(replay.status).toBe(401);

    // Replay is treated as theft: the token issued by the rotation dies too.
    expect((await refresh(rotated.body.data.refreshToken)).status).toBe(401);
  });

  it('revokes a refresh token on logout', async () => {
    const admin = await createAdmin(app, UserRole.SUPER_ADMIN, 'logout');
    adminIds.push(admin.id);
    const session = await login(admin.email, TEST_ADMIN_PASSWORD);
    const { accessToken, refreshToken } = session.body.data;

    const out = await server()
      .post('/api/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(out.status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('manages admin users and drops their sessions when deactivated', async () => {
    const email = `e2e-admin-managed-${Date.now()}@example.test`;
    const created = await post('/api/v1/admin/users', superAdmin.token, {
      name: 'Managed Admin',
      email,
      password: 'Managed-pass1',
      role: UserRole.MARKETING,
    });
    expect(created.status).toBe(201);
    adminIds.push(created.body.data.id);
    expect(created.body.data).toMatchObject({ email, role: UserRole.MARKETING, isActive: true });

    const weak = await post('/api/v1/admin/users', superAdmin.token, {
      name: 'Weak', email: `weak-${email}`, password: 'short', role: UserRole.SUPPORT,
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('INVALID_INPUT');

    const duplicate = await post('/api/v1/admin/users', superAdmin.token, {
      name: 'Duplicate', email, password: 'Managed-pass1', role: UserRole.SUPPORT,
    });
    expect(duplicate.status).toBe(409);

    const session = await login(email, 'Managed-pass1');
    expect(session.status).toBe(200);
    const managedToken = session.body.data.accessToken;
    expect((await bearer('/api/v1/admin/brands', managedToken)).status).toBe(403); // MARKETING is not CATALOG

    const promoted = await patch(`/api/v1/admin/users/${created.body.data.id}`, superAdmin.token, {
      role: UserRole.CATALOG,
    });
    expect(promoted.status).toBe(200);
    // The role is re-read per request, so the change applies to the live token.
    expect((await bearer('/api/v1/admin/brands', managedToken)).status).toBe(200);

    const deactivated = await patch(`/api/v1/admin/users/${created.body.data.id}`, superAdmin.token, {
      isActive: false,
    });
    expect(deactivated.status).toBe(200);
    expect((await bearer('/api/v1/admin/brands', managedToken)).status).toBe(401);
    expect((await refresh(session.body.data.refreshToken)).status).toBe(401);

    const selfDelete = await server()
      .delete(`/api/v1/admin/users/${superAdmin.id}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(selfDelete.status).toBe(409);

    const removed = await server()
      .delete(`/api/v1/admin/users/${created.body.data.id}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(removed.status).toBe(200);
  });

  it('records the acting admin on audited mutations (REQ-34)', async () => {
    const slug = `e2e-admin-audit-${Date.now()}`;
    const brand = await post('/api/v1/admin/brands', catalogAdmin.token, { name: slug, slug });
    expect(brand.status).toBe(201);

    const prisma = app.get(PrismaService);
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: 'Brand', entityId: brand.body.data.id, action: 'catalog.brand.create' },
    });
    expect(entry?.actorType).toBe('ADMIN');
    expect(entry?.actorId).toBe(catalogAdmin.id);

    await prisma.brand.delete({ where: { id: brand.body.data.id } });
  });
});

function server() {
  return request(app.getHttpServer());
}

function bearer(path: string, token: string) {
  return server().get(path).set('Authorization', `Bearer ${token}`);
}

function login(email: string, password: string) {
  return server().post('/api/v1/admin/auth/login').send({ email, password });
}

function refresh(refreshToken: string) {
  return server().post('/api/v1/admin/auth/refresh').send({ refreshToken });
}

function post(path: string, token: string, body: unknown) {
  return server().post(path).set('Authorization', `Bearer ${token}`).send(body);
}

function patch(path: string, token: string, body: unknown) {
  return server().patch(path).set('Authorization', `Bearer ${token}`).send(body);
}
