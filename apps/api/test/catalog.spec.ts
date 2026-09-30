import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createAdmin, deleteAdmins } from './support/admin';

let app: INestApplication;
/** Admin routes require an authenticated admin since increment 3.4. */
let adminToken: string;
let adminIds: string[] = [];

/**
 * Catalog admin CRUD (increment 3.2). Requires postgres at the dev default.
 */
describe('Catalog admin (e2e)', () => {
  const run = `e2e32-${Date.now()}`;
  const ids: {
    parent?: string;
    child?: string;
    brand?: string;
    warranty?: string;
    energy?: string;
    btu?: string;
    wifi?: string;
    gas?: string;
    color?: string;
    inverter?: string;
    white?: string;
    product?: string;
    variant?: string;
  } = {};

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();
    await cleanup(app.get(PrismaService));
    const admin = await createAdmin(app);
    adminToken = admin.token;
    adminIds = [admin.id];
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await cleanup(app.get(PrismaService));
    await deleteAdmins(app.get(PrismaService), adminIds);
    await app.close();
  });

  it('creates a category tree, rejects cycles, and merges inherited attribute templates', async () => {
    const parent = await post('/categories', { name: 'Appliances', slug: `${run}-appliances`, sortOrder: 1 });
    const child = await post('/categories', { name: 'Air Conditioners', slug: `${run}-acs`, parentId: parent.id });
    ids.parent = parent.id;
    ids.child = child.id;

    const tree = await get('/categories/tree');
    const appliances = tree.find((node: { id: string }) => node.id === parent.id);
    expect(appliances.children.map((node: { id: string }) => node.id)).toContain(child.id);

    const cycle = await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${parent.id}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: child.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.code).toBe('CONFLICT');

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/admin/categories').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Appliances again', slug: `${run}-appliances` });
    expect(duplicate.status).toBe(409);

    const missing = await request(app.getHttpServer()).get('/api/v1/admin/categories/missing').set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error.traceId).toBeTruthy();

    ids.warranty = (await post('/attributes', { name: 'Warranty years', slug: `${run}-warranty-years`, type: 'NUMBER', unit: 'years' })).id;
    ids.energy = (await post('/attributes', { name: 'Energy', slug: `${run}-energy`, type: 'OPTION' })).id;
    ids.btu = (await post('/attributes', {
      name: 'Cooling capacity',
      slug: `${run}-cooling-btu`,
      type: 'NUMBER',
      unit: 'BTU',
      validation: { min: '1000', max: '50000', step: '1' },
    })).id;
    ids.wifi = (await post('/attributes', { name: 'WiFi', slug: `${run}-wifi`, type: 'BOOLEAN' })).id;
    ids.gas = (await post('/attributes', {
      name: 'Refrigerant',
      slug: `${run}-refrigerant`,
      type: 'TEXT',
      validation: { pattern: '^R-.+$', maxLength: 20 },
    })).id;
    ids.color = (await post('/attributes', { name: 'Color', slug: `${run}-color`, type: 'OPTION' })).id;
    ids.inverter = (await post(`/attributes/${ids.energy}/options`, { value: 'inverter', label: 'Inverter', sortOrder: 1 })).id;
    ids.white = (await post(`/attributes/${ids.color}/options`, { value: 'white', label: 'White' })).id;

    const optionOnNumber = await request(app.getHttpServer())
      .post(`/api/v1/admin/attributes/${ids.btu}/options`).set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'nope', label: 'Nope' });
    expect(optionOnNumber.status).toBe(400);
    expect(optionOnNumber.body.error.code).toBe('INVALID_INPUT');

    await put(`/categories/${parent.id}/attributes`, {
      bindings: [{ attributeId: ids.warranty, isFilterable: true, sortOrder: 1 }, { attributeId: ids.energy, isRequired: false, sortOrder: 2 }],
    });
    await put(`/categories/${child.id}/attributes`, {
      bindings: [
        { attributeId: ids.energy, isRequired: true, isFilterable: true, sortOrder: 1 },
        { attributeId: ids.btu, isRequired: true, isFilterable: true, group: 'Cooling', sortOrder: 2 },
        { attributeId: ids.wifi, sortOrder: 3 },
        { attributeId: ids.gas, sortOrder: 4 },
      ],
    });

    const template = await get(`/categories/${child.id}/attribute-template`);
    const bySlug = Object.fromEntries(template.map((binding: { attribute: { slug: string } }) => [binding.attribute.slug, binding]));
    expect(bySlug[`${run}-warranty-years`].inherited).toBe(true);
    expect(bySlug[`${run}-warranty-years`].isRequired).toBe(false);
    expect(bySlug[`${run}-energy`].inherited).toBe(false);
    expect(bySlug[`${run}-energy`].isRequired).toBe(true);
    expect(bySlug[`${run}-cooling-btu`].isRequired).toBe(true);
    expect(bySlug[`${run}-energy`].attribute.options.map((option: { value: string }) => option.value)).toContain('inverter');
  });

  it('publishes a product only when required specs and a variant price are valid', async () => {
    ids.brand = (await post('/brands', { name: 'Haier', slug: `${run}-haier`, logoUrl: 'https://cdn.example.com/haier.png' })).id;
    const draft = await post('/products', {
      name: 'Haier 1.5 Ton Inverter',
      slug: `${run}-split-ac`,
      brandId: ids.brand,
      categoryId: ids.child,
      warrantyInfo: '10 year compressor',
      variants: [{ sku: `${run}-SKU-1`, price: '184999.00', compareAtPrice: '199999.00', costPrice: '150000.00' }],
    });
    ids.product = draft.id;
    ids.variant = draft.variants[0].id;
    expect(draft.status).toBe('DRAFT');
    expect(draft.variants[0].price).toBe('184999.00');
    expect(draft.variants[0].costPrice).toBe('150000.00');

    const tooSoon = await request(app.getHttpServer()).patch(`/api/v1/admin/products/${draft.id}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    expect(tooSoon.status).toBe(400);
    expect(tooSoon.body.error.code).toBe('INVALID_INPUT');
    expect(tooSoon.body.error.details.missing.map((item: { slug: string }) => item.slug).sort()).toEqual(
      [`${run}-cooling-btu`, `${run}-energy`].sort(),
    );

    const lowBtu = await request(app.getHttpServer()).put(`/api/v1/admin/products/${draft.id}/attribute-values`).set('Authorization', `Bearer ${adminToken}`).send({
      values: [
        { attributeId: ids.energy, optionValueId: ids.inverter },
        { attributeId: ids.btu, numberValue: '12' },
      ],
    });
    expect(lowBtu.status).toBe(400);

    const wrongKind = await request(app.getHttpServer()).put(`/api/v1/admin/products/${draft.id}/attribute-values`).set('Authorization', `Bearer ${adminToken}`).send({
      values: [{ attributeId: ids.energy, numberValue: '1' }],
    });
    expect(wrongKind.status).toBe(400);

    const values = await put(`/products/${draft.id}/attribute-values`, {
      values: [
        { attributeId: ids.energy, optionValueId: ids.inverter },
        { attributeId: ids.btu, numberValue: '18000' },
        { attributeId: ids.wifi, booleanValue: true },
        { attributeId: ids.gas, textValue: 'R-410A' },
        { attributeId: ids.warranty, numberValue: '10' },
      ],
    });
    expect(values.map((value: { attribute: { slug: string } }) => value.attribute.slug).sort()).toEqual(
      [`${run}-cooling-btu`, `${run}-energy`, `${run}-refrigerant`, `${run}-warranty-years`, `${run}-wifi`].sort(),
    );

    const cheap = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${draft.id}/variants/${ids.variant}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ compareAtPrice: '100.00' });
    expect(cheap.status).toBe(400);

    const published = await patch(`/products/${draft.id}`, { status: 'ACTIVE' });
    expect(published.status).toBe('ACTIVE');
    expect(published.publishedAt).toBeTruthy();

    const prisma = app.get(PrismaService);
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: draft.id, type: 'PRODUCT_PUBLISHED' } });
    expect(events).toHaveLength(1);
    const audits = await prisma.auditLog.findMany({ where: { entityId: draft.id, action: 'catalog.product.update' } });
    expect(audits.length).toBeGreaterThan(0);

    const color = await put(`/products/${draft.id}/variants/${ids.variant}/attribute-values`, {
      values: [{ attributeId: ids.color, optionValueId: ids.white }],
    });
    expect(color).toHaveLength(1);
    const reloaded = await get(`/products/${draft.id}`);
    expect(reloaded.attributeValues.some((value: { attributeId: string }) => value.attributeId === ids.color)).toBe(false);
    expect(reloaded.variants[0].attributeValues[0].option.value).toBe('white');

    const first = await post(`/products/${draft.id}/images`, { url: 'https://cdn.example.com/front.jpg', isPrimary: true, alt: 'Front' });
    const second = await post(`/products/${draft.id}/images`, { url: 'https://cdn.example.com/side.jpg', isPrimary: true, alt: 'Side' });
    const images = await get(`/products/${draft.id}/images`);
    expect(images.find((image: { id: string }) => image.id === first.id).isPrimary).toBe(false);
    expect(images.find((image: { id: string }) => image.id === second.id).isPrimary).toBe(true);

    const listed = await get('/products?q=' + encodeURIComponent(run));
    expect(listed.some((item: { id: string }) => item.id === draft.id)).toBe(true);

    const blockedCategory = await request(app.getHttpServer()).delete(`/api/v1/admin/categories/${ids.child}`).set('Authorization', `Bearer ${adminToken}`);
    expect(blockedCategory.status).toBe(409);
    const blockedOption = await request(app.getHttpServer()).delete(`/api/v1/admin/attributes/${ids.energy}/options/${ids.inverter}`).set('Authorization', `Bearer ${adminToken}`);
    expect(blockedOption.status).toBe(409);
  });
});

function server() {
  return request(app.getHttpServer());
}

async function post(path: string, body: unknown) {
  const res = await server().post(`/api/v1/admin${path}`).set('Authorization', `Bearer ${adminToken}`).set('Authorization', `Bearer ${adminToken}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

async function put(path: string, body: unknown) {
  const res = await server().put(`/api/v1/admin${path}`).set('Authorization', `Bearer ${adminToken}`).set('Authorization', `Bearer ${adminToken}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

async function patch(path: string, body: unknown) {
  const res = await server().patch(`/api/v1/admin${path}`).set('Authorization', `Bearer ${adminToken}`).set('Authorization', `Bearer ${adminToken}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

async function get(path: string) {
  const res = await server().get(`/api/v1/admin${path}`).set('Authorization', `Bearer ${adminToken}`).set('Authorization', `Bearer ${adminToken}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

async function cleanup(prisma: PrismaService) {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e32-' } } });
  await prisma.category.updateMany({ where: { slug: { startsWith: 'e2e32-' } }, data: { parentId: null } });
  await prisma.attribute.deleteMany({ where: { slug: { startsWith: 'e2e32-' } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: 'e2e32-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e32-' } } });
}
