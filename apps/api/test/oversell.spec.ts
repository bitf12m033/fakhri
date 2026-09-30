import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { deleteAdmins } from './support/admin';
import { RATE_LIMIT_SCOPES, resetRateLimits } from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture, stockOf } from './support/purchase';

let app: INestApplication;

/**
 * Oversell correctness suite (REQ-37, REQ-23). The point of these tests is
 * concurrency: many checkouts race for the same units and the stock must come
 * out exactly right, with no order existing without its reservation.
 */
describe('Concurrent checkout does not oversell (e2e)', () => {
  const run = `e2e35c-${Date.now()}`;
  const adminIds: string[] = [];
  let fx: PurchaseFixture;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();
    await cleanupPurchase(app.get(PrismaService), run);
    fx = await seedPurchaseFixture(app, run, { onHand: 1 });
    adminIds.push(fx.adminId);
  }, 90_000);

  beforeEach(async () => {
    await resetRateLimits(app, [RATE_LIMIT_SCOPES.checkout, RATE_LIMIT_SCOPES.register]);
  });

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await cleanupPurchase(prisma, run);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('gives the last unit to exactly one of ten simultaneous buyers', async () => {
    const prisma = app.get(PrismaService);
    expect((await stockOf(prisma, fx.variantId)).available).toBe(1);

    const buyers = await Promise.all(
      Array.from({ length: 10 }, (_, index) => fillCart(`${run}-race1-${index}`, 1)),
    );
    const results = await Promise.all(buyers.map((token) => place(token, `${run}-race1-${token}`)));

    const placed = results.filter((res) => res.status === 201);
    const rejected = results.filter((res) => res.status !== 201);
    expect(placed).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(rejected.every((res) => res.status === 409 && res.body.error.code === 'OUT_OF_STOCK')).toBe(true);

    const after = await stockOf(prisma, fx.variantId);
    expect(after).toEqual({ onHand: 1, reserved: 1, available: 0 });

    // Exactly one order, and it holds exactly one reservation.
    const orders = await prisma.order.findMany({ where: { items: { some: { variantId: fx.variantId } } } });
    expect(orders).toHaveLength(1);
    const ledger = await prisma.stockLedger.findMany({ where: { refType: 'Order', refId: orders[0]!.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'RESERVATION', quantity: 1 });
  });

  it('hands out exactly the stock that exists when more buyers than units arrive', async () => {
    const prisma = app.get(PrismaService);
    await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({ warehouseId: fx.warehouseId, variantId: fx.variantId, quantity: 5, reason: 'Restock for the race' });
    const before = await stockOf(prisma, fx.variantId);
    expect(before.available).toBe(5);

    const buyers = await Promise.all(
      Array.from({ length: 12 }, (_, index) => fillCart(`${run}-race2-${index}`, 1)),
    );
    const results = await Promise.all(buyers.map((token) => place(token, `${run}-race2-${token}`)));

    expect(results.filter((res) => res.status === 201)).toHaveLength(5);
    const rejected = results.filter((res) => res.status !== 201);
    expect(rejected).toHaveLength(7);
    expect(rejected.every((res) => res.body.error.code === 'OUT_OF_STOCK')).toBe(true);

    const after = await stockOf(prisma, fx.variantId);
    expect(after.reserved).toBe(before.reserved + 5);
    expect(after.available).toBe(0);
    expect(after.onHand).toBe(before.onHand);
  });

  it('converts a cart once even when two checkouts race on it', async () => {
    const prisma = app.get(PrismaService);
    await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({ warehouseId: fx.warehouseId, variantId: fx.variantId, quantity: 4, reason: 'Restock for the cart race' });

    const token = await fillCart(`${run}-race3`, 1);
    const [first, second] = await Promise.all([
      place(token, `${run}-race3-key-a`),
      place(token, `${run}-race3-key-b`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const cart = await prisma.cart.findFirstOrThrow({ where: { token } });
    expect(cart.status).toBe('CONVERTED');
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it('places one order when the same Idempotency-Key is sent twice at once', async () => {
    const prisma = app.get(PrismaService);
    const token = await fillCart(`${run}-race4`, 1);
    const key = `${run}-race4-key`;

    const results = await Promise.all([place(token, key), place(token, key)]);
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);

    const claimed = await prisma.idempotencyKey.findMany({ where: { key } });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('COMPLETED');
  });

  it('never leaves an inventory row in an impossible state', async () => {
    const rows = await app.get(PrismaService).inventoryItem.findMany({ where: { variantId: fx.variantId } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.onHand, 'onHand must not go negative').toBeGreaterThanOrEqual(0);
      expect(row.reserved, 'reserved must not go negative').toBeGreaterThanOrEqual(0);
      expect(row.reserved, 'reserved must never exceed onHand').toBeLessThanOrEqual(row.onHand);
    }
  });

  function admin() {
    const agent = request(app.getHttpServer());
    return { post: (path: string) => agent.post(path).set('Authorization', `Bearer ${fx.adminToken}`) };
  }

  /** One guest cart holding `quantity` of the contested variant. */
  async function fillCart(token: string, quantity: number): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('X-Cart-Token', token)
      .send({ variantId: fx.variantId, quantity });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return token;
  }

  function place(cartToken: string, key: string) {
    return request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', cartToken)
      .set('Idempotency-Key', key)
      .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD', guestPhone: '03001234567' });
  }
});
