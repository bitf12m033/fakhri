import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins } from './support/admin';
import { deleteCustomers, RATE_LIMIT_SCOPES, registerCustomer, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture, stockOf } from './support/purchase';

let app: INestApplication;

/** Order lifecycle, cancellation and stock ops (increment 3.5): REQ-24/26/27. */
describe('Order lifecycle (e2e)', () => {
  const run = `e2e35b-${Date.now()}`;
  const phones: string[] = [];
  const adminIds: string[] = [];
  let fx: PurchaseFixture;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    await cleanupPurchase(app.get(PrismaService), run);
    fx = await seedPurchaseFixture(app, run, { onHand: 10 });
    adminIds.push(fx.adminId);
  }, 90_000);

  beforeEach(async () => {
    await resetRateLimits(app, [RATE_LIMIT_SCOPES.checkout, RATE_LIMIT_SCOPES.register]);
  });

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await cleanupPurchase(prisma, run);
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('walks an order to delivered, moving stock and collecting COD (REQ-24)', async () => {
    const prisma = app.get(PrismaService);
    const { id, ref } = await placeOrder(`${run}-lifecycle`, 2);
    const reserved = await stockOf(prisma, fx.variantId);

    expect((await transition(id, 'CONFIRMED')).body.data.status).toBe('CONFIRMED');
    expect((await transition(id, 'PACKED')).body.data.status).toBe('PACKED');
    // Still only reserved: nothing has left the warehouse.
    expect(await stockOf(prisma, fx.variantId)).toEqual(reserved);

    const shipped = await transition(id, 'SHIPPED', 'Handed to courier');
    expect(shipped.status).toBe(200);
    const afterShip = await stockOf(prisma, fx.variantId);
    expect(afterShip.onHand).toBe(reserved.onHand - 2);
    expect(afterShip.reserved).toBe(reserved.reserved - 2);

    const delivered = await transition(id, 'DELIVERED');
    expect(delivered.body.data.status).toBe('DELIVERED');
    expect(delivered.body.data.paymentStatus).toBe('COLLECTED');
    expect(delivered.body.data.payment).toMatchObject({ method: 'COD', status: 'COLLECTED' });
    // Delivery does not move stock a second time.
    expect(await stockOf(prisma, fx.variantId)).toEqual(afterShip);

    const detail = await admin().get(`/api/v1/admin/orders/${id}`);
    expect(detail.body.data.codConfirmation).toBe(true);
    expect(detail.body.data.history.map((entry: { status: string }) => entry.status)).toEqual([
      'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED',
    ]);

    const ledger = await prisma.stockLedger.findMany({
      where: { refType: 'Order', refId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger.map((row) => row.type)).toEqual(['RESERVATION', 'SALE']);
    expect(ledger.every((row) => row.quantity === 2)).toBe(true);

    // A delivered order is terminal.
    expect((await transition(id, 'CANCELLED')).status).toBe(409);
    expect((await transition(id, 'SHIPPED')).status).toBe(409);
    expect(ref).toMatch(/^FK-/);
  });

  it('rejects skipped and reversed transitions (REQ-24)', async () => {
    const { id } = await placeOrder(`${run}-invalid`, 1);

    const skip = await transition(id, 'SHIPPED');
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('ORDER_STATUS_INVALID');
    expect(skip.body.error.details).toMatchObject({ from: 'PENDING', to: 'SHIPPED' });

    expect((await transition(id, 'PENDING')).status).toBe(409);
    await transition(id, 'CONFIRMED');
    expect((await transition(id, 'PENDING')).status).toBe(409);
    expect((await transition(id, 'RETURNED')).status).toBe(409);
  });

  it('releases the reservation when an order is cancelled, once (REQ-24)', async () => {
    const prisma = app.get(PrismaService);
    const before = await stockOf(prisma, fx.variantId);
    const { id } = await placeOrder(`${run}-cancel`, 3);
    expect((await stockOf(prisma, fx.variantId)).reserved).toBe(before.reserved + 3);

    const cancelled = await transition(id, 'CANCELLED', 'Customer changed their mind');
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    // Stock is whole again and the COD attempt is voided.
    expect(await stockOf(prisma, fx.variantId)).toEqual(before);
    expect(cancelled.body.data.paymentStatus).toBe('FAILED');

    const ledger = await prisma.stockLedger.findMany({ where: { refType: 'Order', refId: id } });
    expect(ledger.map((row) => row.type).sort()).toEqual(['RESERVATION', 'RESERVATION_RELEASE']);

    // Cancelling again is refused, so stock cannot be released twice.
    expect((await transition(id, 'CANCELLED')).status).toBe(409);
    expect(await stockOf(prisma, fx.variantId)).toEqual(before);
  });

  it('lets a customer cancel only while the order is pending', async () => {
    const prisma = app.get(PrismaService);
    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    const before = await stockOf(prisma, fx.variantId);

    const first = await placeCustomerOrder(customer.token, `${run}-cust-cancel-1`);
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/customers/me/orders/${first.ref}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ note: 'Ordered by mistake' });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await stockOf(prisma, fx.variantId)).toEqual(before);

    const second = await placeCustomerOrder(customer.token, `${run}-cust-cancel-2`);
    await transition(second.id, 'CONFIRMED');
    const tooLate = await request(app.getHttpServer())
      .post(`/api/v1/customers/me/orders/${second.ref}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({});
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.error.code).toBe('ORDER_STATUS_INVALID');

    // Someone else's order is simply not found.
    const stranger = await registerCustomer(app);
    phones.push(stranger.phone);
    const poke = await request(app.getHttpServer())
      .post(`/api/v1/customers/me/orders/${second.ref}/cancel`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({});
    expect(poke.status).toBe(404);
  });

  it('filters the admin order list and keeps it to the ORDERS role', async () => {
    const { ref } = await placeOrder(`${run}-list`, 1);

    const byRef = await admin().get(`/api/v1/admin/orders?q=${ref}`);
    expect(byRef.status).toBe(200);
    expect(byRef.body.data.map((row: { refNumber: string }) => row.refNumber)).toEqual([ref]);
    expect(byRef.body.data[0].contact).toMatchObject({ type: 'GUEST' });

    const pending = await admin().get('/api/v1/admin/orders?status=PENDING&pageSize=5');
    expect(pending.status).toBe(200);
    expect(pending.body.meta.pageSize).toBe(5);
    expect(pending.body.data.every((row: { status: string }) => row.status === 'PENDING')).toBe(true);

    const catalogAdmin = await createAdmin(app, UserRole.CATALOG, 'orders-rbac');
    adminIds.push(catalogAdmin.id);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${catalogAdmin.token}`);
    expect(denied.status).toBe(403);
  });

  it('keeps stock adjustments above what is already reserved (REQ-27)', async () => {
    const prisma = app.get(PrismaService);
    await placeOrder(`${run}-adjust`, 2); // leaves 2 reserved
    const current = await stockOf(prisma, fx.variantId);

    const tooDeep = await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({
        warehouseId: fx.warehouseId,
        variantId: fx.variantId,
        quantity: -(current.onHand - current.reserved + 1),
        reason: 'Damaged in the warehouse',
      });
    expect(tooDeep.status).toBe(409);
    expect(await stockOf(prisma, fx.variantId)).toEqual(current);

    const received = await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({ warehouseId: fx.warehouseId, variantId: fx.variantId, quantity: 4, reason: 'Stock count correction' });
    expect(received.status, JSON.stringify(received.body)).toBe(201);
    expect(received.body.data.onHand).toBe(current.onHand + 4);

    const writeOff = await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({ warehouseId: fx.warehouseId, variantId: fx.variantId, quantity: -4, reason: 'Reversing the correction' });
    expect(writeOff.status).toBe(201);
    expect(await stockOf(prisma, fx.variantId)).toEqual(current);

    const noReason = await admin()
      .post('/api/v1/admin/inventory/adjustments')
      .send({ warehouseId: fx.warehouseId, variantId: fx.variantId, quantity: 1, reason: 'no' });
    expect(noReason.status).toBe(400);

    const ledger = await admin().get(`/api/v1/admin/inventory/ledger?variantId=${fx.variantId}`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.data.some((row: { type: string }) => row.type === 'ADJUSTMENT_IN')).toBe(true);
    expect(ledger.body.data.some((row: { type: string }) => row.type === 'ADJUSTMENT_OUT')).toBe(true);
    expect((await admin().get('/api/v1/admin/inventory/ledger')).status).toBe(400);

    const items = await admin().get(`/api/v1/admin/inventory/items?variantId=${fx.variantId}`);
    expect(items.body.data[0]).toMatchObject({
      sku: fx.sku,
      onHand: current.onHand,
      reserved: current.reserved,
      available: current.onHand - current.reserved,
    });
  });

  function admin() {
    const agent = request(app.getHttpServer());
    const auth = `Bearer ${fx.adminToken}`;
    return {
      get: (path: string) => agent.get(path).set('Authorization', auth),
      post: (path: string) => agent.post(path).set('Authorization', auth),
      patch: (path: string) => agent.patch(path).set('Authorization', auth),
    };
  }

  function transition(id: string, status: string, note?: string) {
    return admin().patch(`/api/v1/admin/orders/${id}/status`).send({ status, note });
  }

  /** Guest order for the stocked variant, returning its id and reference. */
  async function placeOrder(key: string, quantity: number): Promise<{ id: string; ref: string }> {
    const token = `${key}-cart`;
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('X-Cart-Token', token)
      .send({ variantId: fx.variantId, quantity });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', token)
      .set('Idempotency-Key', key)
      .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD', guestPhone: '03001234567' });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const ref = placed.body.data.refNumber as string;
    const order = await app.get(PrismaService).order.findUniqueOrThrow({ where: { refNumber: ref } });
    return { id: order.id, ref };
  }

  async function placeCustomerOrder(token: string, key: string): Promise<{ id: string; ref: string }> {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: fx.variantId, quantity: 1 });
    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD' });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const ref = placed.body.data.refNumber as string;
    const order = await app.get(PrismaService).order.findUniqueOrThrow({ where: { refNumber: ref } });
    return { id: order.id, ref };
  }
});
