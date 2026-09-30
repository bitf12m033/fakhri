import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { deleteAdmins } from './support/admin';
import { deleteCustomers, RATE_LIMIT_SCOPES, registerCustomer, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture } from './support/purchase';

let app: INestApplication;

/** Coupons end to end (increment 3.7): REQ-22/32. */
describe('Coupons (e2e)', () => {
  const run = `e2e37a-${Date.now()}`;
  const codes: string[] = [];
  const phones: string[] = [];
  const adminIds: string[] = [];
  let fx: PurchaseFixture;
  let productId: string;
  let categoryId: string;
  let brandId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    const prisma = app.get(PrismaService);
    await cleanupCoupons(prisma);
    await cleanupPurchase(prisma, run);
    fx = await seedPurchaseFixture(app, run, { onHand: 60 });
    adminIds.push(fx.adminId);
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fx.variantId },
      include: { product: { select: { id: true, categoryId: true, brandId: true } } },
    });
    productId = variant.product.id;
    categoryId = variant.product.categoryId;
    brandId = variant.product.brandId;
  }, 90_000);

  beforeEach(async () => {
    await resetRateLimits(app, [RATE_LIMIT_SCOPES.checkout, RATE_LIMIT_SCOPES.register]);
  });

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await cleanupPurchase(prisma, run);
    await cleanupCoupons(prisma);
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('manages coupons and refuses terms that cannot work (REQ-32)', async () => {
    const created = await admin().post('/api/v1/admin/coupons').send(coupon('flat'));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ code: `${prefix('flat')}`, type: 'FIXED', timesUsed: 0 });

    const duplicate = await admin().post('/api/v1/admin/coupons').send(coupon('flat'));
    expect(duplicate.status).toBe(409);

    const tooMuch = await admin()
      .post('/api/v1/admin/coupons')
      .send({ ...coupon('pct'), type: 'PERCENT', value: '120' });
    expect(tooMuch.status).toBe(400);

    const noTargets = await admin()
      .post('/api/v1/admin/coupons')
      .send({ ...coupon('scoped'), appliesTo: 'BRAND' });
    expect(noTargets.status).toBe(400);

    const backwards = await admin()
      .post('/api/v1/admin/coupons')
      .send({ ...coupon('window'), validFrom: '2026-06-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' });
    expect(backwards.status).toBe(400);

    const badCode = await admin().post('/api/v1/admin/coupons').send({ ...coupon('x'), code: 'no!' });
    expect(badCode.status).toBe(400);

    const listed = await admin().get(`/api/v1/admin/coupons?q=${prefix('flat')}`);
    expect(listed.body.data.map((row: { code: string }) => row.code)).toContain(prefix('flat'));

    const toggled = await admin()
      .patch(`/api/v1/admin/coupons/${created.body.data.id}`)
      .send({ isActive: false });
    expect(toggled.body.data.isActive).toBe(false);
    await admin().patch(`/api/v1/admin/coupons/${created.body.data.id}`).send({ isActive: true });

    const removed = await admin().delete(`/api/v1/admin/coupons/${created.body.data.id}`);
    expect(removed.status).toBe(200);
    codes.splice(codes.indexOf(prefix('flat')), 1);
  });

  it('previews a code on the cart and explains a rejection (REQ-22)', async () => {
    await createCoupon('cart', { type: 'FIXED', value: '5000.00' });
    const token = `${run}-cart`;
    await addToCart(token, 1);

    const applied = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('cart') });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect(applied.body.data.coupon).toMatchObject({ code: prefix('cart'), discount: '5000.00', freeShipping: false });
    expect(applied.body.data.discountTotal).toBe('5000.00');

    const nonsense = await cart(token).post('/api/v1/cart/coupon').send({ code: `${run}-nope`.toUpperCase() });
    expect(nonsense.status).toBe(400);
    expect(nonsense.body.error.code).toBe('COUPON_INVALID');
    // The rejected code did not replace the good one.
    expect((await cart(token).get('/api/v1/cart')).body.data.coupon.code).toBe(prefix('cart'));

    await createCoupon('rich', { type: 'FIXED', value: '100.00', minOrderValue: '999999.00' });
    const tooSmall = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('rich') });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error.details.minOrderValue).toBe('999999.00');

    const cleared = await cart(token).delete('/api/v1/cart/coupon');
    expect(cleared.body.data.coupon).toBeNull();
    expect(cleared.body.data.discountTotal).toBe('0.00');
  });

  it('reports an applied code that stopped qualifying instead of failing the cart', async () => {
    const created = await createCoupon('stale', { type: 'FIXED', value: '1000.00' });
    const token = `${run}-stale`;
    await addToCart(token, 1);
    await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('stale') });

    await admin().patch(`/api/v1/admin/coupons/${created.id}`).send({ isActive: false });
    const view = await cart(token).get('/api/v1/cart');
    expect(view.status).toBe(200);
    expect(view.body.data.coupon).toBeNull();
    expect(view.body.data.couponIssue).toContain('no longer available');
    expect(view.body.data.discountTotal).toBe('0.00');
  });

  it('discounts the order and records the redemption (REQ-22)', async () => {
    const created = await createCoupon('order', { type: 'PERCENT', value: '10', maxDiscount: '4000.00' });
    const prisma = app.get(PrismaService);
    const token = `${run}-order`;
    await addToCart(token, 1);
    await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('order') });

    const placed = await checkout(token, `${run}-key-order`);
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    // 54999 items, 10% capped at 4000, store pickup so no delivery fee.
    expect(placed.body.data).toMatchObject({
      itemsTotal: '54999.00',
      discountTotal: '4000.00',
      deliveryFee: '0.00',
      grandTotal: '50999.00',
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { refNumber: placed.body.data.refNumber } });
    expect(order.couponId).toBe(created.id);
    const usage = await prisma.couponUsage.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(usage.discount.toFixed(2)).toBe('4000.00');

    const stats = await admin().get(`/api/v1/admin/coupons/${created.id}`);
    expect(stats.body.data).toMatchObject({ timesUsed: 1, totalDiscount: '4000.00' });

    // A redeemed coupon cannot be deleted, only deactivated.
    const blocked = await admin().delete(`/api/v1/admin/coupons/${created.id}`);
    expect(blocked.status).toBe(409);
  });

  it('waives the delivery fee for a free-shipping coupon (REQ-22)', async () => {
    await createCoupon('ship', { type: 'FREE_SHIPPING', value: '0' });
    const token = `${run}-ship`;
    await addToCart(token, 1);
    await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('ship') });

    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', token)
      .set('Idempotency-Key', `${run}-key-ship`)
      .send({
        deliveryType: 'HOME_DELIVERY',
        paymentMethod: 'COD',
        guestPhone: '03001234567',
        address: {
          recipientName: 'Guest',
          phone: '03001234567',
          province: 'Punjab',
          city: 'Lahore',
          addressLine: 'House 1, Street 1',
        },
      });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body.data).toMatchObject({
      discountTotal: '0.00',
      deliveryFee: '0.00', // would be 500 without the coupon
      grandTotal: '54999.00',
    });
  });

  it('scopes a coupon to a brand and to a category subtree (REQ-22)', async () => {
    const token = `${run}-scope`;
    await addToCart(token, 1);

    await createCoupon('brandok', { appliesTo: 'BRAND', appliesIds: [brandId] });
    const onBrand = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('brandok') });
    expect(onBrand.status, JSON.stringify(onBrand.body)).toBe(201);
    expect(onBrand.body.data.coupon.discount).toBe('500.00');

    await createCoupon('brandno', { appliesTo: 'BRAND', appliesIds: ['some-other-brand'] });
    const wrongBrand = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('brandno') });
    expect(wrongBrand.status).toBe(400);
    expect(wrongBrand.body.error.message).toContain('does not apply');

    await createCoupon('prodok', { appliesTo: 'PRODUCT', appliesIds: [productId] });
    expect((await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('prodok') })).status).toBe(201);

    // A coupon on a parent category reaches products in its children, because the
    // service expands the category to its whole subtree.
    const parent = await admin()
      .post('/api/v1/admin/categories')
      .send({ name: `Parent ${run}`, slug: `${run}-parent-cat` });
    expect(parent.status).toBe(201);
    const reparented = await admin()
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .send({ parentId: parent.body.data.id });
    expect(reparented.status).toBe(200);

    await createCoupon('parentcat', { appliesTo: 'CATEGORY', appliesIds: [parent.body.data.id] });
    const onParent = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('parentcat') });
    expect(onParent.status, JSON.stringify(onParent.body)).toBe(201);
    expect(onParent.body.data.coupon.code).toBe(prefix('parentcat'));
  });

  it('honours the per-customer limit and the overall limit', async () => {
    await createCoupon('once', { type: 'FIXED', value: '500.00', perCustomerLimit: 1, usageLimit: 5 });
    const customer = await registerCustomer(app);
    phones.push(customer.phone);

    for (const attempt of [1, 2]) {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ variantId: fx.variantId, quantity: 1 });
      const applied = await request(app.getHttpServer())
        .post('/api/v1/cart/coupon')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ code: prefix('once') });

      if (attempt === 1) {
        expect(applied.status).toBe(201);
        const placed = await request(app.getHttpServer())
          .post('/api/v1/checkout')
          .set('Authorization', `Bearer ${customer.token}`)
          .set('Idempotency-Key', `${run}-key-once-${attempt}`)
          .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD' });
        expect(placed.status, JSON.stringify(placed.body)).toBe(201);
        expect(placed.body.data.discountTotal).toBe('500.00');
      } else {
        // The cap is reported when the code is applied, before checkout.
        expect(applied.status).toBe(400);
        expect(applied.body.error.code).toBe('COUPON_LIMIT');
      }
    }
  });

  it('gives the last redemption to exactly one of two simultaneous checkouts', async () => {
    await createCoupon('last', { type: 'FIXED', value: '1000.00', usageLimit: 1 });
    const prisma = app.get(PrismaService);

    const tokens = [`${run}-race-a`, `${run}-race-b`];
    for (const token of tokens) {
      await addToCart(token, 1);
      const applied = await cart(token).post('/api/v1/cart/coupon').send({ code: prefix('last') });
      expect(applied.status).toBe(201);
    }

    const results = await Promise.all(tokens.map((token, index) => checkout(token, `${run}-key-last-${index}`)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    const rejected = results.find((res) => res.status !== 201);
    expect(rejected?.status).toBe(400);
    expect(rejected?.body.error.code).toBe('COUPON_LIMIT');

    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { code: prefix('last') },
      include: { _count: { select: { usages: true } } },
    });
    expect(coupon._count.usages).toBe(1);
  });

  function prefix(name: string): string {
    return `${run}-${name}`.toUpperCase();
  }

  function coupon(name: string) {
    return {
      code: prefix(name),
      type: 'FIXED' as const,
      value: '500.00',
      validFrom: '2026-01-01T00:00:00Z',
    };
  }

  async function createCoupon(name: string, overrides: Record<string, unknown>) {
    const res = await admin()
      .post('/api/v1/admin/coupons')
      .send({ ...coupon(name), ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    codes.push(prefix(name));
    return res.body.data as { id: string; code: string };
  }

  function admin() {
    const agent = request(app.getHttpServer());
    const auth = `Bearer ${fx.adminToken}`;
    return {
      get: (path: string) => agent.get(path).set('Authorization', auth),
      post: (path: string) => agent.post(path).set('Authorization', auth),
      patch: (path: string) => agent.patch(path).set('Authorization', auth),
      delete: (path: string) => agent.delete(path).set('Authorization', auth),
    };
  }

  function cart(token: string) {
    const agent = request(app.getHttpServer());
    return {
      get: (path: string) => agent.get(path).set('X-Cart-Token', token),
      post: (path: string) => agent.post(path).set('X-Cart-Token', token),
      delete: (path: string) => agent.delete(path).set('X-Cart-Token', token),
    };
  }

  async function addToCart(token: string, quantity: number) {
    const res = await cart(token).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }

  function checkout(token: string, key: string) {
    return request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', token)
      .set('Idempotency-Key', key)
      .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD', guestPhone: '03001234567' });
  }

  async function cleanupCoupons(prisma: PrismaService) {
    await prisma.couponUsage.deleteMany({ where: { coupon: { code: { startsWith: 'E2E37A-' } } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: 'E2E37A-' } } });
  }
});
