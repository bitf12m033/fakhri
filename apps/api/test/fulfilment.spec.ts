import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { deleteAdmins } from './support/admin';
import { deleteCustomers, RATE_LIMIT_SCOPES, registerCustomer, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture, stockOf } from './support/purchase';

let app: INestApplication;

/** Shipments, printed documents and outbox-driven notifications (increment 3.6). */
describe('Fulfilment (e2e)', () => {
  const run = `e2e36b-${Date.now()}`;
  const phones: string[] = [];
  const adminIds: string[] = [];
  let fx: PurchaseFixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    const prisma = app.get(PrismaService);
    await cleanupPurchase(prisma, run);
    // Residue from earlier runs: the dispatcher works oldest-first, so a backlog
    // would keep this spec's own events from ever being claimed.
    await prisma.outboxEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60_000) } } });
    fx = await seedPurchaseFixture(app, run, { onHand: 30 });
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

  it('will not ship an order that is not packed, or one collected in person', async () => {
    const pending = await placeGuestOrder(`${run}-nopack`, 'HOME_DELIVERY');
    const tooEarly = await admin().put(`/api/v1/admin/orders/${pending.id}/shipment`).send({ carrier: 'TCS' });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.details).toMatchObject({ orderStatus: 'PENDING' });

    const pickup = await placeGuestOrder(`${run}-pickup`, 'STORE_PICKUP');
    await transition(pickup.id, 'CONFIRMED');
    await transition(pickup.id, 'PACKED');
    const noShipment = await admin().put(`/api/v1/admin/orders/${pickup.id}/shipment`).send({ carrier: 'TCS' });
    expect(noShipment.status).toBe(409);
    expect(noShipment.body.error.message).toContain('in person');

    expect((await admin().get(`/api/v1/admin/orders/${pickup.id}/shipment`)).status).toBe(404);
  });

  it('tracks a parcel and moves the order with it (REQ-31)', async () => {
    const prisma = app.get(PrismaService);
    const order = await placeGuestOrder(`${run}-track`, 'HOME_DELIVERY', 2);
    await transition(order.id, 'CONFIRMED');
    await transition(order.id, 'PACKED');
    const reserved = await stockOf(prisma, fx.variantId);

    const created = await admin()
      .put(`/api/v1/admin/orders/${order.id}/shipment`)
      .send({ carrier: 'TCS', trackingCode: `${run}-TRACK` });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.data).toMatchObject({ carrier: 'TCS', status: 'PENDING' });
    expect(created.body.data.events).toHaveLength(1);

    // Skipping ahead is refused by the shipment machine.
    expect((await event(order.id, 'DELIVERED')).status).toBe(409);

    const scheduled = await event(order.id, 'PICKUP_SCHEDULED', 'Lahore hub');
    expect(scheduled.status).toBe(201);
    expect(await stockOf(prisma, fx.variantId)).toEqual(reserved); // still only reserved

    const inTransit = await event(order.id, 'IN_TRANSIT', 'Lahore hub');
    expect(inTransit.status, JSON.stringify(inTransit.body)).toBe(201);
    const afterShip = await stockOf(prisma, fx.variantId);
    expect(afterShip.onHand).toBe(reserved.onHand - 2);
    expect(afterShip.reserved).toBe(reserved.reserved - 2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SHIPPED');

    const delivered = await event(order.id, 'DELIVERED', 'Customer address');
    expect(delivered.status).toBe(201);
    const settled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(settled.status).toBe('DELIVERED');
    expect(settled.paymentStatus).toBe('COLLECTED'); // COD collected on delivery
    expect(settled.codConfirmation).toBe(true);
    expect(delivered.body.data.events.map((entry: { status: string }) => entry.status)).toEqual([
      'PENDING', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'DELIVERED',
    ]);

    // The customer's own order view carries the tracking details.
    const customerView = await admin().get(`/api/v1/admin/orders/${order.id}`);
    expect(customerView.body.data.shipment).toMatchObject({ carrier: 'TCS', status: 'DELIVERED' });
  });

  it('will not mark a parcel in transit while the order is unpacked', async () => {
    const order = await placeGuestOrder(`${run}-unpacked`, 'HOME_DELIVERY');
    await transition(order.id, 'CONFIRMED');
    await transition(order.id, 'PACKED');
    await admin().put(`/api/v1/admin/orders/${order.id}/shipment`).send({ carrier: 'TCS' });
    // Cancel the order underneath the shipment, then try to move the parcel.
    await transition(order.id, 'CANCELLED');

    const res = await event(order.id, 'IN_TRANSIT');
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ orderStatus: 'CANCELLED' });
  });

  it('produces a label, an invoice and a packing list (REQ-31/REQ-40)', async () => {
    const order = await placeGuestOrder(`${run}-docs`, 'HOME_DELIVERY');
    await transition(order.id, 'CONFIRMED');
    await transition(order.id, 'PACKED');
    await admin().put(`/api/v1/admin/orders/${order.id}/shipment`).send({ carrier: 'Leopards', trackingCode: 'LEO-1' });

    const label = await admin().get(`/api/v1/admin/orders/${order.id}/shipment/label`);
    expect(label.status).toBe(200);
    expect(label.body.data).toMatchObject({ carrier: 'Leopards', trackingCode: 'LEO-1', pieces: 1 });
    expect(label.body.data.collectOnDelivery).toBe(order.grandTotal); // COD still outstanding
    expect(label.body.data.weightKg).toBe('12.500');
    expect(label.body.data.from.name).toBeTruthy();

    const invoice = await admin().get(`/api/v1/admin/orders/${order.id}/invoice`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.data.invoiceNumber).toBe(`${order.ref}-INV`);
    expect(invoice.body.data.seller.ntn).toBeTruthy();
    expect(invoice.body.data.lines[0]).toMatchObject({ sku: fx.sku, quantity: 1 });
    expect(invoice.body.data.totals).toMatchObject({ grandTotal: order.grandTotal, salesTax: '0.00' });
    expect(invoice.body.data.pricesIncludeTax).toBe(true);
    expect(invoice.body.data.buyer.phone).toBe('+923001234567');

    const packing = await admin().get(`/api/v1/admin/orders/${order.id}/packing-list`);
    expect(packing.status).toBe(200);
    expect(packing.body.data.lines[0]).toMatchObject({ sku: fx.sku, quantity: 1 });
    // Pickers do not need prices, so none are on the sheet.
    expect(JSON.stringify(packing.body.data)).not.toContain('unitPrice');
    expect(JSON.stringify(packing.body.data)).not.toContain(order.grandTotal);
  });

  it('delivers notifications from the outbox once, and reports what is stuck (REQ-25)', async () => {
    const prisma = app.get(PrismaService);
    const notifications = app.get(NotificationsService);
    const dispatcher = app.get(OutboxDispatcher);

    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    const email = `${run}-buyer@example.test`;
    await request(app.getHttpServer())
      .patch('/api/v1/customers/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ email, firstName: 'Ayesha' });
    const address = await request(app.getHttpServer())
      .post('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        recipientName: 'Ayesha Khan',
        phone: '03001112233',
        province: 'Punjab',
        city: 'Lahore',
        addressLine: 'House 1, Street 1',
      });

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId: fx.variantId, quantity: 1 });
    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `${run}-notify`)
      .send({ deliveryType: 'HOME_DELIVERY', paymentMethod: 'COD', addressId: address.body.data.id });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({ where: { refNumber: placed.body.data.refNumber } });

    await transition(order.id, 'CONFIRMED');
    await transition(order.id, 'PACKED');
    await admin().put(`/api/v1/admin/orders/${order.id}/shipment`).send({ carrier: 'TCS', trackingCode: 'TCS-77' });
    await event(order.id, 'IN_TRANSIT');

    // Nothing is delivered until the dispatcher runs: the poller is off in tests.
    expect(notifications.sent({ to: customer.phone })).toHaveLength(0);
    const summaryBefore = await admin().get('/api/v1/admin/outbox');
    expect(summaryBefore.status).toBe(200);
    expect(summaryBefore.body.meta ?? summaryBefore.body.data.pending).toBeTruthy();

    await drainUntilPublished(dispatcher, order.id);

    const ours = await prisma.outboxEvent.findMany({ where: { aggregateId: order.id } });
    expect(ours.length).toBeGreaterThanOrEqual(4); // created + confirmed + packed + shipped
    expect(ours.every((row) => row.status === 'PUBLISHED')).toBe(true);
    expect(ours.every((row) => row.publishedAt !== null)).toBe(true);

    const toPhone = notifications.sent({ to: customer.phone });
    const toEmail = notifications.sent({ to: email });
    expect(toPhone.length).toBeGreaterThanOrEqual(4);
    expect(toEmail.length).toBeGreaterThanOrEqual(4);
    expect(toPhone.map((message) => message.event)).toContain('ORDER_CREATED');
    expect(toPhone.some((message) => message.body.includes('confirmed'))).toBe(true);
    // The shipped message carries the tracking details recorded on the shipment.
    const shipped = toPhone.find((message) => message.body.includes('on its way'));
    expect(shipped?.body).toContain('TCS-77');

    // Draining again delivers nothing further.
    const before = notifications.sent().length;
    const second = await dispatcher.drain();
    expect(second.published).toBe(0);
    expect(notifications.sent()).toHaveLength(before);

    const summaryAfter = await admin().get('/api/v1/admin/outbox');
    expect(summaryAfter.body.data.published).toBeGreaterThan(0);
  });

  function admin() {
    const agent = request(app.getHttpServer());
    const auth = `Bearer ${fx.adminToken}`;
    return {
      get: (path: string) => agent.get(path).set('Authorization', auth),
      put: (path: string) => agent.put(path).set('Authorization', auth),
      post: (path: string) => agent.post(path).set('Authorization', auth),
      patch: (path: string) => agent.patch(path).set('Authorization', auth),
    };
  }

  function transition(id: string, status: string) {
    return admin().patch(`/api/v1/admin/orders/${id}/status`).send({ status });
  }

  function event(id: string, status: string, location?: string) {
    return admin().post(`/api/v1/admin/orders/${id}/shipment/events`).send({ status, location });
  }

  /**
   * Other specs enqueue events too, and delivery is oldest-first, so drain until
   * this order's events are through rather than for a fixed number of passes.
   */
  async function drainUntilPublished(dispatcher: OutboxDispatcher, orderId: string): Promise<void> {
    const prisma = app.get(PrismaService);
    for (let pass = 0; pass < 50; pass += 1) {
      const pending = await prisma.outboxEvent.count({
        where: { aggregateId: orderId, status: { not: 'PUBLISHED' } },
      });
      if (pending === 0) return;
      const result = await dispatcher.drain();
      if (result.claimed === 0) return;
    }
  }

  async function placeGuestOrder(key: string, deliveryType: string, quantity = 1) {
    const cartToken = `${key}-cart`;
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('X-Cart-Token', cartToken)
      .send({ variantId: fx.variantId, quantity });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const body: Record<string, unknown> = {
      deliveryType,
      paymentMethod: 'COD',
      guestPhone: '03001234567',
    };
    if (deliveryType === 'HOME_DELIVERY') {
      body.address = {
        recipientName: 'Guest Buyer',
        phone: '03001234567',
        province: 'Punjab',
        city: 'Lahore',
        addressLine: 'House 9, Street 3',
      };
    }
    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', cartToken)
      .set('Idempotency-Key', key)
      .send(body);
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const stored = await app
      .get(PrismaService)
      .order.findUniqueOrThrow({ where: { refNumber: placed.body.data.refNumber } });
    return { id: stored.id, ref: stored.refNumber, grandTotal: placed.body.data.grandTotal as string };
  }
});
