import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins } from './support/admin';
import {
  allocatePhone,
  deleteCustomers,
  RATE_LIMIT_SCOPES,
  registerCustomer,
  resetRateLimits,
  resetAuthState,
  TEST_CUSTOMER_PASSWORD,
} from './support/customer';

let app: INestApplication;

/** Customer accounts, OTP login, addresses and wishlist (increment 3.4). Needs postgres + redis. */
describe('Customer accounts (e2e)', () => {
  const run = `e2e34-${Date.now()}`;
  const phones: string[] = [];
  const adminIds: string[] = [];
  let variantId: string;
  let productSlug: string;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    await cleanup(app.get(PrismaService));

    // A published product, so the wishlist has something real to hold.
    const admin = await createAdmin(app);
    adminIds.push(admin.id);
    const brand = await adminPost('/brands', admin.token, { name: `Brand ${run}`, slug: `${run}-brand` });
    const category = await adminPost('/categories', admin.token, { name: `Category ${run}`, slug: `${run}-cat` });
    productSlug = `${run}-product`;
    const product = await adminPost('/products', admin.token, {
      name: `Product ${run}`,
      slug: productSlug,
      brandId: brand.id,
      categoryId: category.id,
      status: 'ACTIVE',
      variants: [{ sku: `${run}-SKU1`, price: '54999.00' }],
    });
    variantId = product.variants[0].id;
  }, 60_000);

  beforeEach(async () => {
    // Deliberately not the OTP request bucket: one test asserts that cap fires.
    await resetRateLimits(app, [
      RATE_LIMIT_SCOPES.register,
      RATE_LIMIT_SCOPES.login,
      RATE_LIMIT_SCOPES.verifyOtp,
      RATE_LIMIT_SCOPES.setPassword,
    ]);
  });

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await cleanup(prisma);
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('registers with a password and rejects weak, malformed and duplicate input (REQ-12)', async () => {
    const phone = allocatePhone();
    phones.push(phone);

    const weak = await post('/auth/customer/register', { phone, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('INVALID_INPUT');

    const badPhone = await post('/auth/customer/register', { phone: '0211234567', password: TEST_CUSTOMER_PASSWORD });
    expect(badPhone.status).toBe(400);

    const created = await post('/auth/customer/register', {
      phone: `0${phone.slice(3)}`, // the national form of the same number
      password: TEST_CUSTOMER_PASSWORD,
      firstName: 'Ayesha',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.tokenType).toBe('Bearer');
    expect(created.body.data.accessToken).toBeTruthy();

    const duplicate = await post('/auth/customer/register', { phone, password: TEST_CUSTOMER_PASSWORD });
    expect(duplicate.status).toBe(409);

    // Registration normalized the number, so password login works with either form.
    const login = await post('/auth/customer/login', { phone, password: TEST_CUSTOMER_PASSWORD });
    expect(login.status).toBe(200);
    const wrong = await post('/auth/customer/login', { phone, password: 'not-the-password-1' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs in by phone OTP and creates the account on first use (REQ-13)', async () => {
    const phone = allocatePhone();
    phones.push(phone);

    const challenge = await post('/auth/customer/otp/request', { phone });
    expect(challenge.status).toBe(200);
    expect(challenge.body.data.expiresAt).toBeTruthy();
    const code = challenge.body.data.devCode as string;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await post('/auth/customer/otp/verify', { phone, code: nextCode(code) });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('UNAUTHENTICATED');

    const verified = await post('/auth/customer/otp/verify', { phone, code });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);

    const me = await get('/customers/me', verified.body.data.accessToken);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ phone, isPhoneVerified: true, hasPassword: false });

    // A consumed code cannot be replayed.
    expect((await post('/auth/customer/otp/verify', { phone, code })).status).toBe(401);

    // Requesting again invalidates the previous code.
    const second = await post('/auth/customer/otp/request', { phone });
    const third = await post('/auth/customer/otp/request', { phone });
    expect((await post('/auth/customer/otp/verify', { phone, code: second.body.data.devCode })).status).toBe(401);
    expect((await post('/auth/customer/otp/verify', { phone, code: third.body.data.devCode })).status).toBe(200);
  });

  it('caps OTP requests per phone number (FR-45)', async () => {
    const phone = allocatePhone();
    phones.push(phone);
    for (let request = 0; request < 5; request += 1) {
      expect((await post('/auth/customer/otp/request', { phone })).status, `request ${request}`).toBe(200);
    }
    const blocked = await post('/auth/customer/otp/request', { phone });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reads and updates its own profile (REQ-14)', async () => {
    const customer = await registerCustomer(app);
    phones.push(customer.phone);

    const me = await get('/customers/me', customer.token);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ phone: customer.phone, firstName: 'Test', hasPassword: true });
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');

    const email = `${run}-buyer@example.test`;
    const updated = await patch('/customers/me', customer.token, {
      firstName: 'Bilal',
      lastName: 'Khan',
      email,
      whatsappConsent: true,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ firstName: 'Bilal', lastName: 'Khan', email, whatsappConsent: true });

    const other = await registerCustomer(app);
    phones.push(other.phone);
    const clash = await patch('/customers/me', other.token, { email });
    expect(clash.status).toBe(409);
  });

  it('keeps exactly one default address and isolates customers (REQ-14)', async () => {
    const customer = await registerCustomer(app);
    phones.push(customer.phone);

    const home = await post('/customers/me/addresses', addressBody('Home'), customer.token);
    expect(home.status).toBe(201);
    expect(home.body.data.isDefault).toBe(true); // the first address is the default
    expect(home.body.data.phone).toBe('+923001234567'); // normalized on the way in

    const office = await post('/customers/me/addresses', { ...addressBody('Office'), isDefault: true }, customer.token);
    expect(office.status).toBe(201);
    let list = (await get('/customers/me/addresses', customer.token)).body.data;
    expect(list).toHaveLength(2);
    expect(list.filter((address: { isDefault: boolean }) => address.isDefault)).toHaveLength(1);
    expect(list[0].id).toBe(office.body.data.id);

    const renamed = await patch(`/customers/me/addresses/${home.body.data.id}`, customer.token, { city: 'Multan' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.city).toBe('Multan');

    const unsetDefault = await patch(`/customers/me/addresses/${office.body.data.id}`, customer.token, {
      isDefault: false,
    });
    expect(unsetDefault.status).toBe(400);

    const bad = await post('/customers/me/addresses', { ...addressBody('Bad'), phone: '12345' }, customer.token);
    expect(bad.status).toBe(400);

    // Deleting the default promotes another address.
    expect((await del(`/customers/me/addresses/${office.body.data.id}`, customer.token)).status).toBe(200);
    list = (await get('/customers/me/addresses', customer.token)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);

    const stranger = await registerCustomer(app);
    phones.push(stranger.phone);
    expect((await get('/customers/me/addresses', stranger.token)).body.data).toHaveLength(0);
    const poke = await patch(`/customers/me/addresses/${list[0].id}`, stranger.token, { city: 'Quetta' });
    expect(poke.status).toBe(404);
  });

  it('sets a password for an OTP-only account and changes an existing one', async () => {
    const phone = allocatePhone();
    phones.push(phone);
    const challenge = await post('/auth/customer/otp/request', { phone });
    const session = await post('/auth/customer/otp/verify', { phone, code: challenge.body.data.devCode });
    expect(session.status).toBe(200);
    const otpToken = session.body.data.accessToken;

    // No password yet, so none has to be proven.
    const weak = await post('/customers/me/password', { newPassword: 'weak' }, otpToken);
    expect(weak.status).toBe(400);

    const set = await post('/customers/me/password', { newPassword: 'Karachi-2026a' }, otpToken);
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data.accessToken).toBeTruthy();
    // Setting it dropped the session that came from the OTP login.
    expect((await post('/auth/customer/refresh', { refreshToken: session.body.data.refreshToken })).status).toBe(401);
    expect((await post('/auth/customer/login', { phone, password: 'Karachi-2026a' })).status).toBe(200);

    const newToken = set.body.data.accessToken;
    const noProof = await post('/customers/me/password', { newPassword: 'Karachi-2026b' }, newToken);
    expect(noProof.status).toBe(400);
    const wrongProof = await post(
      '/customers/me/password',
      { currentPassword: 'Karachi-2026z', newPassword: 'Karachi-2026b' },
      newToken,
    );
    expect(wrongProof.status).toBe(401);

    const changed = await post(
      '/customers/me/password',
      { currentPassword: 'Karachi-2026a', newPassword: 'Karachi-2026b' },
      newToken,
    );
    expect(changed.status).toBe(200);
    expect((await post('/auth/customer/login', { phone, password: 'Karachi-2026a' })).status).toBe(401);
    expect((await post('/auth/customer/login', { phone, password: 'Karachi-2026b' })).status).toBe(200);
  });

  it('keeps one wishlist row per variant (REQ-15)', async () => {
    const customer = await registerCustomer(app);
    phones.push(customer.phone);

    const added = await post('/customers/me/wishlist', { variantId }, customer.token);
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data.product.slug).toBe(productSlug);
    expect(added.body.data.price).toBe('54999.00');

    expect((await post('/customers/me/wishlist', { variantId }, customer.token)).status).toBe(201);
    const list = await get('/customers/me/wishlist', customer.token);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.totalItems).toBe(1);

    expect((await post('/customers/me/wishlist', { variantId: 'missing' }, customer.token)).status).toBe(404);
    expect((await del(`/customers/me/wishlist/${variantId}`, customer.token)).status).toBe(200);
    expect((await del(`/customers/me/wishlist/${variantId}`, customer.token)).status).toBe(404);
    expect((await get('/customers/me/wishlist', customer.token)).body.data).toHaveLength(0);
  });

  function addressBody(label: string) {
    return {
      label,
      recipientName: 'Ayesha Khan',
      phone: '0300 123 4567',
      province: 'Punjab',
      city: 'Lahore',
      area: 'DHA Phase 5',
      addressLine: 'House 12, Street 4',
    };
  }

  async function cleanup(prisma: PrismaService) {
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e34-' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e34-' } } });
    await prisma.brand.deleteMany({ where: { slug: { startsWith: 'e2e34-' } } });
  }
});

function server() {
  return request(app.getHttpServer());
}

/** The next code in sequence: a wrong but well-formed OTP. */
function nextCode(code: string): string {
  return `${(Number(code) + 1) % 1_000_000}`.padStart(6, '0');
}

function post(path: string, body: unknown, token?: string) {
  const req = server().post(`/api/v1${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`).send(body) : req.send(body);
}

function patch(path: string, token: string, body: unknown) {
  return server().patch(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send(body);
}

function get(path: string, token: string) {
  return server().get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
}

function del(path: string, token: string) {
  return server().delete(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
}

async function adminPost(path: string, token: string, body: unknown) {
  const res = await server().post(`/api/v1/admin${path}`).set('Authorization', `Bearer ${token}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}
