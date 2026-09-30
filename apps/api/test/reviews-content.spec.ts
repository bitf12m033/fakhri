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
import { cleanupPurchase, PurchaseFixture, seedPurchaseFixture } from './support/purchase';

let app: INestApplication;

/** Reviews with moderation and content pages/banners (increment 3.7): REQ-17/33. */
describe('Reviews and content (e2e)', () => {
  const run = `e2e37b-${Date.now()}`;
  const phones: string[] = [];
  const adminIds: string[] = [];
  let fx: PurchaseFixture;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await configureApp(app);
    await app.init();
    await resetAuthState(app);
    const prisma = app.get(PrismaService);
    await cleanupContent(prisma);
    await cleanupPurchase(prisma, run);
    fx = await seedPurchaseFixture(app, run, { onHand: 20 });
    adminIds.push(fx.adminId);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variantId } });
    productId = variant.productId;
  }, 90_000);

  beforeEach(async () => {
    await resetRateLimits(app, [RATE_LIMIT_SCOPES.checkout, RATE_LIMIT_SCOPES.register]);
  });

  afterAll(async () => {
    if (!app) return;
    const prisma = app.get(PrismaService);
    await prisma.review.deleteMany({ where: { productId } });
    await cleanupPurchase(prisma, run);
    await cleanupContent(prisma);
    await deleteCustomers(prisma, phones);
    await deleteAdmins(prisma, adminIds);
    await app.close();
  });

  it('only lets a buyer review, once, and holds it for moderation (REQ-17)', async () => {
    const stranger = await registerCustomer(app);
    phones.push(stranger.phone);
    const refused = await asCustomer(stranger.token)
      .post('/api/v1/reviews')
      .send({ productId, rating: 5, body: 'Never bought it' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain('after you have ordered');

    const buyer = await registerCustomer(app);
    phones.push(buyer.phone);
    await placeCustomerOrder(buyer.token, `${run}-review-1`);

    const created = await asCustomer(buyer.token)
      .post('/api/v1/reviews')
      .send({ productId, rating: 4, title: 'Good cooling', body: 'Works well in Lahore summers' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'PENDING', isVerifiedPurchase: false });

    const again = await asCustomer(buyer.token).post('/api/v1/reviews').send({ productId, rating: 3 });
    expect(again.status).toBe(409);

    // Nothing is public until it is approved.
    const before = await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${productId}`);
    expect(before.status).toBe(200);
    expect(before.body.data).toHaveLength(0);
    expect(before.body.meta.summary).toMatchObject({ average: null, count: 0 });

    const pending = await admin().get(`/api/v1/admin/reviews?status=PENDING&productId=${productId}`);
    expect(pending.body.data).toHaveLength(1);
    const reviewId = pending.body.data[0].id as string;

    const approved = await admin().patch(`/api/v1/admin/reviews/${reviewId}`).send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect((await admin().patch(`/api/v1/admin/reviews/${reviewId}`).send({ status: 'APPROVED' })).status).toBe(409);

    const after = await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${productId}`);
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0]).toMatchObject({ rating: 4, title: 'Good cooling', isVerifiedPurchase: false });
    // Only a first name is published, never contact details.
    expect(JSON.stringify(after.body)).not.toContain(buyer.phone);
    expect(after.body.meta.summary).toMatchObject({ average: '4.00', count: 1 });
    expect(after.body.meta.summary.histogram['4']).toBe(1);

    // The PDP carries the same summary.
    const pdp = await request(app.getHttpServer()).get(`/api/v1/products/${fx.productSlug}`);
    expect(pdp.body.data.rating).toMatchObject({ average: '4.00', count: 1 });

    const rejected = await admin().patch(`/api/v1/admin/reviews/${reviewId}`).send({ status: 'REJECTED', note: 'Spam' });
    expect(rejected.status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${productId}`)).body.data).toHaveLength(0);
  });

  it('marks a review verified only when an order actually arrived (REQ-17)', async () => {
    const buyer = await registerCustomer(app);
    phones.push(buyer.phone);
    const order = await placeCustomerOrder(buyer.token, `${run}-review-2`);
    for (const status of ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED']) {
      const res = await admin().patch(`/api/v1/admin/orders/${order.id}/status`).send({ status });
      expect(res.status, `${status}: ${JSON.stringify(res.body)}`).toBe(200);
    }

    const created = await asCustomer(buyer.token).post('/api/v1/reviews').send({ productId, rating: 5 });
    expect(created.status).toBe(201);
    expect(created.body.data.isVerifiedPurchase).toBe(true);
  });

  it('keeps moderation away from roles that do not answer for it', async () => {
    const catalogAdmin = await createAdmin(app, UserRole.CATALOG, 'reviews-rbac');
    adminIds.push(catalogAdmin.id);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${catalogAdmin.token}`);
    expect(denied.status).toBe(403);
  });

  it('publishes a page before it can be read, and announces the change (REQ-33)', async () => {
    const prisma = app.get(PrismaService);
    const slug = `${run}-returns-policy`;

    const draft = await admin()
      .post('/api/v1/admin/content/pages')
      .send({ slug, title: 'Returns policy', body: 'Draft text' });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    expect(draft.body.data).toMatchObject({ isPublished: false, publishedAt: null });

    // A draft is not readable by guessing its slug.
    expect((await request(app.getHttpServer()).get(`/api/v1/pages/${slug}`)).status).toBe(404);
    expect((await admin().post('/api/v1/admin/content/pages').send({ slug, title: 'Dup', body: 'x' })).status).toBe(409);
    expect((await admin().post('/api/v1/admin/content/pages').send({ slug: 'Bad Slug', title: 'x', body: 'y' })).status).toBe(400);

    const published = await admin()
      .patch(`/api/v1/admin/content/pages/${draft.body.data.id}`)
      .send({ isPublished: true, body: 'Fourteen day returns on unopened items.' });
    expect(published.status).toBe(200);
    expect(published.body.data.publishedAt).toBeTruthy();

    const live = await request(app.getHttpServer()).get(`/api/v1/pages/${slug}`);
    expect(live.status).toBe(200);
    expect(live.body.data).toMatchObject({ slug, title: 'Returns policy' });
    expect(live.body.data.body).toContain('Fourteen day');

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: draft.body.data.id } });
    expect(events.map((event) => event.type)).toContain('CONTENT_UPDATED');

    const listed = await admin().get(`/api/v1/admin/content/pages?q=${run}`);
    expect(listed.body.data.map((row: { slug: string }) => row.slug)).toContain(slug);

    expect((await admin().delete(`/api/v1/admin/content/pages/${draft.body.data.id}`)).status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/api/v1/pages/${slug}`)).status).toBe(404);
  });

  it('shows only banners that are active and in their window (REQ-33)', async () => {
    const position = `${run.slice(0, 12)}-hero`.toLowerCase();
    const base = { imageUrl: 'https://cdn.example.test/banner.jpg', position };

    const live = await admin().post('/api/v1/admin/content/banners').send({ ...base, title: 'Live' });
    expect(live.status, JSON.stringify(live.body)).toBe(201);
    await admin().post('/api/v1/admin/content/banners').send({ ...base, title: 'Paused', isActive: false });
    await admin()
      .post('/api/v1/admin/content/banners')
      .send({ ...base, title: 'Future', startsAt: '2099-01-01T00:00:00Z' });
    await admin()
      .post('/api/v1/admin/content/banners')
      .send({ ...base, title: 'Past', endsAt: '2026-01-01T00:00:00Z' });
    const backwards = await admin()
      .post('/api/v1/admin/content/banners')
      .send({ ...base, startsAt: '2027-01-01T00:00:00Z', endsAt: '2026-01-01T00:00:00Z' });
    expect(backwards.status).toBe(400);

    const shown = await request(app.getHttpServer()).get(`/api/v1/banners?position=${position}`);
    expect(shown.status).toBe(200);
    expect(shown.body.data.map((row: { title: string }) => row.title)).toEqual(['Live']);

    // Another position sees nothing of ours.
    const elsewhere = await request(app.getHttpServer()).get('/api/v1/banners?position=nowhere-at-all');
    expect(elsewhere.body.data).toHaveLength(0);

    const adminView = await admin().get('/api/v1/admin/content/banners');
    expect(adminView.body.data.filter((row: { position: string }) => row.position === position)).toHaveLength(4);

    const paused = await admin()
      .patch(`/api/v1/admin/content/banners/${live.body.data.id}`)
      .send({ isActive: false });
    expect(paused.body.data.isActive).toBe(false);
    expect((await request(app.getHttpServer()).get(`/api/v1/banners?position=${position}`)).body.data).toHaveLength(0);
  });

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

  function asCustomer(token: string) {
    const agent = request(app.getHttpServer());
    return { post: (path: string) => agent.post(path).set('Authorization', `Bearer ${token}`) };
  }

  async function placeCustomerOrder(token: string, key: string) {
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
    const order = await app
      .get(PrismaService)
      .order.findUniqueOrThrow({ where: { refNumber: placed.body.data.refNumber } });
    return { id: order.id, ref: order.refNumber };
  }

  async function cleanupContent(prisma: PrismaService) {
    await prisma.contentPage.deleteMany({ where: { slug: { startsWith: 'e2e37b-' } } });
    await prisma.banner.deleteMany({ where: { position: { startsWith: 'e2e37b-' } } });
  }
});
