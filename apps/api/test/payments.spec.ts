import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MockPaymentGateway } from '../src/modules/payments/gateway';
import { deleteAdmins } from './support/admin';
import { deleteCustomers, RATE_LIMIT_SCOPES, registerCustomer, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture } from './support/purchase';

let app: INestApplication;
let gateway: MockPaymentGateway;

/** Online payments through the mock gateway (increment 3.6): REQ-21. */
describe('Payments (e2e)', () => {
  const run = `e2e36a-${Date.now()}`;
  const phones: string[] = [];
  const adminIds: string[] = [];
  let fx: PurchaseFixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    gateway = app.get(MockPaymentGateway);
    await cleanupPurchase(app.get(PrismaService), run);
    fx = await seedPurchaseFixture(app, run, { onHand: 40 });
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

  it('opens a gateway session, reuses it, and confirms the order when the callback lands', async () => {
    const order = await placeOnlineOrder(`${run}-happy`);

    const session = await initiate(order.paymentId, { refNumber: order.ref, guestPhone: GUEST_PHONE });
    expect(session.status, JSON.stringify(session.body)).toBe(200);
    expect(session.body.data).toMatchObject({ gateway: 'mock' });
    expect(session.body.data.redirectUrl).toContain(session.body.data.gatewayRef);
    expect(session.body.data.gatewayRef).toMatch(/^MOCK-[0-9A-F]{16}$/);

    // Asking again while the session is live returns the same one.
    const again = await initiate(order.paymentId, { refNumber: order.ref, guestPhone: GUEST_PHONE });
    expect(again.body.data.gatewayRef).toBe(session.body.data.gatewayRef);

    const paid = await callback({ ref: session.body.data.gatewayRef, status: 'SUCCEEDED', amount: order.amount });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.data).toMatchObject({ status: 'SUCCEEDED', duplicate: false });

    const prisma = app.get(PrismaService);
    const stored = await prisma.order.findUniqueOrThrow({
      where: { refNumber: order.ref },
      include: { payments: true, history: true },
    });
    expect(stored.paymentStatus).toBe('SUCCEEDED');
    expect(stored.payments[0]?.paidAt).toBeTruthy();
    // Money in confirms the order, and the transition is recorded like any other.
    expect(stored.status).toBe('CONFIRMED');
    expect(stored.history.map((entry) => entry.status)).toEqual(['PENDING', 'CONFIRMED']);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: stored.payments[0]!.id } });
    expect(events.map((event) => event.type)).toEqual(['PAYMENT_SUCCEEDED']);

    // Providers retry: a replay must not change anything.
    const replay = await callback({ ref: session.body.data.gatewayRef, status: 'SUCCEEDED', amount: order.amount });
    expect(replay.status).toBe(200);
    expect(replay.body.data.duplicate).toBe(true);
    const after = await prisma.order.findUniqueOrThrow({
      where: { refNumber: order.ref },
      include: { history: true },
    });
    expect(after.history).toHaveLength(2);
  });

  it('rejects callbacks that are unsigned, unknown or for the wrong amount', async () => {
    const order = await placeOnlineOrder(`${run}-bad`);
    const session = await initiate(order.paymentId, { refNumber: order.ref, guestPhone: GUEST_PHONE });
    const ref = session.body.data.gatewayRef as string;

    const unsigned = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mock')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ref, status: 'SUCCEEDED', amount: order.amount }));
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.error.code).toBe('UNAUTHENTICATED');

    const wrongSignature = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mock')
      .set('Content-Type', 'application/json')
      .set('x-signature', 'deadbeef')
      .send(JSON.stringify({ ref, status: 'SUCCEEDED', amount: order.amount }));
    expect(wrongSignature.status).toBe(401);

    // Signed, but for a body that was not the one signed.
    const tampered = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mock')
      .set('Content-Type', 'application/json')
      .set('x-signature', gateway.sign(JSON.stringify({ ref, status: 'SUCCEEDED', amount: order.amount })))
      .send(JSON.stringify({ ref, status: 'SUCCEEDED', amount: '1.00' }));
    expect(tampered.status).toBe(401);

    expect((await callback({ ref: 'MOCK-DOESNOTEXIST', status: 'SUCCEEDED', amount: order.amount })).status).toBe(404);

    const mismatch = await callback({ ref, status: 'SUCCEEDED', amount: '1.00' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.details).toMatchObject({ expected: order.amount, received: '1.00' });

    expect((await callback({ ref, status: 'PARTIAL', amount: order.amount })).status).toBe(400);

    // An unknown gateway is resolved before the signature is even looked at.
    const unknownGateway = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/nosuch')
      .set('Content-Type', 'application/json')
      .set('x-signature', 'irrelevant')
      .send(JSON.stringify({ ref, status: 'SUCCEEDED', amount: order.amount }));
    expect(unknownGateway.status).toBe(404);
  });

  it('records a failed payment without confirming the order, and will not then succeed', async () => {
    const order = await placeOnlineOrder(`${run}-failed`);
    const session = await initiate(order.paymentId, { refNumber: order.ref, guestPhone: GUEST_PHONE });
    const ref = session.body.data.gatewayRef as string;

    const failed = await callback({ ref, status: 'FAILED', amount: order.amount });
    expect(failed.status).toBe(200);
    expect(failed.body.data.status).toBe('FAILED');

    const stored = await app.get(PrismaService).order.findUniqueOrThrow({ where: { refNumber: order.ref } });
    expect(stored.paymentStatus).toBe('FAILED');
    expect(stored.status).toBe('PENDING'); // the buyer can still pay another way

    const late = await callback({ ref, status: 'SUCCEEDED', amount: order.amount });
    expect(late.status).toBe(409);
    expect(late.body.error.details).toMatchObject({ from: 'FAILED', to: 'SUCCEEDED' });
  });

  it('lets only the order owner start a payment', async () => {
    const order = await placeOnlineOrder(`${run}-auth`);

    expect((await initiate(order.paymentId, {})).status).toBe(400);
    expect((await initiate(order.paymentId, { refNumber: order.ref, guestPhone: '03009999999' })).status).toBe(404);
    expect((await initiate(order.paymentId, { refNumber: 'FK-000000-000000', guestPhone: GUEST_PHONE })).status).toBe(404);
    expect((await initiate('missing-payment', { refNumber: order.ref, guestPhone: GUEST_PHONE })).status).toBe(404);

    // A customer's order cannot be paid by a guest claim, nor by another customer.
    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    const owned = await placeOnlineOrder(`${run}-owned`, customer.token);
    expect((await initiate(owned.paymentId, { refNumber: owned.ref, guestPhone: customer.phone })).status).toBe(401);

    const stranger = await registerCustomer(app);
    phones.push(stranger.phone);
    const asStranger = await request(app.getHttpServer())
      .post(`/api/v1/payments/${owned.paymentId}/initiate`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({});
    expect(asStranger.status).toBe(404);

    const asOwner = await request(app.getHttpServer())
      .post(`/api/v1/payments/${owned.paymentId}/initiate`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({});
    expect(asOwner.status).toBe(200);
  });

  it('refuses to take a cash-on-delivery payment online', async () => {
    const cod = await placeOrder(`${run}-cod`, 'COD');
    const res = await initiate(cod.paymentId, { refNumber: cod.ref, guestPhone: GUEST_PHONE });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('courier');
  });

  it('lets an operator settle or void a payment by hand (REQ-31)', async () => {
    const prisma = app.get(PrismaService);
    const cod = await placeOrder(`${run}-manual`, 'COD');
    const order = await prisma.order.findUniqueOrThrow({ where: { refNumber: cod.ref } });

    // A COD payment cannot jump onto the online path.
    const wrongPath = await admin().patch(`/api/v1/admin/orders/${order.id}/payment-status`).send({ status: 'SUCCEEDED' });
    expect(wrongPath.status).toBe(409);

    const collected = await admin()
      .patch(`/api/v1/admin/orders/${order.id}/payment-status`)
      .send({ status: 'COLLECTED', note: 'Paid at the counter', reference: 'RCPT-1' });
    expect(collected.status, JSON.stringify(collected.body)).toBe(200);
    expect(collected.body.data[0]).toMatchObject({ status: 'COLLECTED', method: 'COD' });

    const settled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(settled.paymentStatus).toBe('COLLECTED');
    expect(settled.status).toBe('CONFIRMED');

    expect((await admin().patch(`/api/v1/admin/orders/${order.id}/payment-status`).send({ status: 'COLLECTED' })).status).toBe(409);
  });

  const GUEST_PHONE = '03001234567';

  function admin() {
    const agent = request(app.getHttpServer());
    return { patch: (path: string) => agent.patch(path).set('Authorization', `Bearer ${fx.adminToken}`) };
  }

  function initiate(paymentId: string, body: unknown) {
    return request(app.getHttpServer()).post(`/api/v1/payments/${paymentId}/initiate`).send(body);
  }

  /** Signs the exact bytes, the way a real provider does. */
  function callback(payload: Record<string, string>) {
    const raw = JSON.stringify(payload);
    return request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mock')
      .set('Content-Type', 'application/json')
      .set('x-signature', gateway.sign(raw))
      .send(raw);
  }

  async function placeOnlineOrder(key: string, customerToken?: string) {
    return placeOrder(key, 'CARD', customerToken);
  }

  async function placeOrder(key: string, method: string, customerToken?: string) {
    const cartToken = `${key}-cart`;
    const addItem = request(app.getHttpServer()).post('/api/v1/cart/items');
    const added = await (customerToken
      ? addItem.set('Authorization', `Bearer ${customerToken}`)
      : addItem.set('X-Cart-Token', cartToken)
    ).send({ variantId: fx.variantId, quantity: 1 });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const checkout = request(app.getHttpServer()).post('/api/v1/checkout').set('Idempotency-Key', key);
    const placed = await (customerToken
      ? checkout.set('Authorization', `Bearer ${customerToken}`).send({ deliveryType: 'STORE_PICKUP', paymentMethod: method })
      : checkout.set('X-Cart-Token', cartToken).send({ deliveryType: 'STORE_PICKUP', paymentMethod: method, guestPhone: GUEST_PHONE })
    );
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    return {
      ref: placed.body.data.refNumber as string,
      paymentId: placed.body.data.payment.id as string,
      amount: placed.body.data.grandTotal as string,
    };
  }
});
