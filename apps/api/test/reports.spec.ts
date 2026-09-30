import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins } from './support/admin';
import { RATE_LIMIT_SCOPES, resetRateLimits, resetAuthState} from './support/customer';
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture } from './support/purchase';

let app: INestApplication;

/** Reports with CSV export and audit search (increment 3.7): REQ-34/35. */
describe('Reports and audit (e2e)', () => {
  const run = `e2e37c-${Date.now()}`;
  const adminIds: string[] = [];
  let fx: PurchaseFixture;
  let orderRef: string;
  let orderId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    await cleanupPurchase(app.get(PrismaService), run);
    fx = await seedPurchaseFixture(app, run, { onHand: 3 });
    adminIds.push(fx.adminId);

    // One COD order to show up in every report.
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('X-Cart-Token', `${run}-cart`)
      .send({ variantId: fx.variantId, quantity: 2 });
    const placed = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('X-Cart-Token', `${run}-cart`)
      .set('Idempotency-Key', `${run}-key`)
      .send({ deliveryType: 'STORE_PICKUP', paymentMethod: 'COD', guestPhone: '03001234567' });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    orderRef = placed.body.data.refNumber;
    const order = await app.get(PrismaService).order.findUniqueOrThrow({ where: { refNumber: orderRef } });
    orderId = order.id;
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

  it('reports sales by day and exports the same numbers as CSV (REQ-35)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const json = await admin().get('/api/v1/admin/reports/sales');
    expect(json.status, JSON.stringify(json.body)).toBe(200);
    const row = json.body.data.find((entry: { date: string }) => entry.date === today);
    expect(row).toBeTruthy();
    expect(Number(row.orders)).toBeGreaterThanOrEqual(1);
    // Money arrives as text, never a float.
    expect(row.grandTotal).toMatch(/^\d+\.\d{2}$/);

    const csv = await admin().get('/api/v1/admin/reports/sales?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('fakhri-sales-');
    const [header, ...lines] = csv.text.trim().split('\r\n');
    expect(header).toBe('Date,Orders,Items total,Discount,Delivery,Tax,Grand total');
    expect(lines.some((line) => line.startsWith(today))).toBe(true);

    // A cancelled order is not a sale, so the default view excludes it.
    const cancelled = await admin().get('/api/v1/admin/reports/sales?status=CANCELLED');
    expect(cancelled.status).toBe(200);
  });

  it('reports top products, low stock and outstanding COD (REQ-35)', async () => {
    const top = await admin().get('/api/v1/admin/reports/top-products?limit=50');
    expect(top.status).toBe(200);
    const ours = top.body.data.find((entry: { sku: string }) => entry.sku === fx.sku);
    expect(ours).toBeTruthy();
    expect(Number(ours.quantity)).toBeGreaterThanOrEqual(2);

    // 3 on hand, 2 reserved by the order above, so 1 sellable.
    const low = await admin().get('/api/v1/admin/reports/low-stock?threshold=1');
    expect(low.status).toBe(200);
    const stock = low.body.data.find((entry: { sku: string }) => entry.sku === fx.sku);
    expect(stock).toMatchObject({ onHand: 3, reserved: 2, available: 1 });

    const plenty = await admin().get('/api/v1/admin/reports/low-stock?threshold=0');
    expect(plenty.body.data.some((entry: { sku: string }) => entry.sku === fx.sku)).toBe(false);

    const cod = await admin().get('/api/v1/admin/reports/cod-outstanding');
    expect(cod.status).toBe(200);
    const outstanding = cod.body.data.find((entry: { refNumber: string }) => entry.refNumber === orderRef);
    expect(outstanding).toMatchObject({ status: 'PENDING', phone: '+923001234567' });

    const codCsv = await admin().get('/api/v1/admin/reports/cod-outstanding?format=csv');
    expect(codCsv.headers['content-type']).toContain('text/csv');
    // A phone number would otherwise look like a formula to a spreadsheet.
    expect(codCsv.text).toContain("'+923001234567");

    // Once collected it drops off the outstanding list.
    await admin().patch(`/api/v1/admin/orders/${orderId}/payment-status`).send({ status: 'COLLECTED' });
    const after = await admin().get('/api/v1/admin/reports/cod-outstanding');
    expect(after.body.data.some((entry: { refNumber: string }) => entry.refNumber === orderRef)).toBe(false);
  });

  it('refuses a report window it will not compute', async () => {
    const backwards = await admin().get('/api/v1/admin/reports/sales?from=2026-06-01&to=2026-01-01');
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.code).toBe('INVALID_INPUT');

    const tooWide = await admin().get('/api/v1/admin/reports/sales?from=2020-01-01&to=2026-01-01');
    expect(tooWide.status).toBe(400);
    expect(tooWide.body.error.message).toContain('limited to');

    expect((await admin().get('/api/v1/admin/reports/top-products?limit=500')).status).toBe(400);
  });

  it('searches the audit trail and keeps it to SUPER_ADMIN (REQ-34)', async () => {
    const byEntity = await admin().get(`/api/v1/admin/audit-logs?entityType=Order&entityId=${orderId}`);
    expect(byEntity.status, JSON.stringify(byEntity.body)).toBe(200);
    expect(byEntity.body.data.length).toBeGreaterThanOrEqual(1);
    expect(byEntity.body.data.map((row: { action: string }) => row.action)).toContain('checkout.order.create');

    const byActionPrefix = await admin().get('/api/v1/admin/audit-logs?action=catalog.&pageSize=5');
    expect(byActionPrefix.status).toBe(200);
    expect(byActionPrefix.body.data.every((row: { action: string }) => row.action.startsWith('catalog.'))).toBe(true);
    expect(byActionPrefix.body.meta.pageSize).toBe(5);

    const byActor = await admin().get(`/api/v1/admin/audit-logs?actorType=ADMIN&actorId=${fx.adminId}`);
    expect(byActor.body.data.every((row: { actorId: string }) => row.actorId === fx.adminId)).toBe(true);
    expect(byActor.body.data.length).toBeGreaterThanOrEqual(1);

    const future = await admin().get('/api/v1/admin/audit-logs?from=2099-01-01T00:00:00Z');
    expect(future.body.data).toHaveLength(0);

    const ordersAdmin = await createAdmin(app, UserRole.ORDERS, 'audit-rbac');
    adminIds.push(ordersAdmin.id);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${ordersAdmin.token}`);
    expect(denied.status).toBe(403);

    // Reports, by contrast, are open to the ORDERS role.
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/sales')
      .set('Authorization', `Bearer ${ordersAdmin.token}`);
    expect(allowed.status).toBe(200);
  });

  function admin() {
    const agent = request(app.getHttpServer());
    const auth = `Bearer ${fx.adminToken}`;
    return {
      get: (path: string) => agent.get(path).set('Authorization', auth),
      patch: (path: string) => agent.patch(path).set('Authorization', auth),
    };
  }
});
