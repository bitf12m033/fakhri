import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { deleteAdmins } from './support/admin';
import { deleteCustomers, RATE_LIMIT_SCOPES, registerCustomer, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture, stockOf } from './support/purchase';

let app: INestApplication;

/** Cart and checkout (increment 3.5): REQ-18/19/20/23. Needs postgres + redis. */
describe('Cart and checkout (e2e)', () => {
  const run = `e2e35a-${Date.now()}`;
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
    fx = await seedPurchaseFixture(app, run, { onHand: 5 });
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

  it('keeps a guest cart under a token and totals it server-side (REQ-18)', async () => {
    const token = `${run}-guest-1`;
    const empty = await cart(token).get('/api/v1/cart');
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ id: null, itemCount: 0, itemsTotal: '0.00' });

    const added = await cart(token).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 2 });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data.itemCount).toBe(2);
    expect(added.body.data.itemsTotal).toBe('109998.00');
    expect(added.body.data.token).toBe(token);
    const line = added.body.data.lines[0];
    expect(line).toMatchObject({ sku: fx.sku, quantity: 2, unitPrice: '54999.00', priceChanged: false, inStock: true });

    // Adding the same variant again accumulates rather than duplicating the line.
    const again = await cart(token).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 1 });
    expect(again.body.data.lines).toHaveLength(1);
    expect(again.body.data.itemCount).toBe(3);

    const updated = await cart(token).patch(`/api/v1/cart/items/${line.itemId}`).send({ quantity: 1 });
    expect(updated.body.data.itemsTotal).toBe('54999.00');

    const removed = await cart(token).delete(`/api/v1/cart/items/${line.itemId}`);
    expect(removed.body.data.lines).toHaveLength(0);

    // A cart is private to its token.
    const other = await cart(`${run}-guest-2`).get('/api/v1/cart');
    expect(other.body.data.itemCount).toBe(0);
    expect((await cart(token).delete(`/api/v1/cart/items/${line.itemId}`)).status).toBe(404);
  });

  it('issues a token to a first-time guest and returns the cart it started (increment 3.8)', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ variantId: fx.variantId, quantity: 1 });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const token: string = added.body.data.token;
    expect(token).toMatch(/\S{20,}/);
    expect(added.body.data.itemCount).toBe(1);

    const read = await cart(token).get('/api/v1/cart');
    expect(read.body.data.itemCount).toBe(1);
    // The token is not run-prefixed, so cleanupPurchase would not find this cart.
    await app.get(PrismaService).cart.delete({ where: { id: read.body.data.id } });
  });

  it('places a guest order, reserves the stock and empties the cart (REQ-19/23)', async () => {
    const token = `${run}-guest-order`;
    await cart(token).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 1 });
    const before = await stockOf(app.get(PrismaService), fx.variantId);

    // The quote prices the cart exactly as placement will, and reserves nothing (3.8).
    const quote = await cart(token).post('/api/v1/checkout/quote').send({ deliveryType: 'HOME_DELIVERY', province: 'Punjab' });
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.data).toMatchObject({ itemsTotal: '54999.00', deliveryFee: '500.00', grandTotal: '55499.00' });
    expect(quote.body.data.delivery).toMatchObject({ zone: 'A', bands: 1 });
    expect((await stockOf(app.get(PrismaService), fx.variantId)).reserved).toBe(before.reserved);
    expect((await cart(token).post('/api/v1/checkout/quote').send({ deliveryType: 'HOME_DELIVERY', province: 'Atlantis' })).status).toBe(400);
    const pickup = await cart(token).post('/api/v1/checkout/quote').send({ deliveryType: 'STORE_PICKUP' });
    expect(pickup.body.data).toMatchObject({ deliveryFee: '0.00', grandTotal: '54999.00' });

    const placed = await checkout(token, `${run}-key-guest`, {
      deliveryType: 'HOME_DELIVERY',
      paymentMethod: 'COD',
      guestPhone: '03001234567',
      guestEmail: 'guest@example.test',
      address: {
        recipientName: 'Guest Buyer',
        phone: '03001234567',
        province: 'Punjab',
        city: 'Lahore',
        addressLine: 'House 5, Street 2',
      },
      customerNote: 'Call before delivery',
    });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const order = placed.body.data;
    expect(order.refNumber).toMatch(/^FK-\d{6}-[0-9A-F]{6}$/);
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('PENDING_COLLECTION');
    // 54999 items + 500 delivery (Punjab base 350 + one extra weight band at 12.5 kg)
    expect(order).toMatchObject({ itemsTotal: '54999.00', deliveryFee: '500.00', taxTotal: '0.00', grandTotal: '55499.00' });
    expect(order.items[0]).toMatchObject({ sku: fx.sku, quantity: 1, unitPrice: '54999.00' });
    expect(order.history).toHaveLength(1);
    expect(order.address.city).toBe('Lahore');

    const after = await stockOf(app.get(PrismaService), fx.variantId);
    expect(after.reserved).toBe(before.reserved + 1);
    expect(after.onHand).toBe(before.onHand); // nothing has shipped yet
    expect((await cart(token).get('/api/v1/cart')).body.data.itemCount).toBe(0);

    // A guest tracks the order with its reference plus the phone, in any format (3.8).
    const lookup = (refNumber: string, phone: string) =>
      request(app.getHttpServer()).post('/api/v1/orders/lookup').send({ refNumber, phone });
    const found = await lookup(order.refNumber, '+92 300 1234567');
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    expect(found.body.data).toMatchObject({ refNumber: order.refNumber, grandTotal: '55499.00' });
    // A wrong phone and an unknown reference look the same: neither says which part was wrong.
    expect((await lookup(order.refNumber, '03009999999')).status).toBe(404);
    expect((await lookup('FK-000000-000000', '03001234567')).status).toBe(404);
  });

  it('replays a repeated Idempotency-Key instead of placing a second order', async () => {
    const token = `${run}-guest-idem`;
    await cart(token).post('/api/v1/cart/items').send({ variantId: fx.backorderVariantId, quantity: 1 });
    const body = {
      deliveryType: 'STORE_PICKUP' as const,
      paymentMethod: 'COD' as const,
      guestPhone: '03007654321',
    };
    const key = `${run}-key-idem`;

    const first = await checkout(token, key, body);
    expect(first.status).toBe(201);
    expect(first.body.data.deliveryFee).toBe('0.00'); // store pickup is free

    const replay = await checkout(token, key, body);
    expect(replay.status).toBe(201);
    expect(replay.body.data.refNumber).toBe(first.body.data.refNumber);
    expect(replay.body.data.replayed).toBe(true);

    const mismatch = await checkout(token, key, { ...body, customerNote: 'different' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toContain('different request');

    const orders = await app.get(PrismaService).order.count({ where: { refNumber: first.body.data.refNumber } });
    expect(orders).toBe(1);
  });

  it('checks out a customer order against a saved address and lists it in history (REQ-16)', async () => {
    const customer = await registerCustomer(app);
    phones.push(customer.phone);
    const address = await request(app.getHttpServer())
      .post('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        recipientName: 'Ayesha Khan',
        phone: '03001112233',
        province: 'Sindh',
        city: 'Karachi',
        addressLine: 'Flat 4, Block C',
      });
    expect(address.status).toBe(201);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId: fx.variantId, quantity: 1 });

    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `${run}-key-customer`)
      .send({ deliveryType: 'HOME_DELIVERY', paymentMethod: 'COD', addressId: address.body.data.id });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body.data.address.city).toBe('Karachi');

    const history = await request(app.getHttpServer())
      .get('/api/v1/customers/me/orders')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.map((row: { refNumber: string }) => row.refNumber)).toContain(placed.body.data.refNumber);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/customers/me/orders/${placed.body.data.refNumber}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.items[0].sku).toBe(fx.sku);

    // Guest lookup never reaches an account's order, even with the right phone.
    const asGuest = await request(app.getHttpServer())
      .post('/api/v1/orders/lookup')
      .send({ refNumber: placed.body.data.refNumber, phone: customer.phone });
    expect(asGuest.status).toBe(404);

    // Another customer cannot read it.
    const stranger = await registerCustomer(app);
    phones.push(stranger.phone);
    const peek = await request(app.getHttpServer())
      .get(`/api/v1/customers/me/orders/${placed.body.data.refNumber}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(peek.status).toBe(404);
  });

  it('merges a guest cart into the customer cart on sign-in', async () => {
    const token = `${run}-guest-merge`;
    await cart(token).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 2 });
    const customer = await registerCustomer(app);
    phones.push(customer.phone);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId: fx.backorderVariantId, quantity: 1 });

    const merged = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('X-Cart-Token', token);
    expect(merged.status).toBe(200);
    expect(merged.body.data.token).toBeNull();
    const skus = merged.body.data.lines.map((line: { variantId: string }) => line.variantId).sort();
    expect(skus).toEqual([fx.backorderVariantId, fx.variantId].sort());
    expect(merged.body.data.itemCount).toBe(3);

    // The guest cart is gone, so the token no longer resolves to anything.
    expect((await cart(token).get('/api/v1/cart')).body.data.itemCount).toBe(0);
  });

  it('refuses checkout when a price moved, when stock is short, and when the cart is empty', async () => {
    const prisma = app.get(PrismaService);

    // Price change between add and checkout.
    const priceToken = `${run}-guest-price`;
    await cart(priceToken).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 1 });
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${(await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variantId } })).productId}/variants/${fx.variantId}`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ price: '55999.00' });
    const stale = await checkout(priceToken, `${run}-key-price`, pickup('03001234567'));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('PRICE_CHANGED');
    expect(stale.body.error.details).toMatchObject({ was: '54999.00', now: '55999.00' });
    const reverted = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${(await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variantId } })).productId}/variants/${fx.variantId}`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ price: '54999.00' });
    expect(reverted.status).toBe(200);

    // More than the shelf holds.
    const shortToken = `${run}-guest-short`;
    const before = await stockOf(prisma, fx.variantId);
    await cart(shortToken).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 50 });
    const short = await checkout(shortToken, `${run}-key-short`, pickup('03002223344'));
    expect(short.status).toBe(409);
    expect(short.body.error.code).toBe('OUT_OF_STOCK');
    // The whole transaction rolled back: no reservation, no order, cart intact.
    expect(await stockOf(prisma, fx.variantId)).toEqual(before);
    expect((await cart(shortToken).get('/api/v1/cart')).body.data.itemCount).toBe(50);

    // Empty cart.
    const emptyToken = `${run}-guest-empty`;
    const empty = await checkout(emptyToken, `${run}-key-empty`, pickup('03004445566'));
    expect(empty.status).toBe(404); // no cart exists at all yet
    await cart(emptyToken).post('/api/v1/cart/items').send({ variantId: fx.variantId, quantity: 1 });
    const item = (await cart(emptyToken).get('/api/v1/cart')).body.data.lines[0];
    await cart(emptyToken).delete(`/api/v1/cart/items/${item.itemId}`);
    const emptied = await checkout(emptyToken, `${run}-key-empty2`, pickup('03004445566'));
    expect(emptied.status).toBe(400);
    expect(emptied.body.error.code).toBe('CART_EMPTY');
  });

  it('validates the checkout request itself', async () => {
    const token = `${run}-guest-validate`;
    await cart(token).post('/api/v1/cart/items').send({ variantId: fx.backorderVariantId, quantity: 1 });

    const noKey = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', token)
      .send(pickup('03001234567'));
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.message).toContain('Idempotency-Key');

    const noPhone = await checkout(token, `${run}-key-nophone`, {
      deliveryType: 'STORE_PICKUP',
      paymentMethod: 'COD',
    });
    expect(noPhone.status).toBe(400);

    const noAddress = await checkout(token, `${run}-key-noaddr`, {
      deliveryType: 'HOME_DELIVERY',
      paymentMethod: 'COD',
      guestPhone: '03001234567',
    });
    expect(noAddress.status).toBe(400);

    const badProvince = await checkout(token, `${run}-key-badprov`, {
      deliveryType: 'HOME_DELIVERY',
      paymentMethod: 'COD',
      guestPhone: '03001234567',
      address: {
        recipientName: 'Guest',
        phone: '03001234567',
        province: 'Atlantis',
        city: 'Nowhere',
        addressLine: 'Street 1, House 2',
      },
    });
    expect(badProvince.status).toBe(400);
    expect(badProvince.body.error.details.supported).toBeTruthy();

    // Bank transfer has no automatic reconciliation, so checkout still refuses it.
    // Card and wallet methods became valid in 3.6 and are covered in payments.spec.
    const bankTransfer = await checkout(token, `${run}-key-bank`, {
      deliveryType: 'STORE_PICKUP',
      paymentMethod: 'BANK_TRANSFER',
      guestPhone: '03001234567',
    });
    expect(bankTransfer.status).toBe(400);
  });

  it('sells an available-on-order variant with no stock at all (REQ-28)', async () => {
    const token = `${run}-guest-backorder`;
    await cart(token).post('/api/v1/cart/items').send({ variantId: fx.backorderVariantId, quantity: 3 });
    const placed = await checkout(token, `${run}-key-backorder`, pickup('03008889900'));
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body.data.grandTotal).toBe('29997.00');

    // Nothing was reserved, because there is nothing to reserve.
    const ledger = await app.get(PrismaService).stockLedger.count({
      where: { variantId: fx.backorderVariantId },
    });
    expect(ledger).toBe(0);
  });
});

function cart(token: string) {
  const agent = request(app.getHttpServer());
  return {
    get: (path: string) => agent.get(path).set('X-Cart-Token', token),
    post: (path: string) => agent.post(path).set('X-Cart-Token', token),
    patch: (path: string) => agent.patch(path).set('X-Cart-Token', token),
    delete: (path: string) => agent.delete(path).set('X-Cart-Token', token),
  };
}

function checkout(cartToken: string, key: string, body: unknown) {
  return request(app.getHttpServer())
    .post('/api/v1/checkout')
    .set('X-Cart-Token', cartToken)
    .set('Idempotency-Key', key)
    .send(body);
}

function pickup(phone: string) {
  return { deliveryType: 'STORE_PICKUP' as const, paymentMethod: 'COD' as const, guestPhone: phone };
}
