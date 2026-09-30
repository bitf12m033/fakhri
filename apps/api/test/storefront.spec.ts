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
 * Public read + search APIs (increment 3.3). Seeds a small catalog through the
 * admin API, then exercises the storefront. Requires postgres at the dev default.
 */
describe('Storefront reads and search (e2e)', () => {
  const run = `e2e33-${Date.now()}`;
  /**
   * Distinct single-word markers with nothing in common: a hit proves the token
   * came from the field it was seeded into, since trigram matching is tolerant
   * of shared substrings.
   */
  const brandToken = `zephyr${marker()}`;
  const tagToken = `quasar${marker()}`;
  const slug = {
    parent: `${run}-appliances`,
    child: `${run}-acs`,
    haier: `${run}-haier`,
    dawlance: `${run}-dawlance`,
    hidden: `${run}-hidden`,
    energy: `${run}-energy`,
    btu: `${run}-btu`,
    wifi: `${run}-wifi`,
    warranty: `${run}-warranty`,
    inverter: `${run}-inverter-ac`,
    fixed: `${run}-fixed-ac`,
    big: `${run}-big-ac`,
    draft: `${run}-draft-ac`,
  };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.DATABASE_URL ??= 'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();
    const prisma = app.get(PrismaService);
    await cleanup(prisma);
    const admin = await createAdmin(app);
    adminToken = admin.token;
    adminIds = [admin.id];
    await seed(prisma);
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await cleanup(app.get(PrismaService));
    await deleteAdmins(app.get(PrismaService), adminIds);
    await app.close();
  });

  it('serves the active nav tree and brand pages', async () => {
    const tree = await pub('/categories');
    const parent = tree.find((node: { slug: string }) => node.slug === slug.parent);
    expect(parent).toBeTruthy();
    expect(parent.productCount).toBe(3); // rolled up from the child category
    expect(parent.children.map((node: { slug: string }) => node.slug)).toContain(slug.child);

    const subtree = await pub(`/categories/${slug.child}/tree`);
    expect(subtree.productCount).toBe(3);
    expect(subtree.breadcrumb.map((node: { slug: string }) => node.slug)).toEqual([slug.parent, slug.child]);

    const brands = await pub(`/brands?q=${run}`);
    const haier = brands.find((brand: { slug: string }) => brand.slug === slug.haier);
    expect(haier.productCount).toBe(2);
    expect(brands.some((brand: { slug: string }) => brand.slug === slug.hidden)).toBe(false);

    expect((await server().get(`/api/v1/brands/${slug.hidden}`)).status).toBe(404);
    expect((await server().get(`/api/v1/brands/${slug.haier}`)).status).toBe(200);
  });

  it('searches on indexed brand and attribute tokens, and hides drafts', async () => {
    // The token only exists in the brand name, so a hit proves the brand is indexed.
    const byBrandToken = await pub(`/products?q=${brandToken}`);
    expect(byBrandToken.map((item: { slug: string }) => item.slug)).toEqual([slug.fixed]);

    const bySubstring = await pub(`/products?q=${brandToken.slice(0, -3)}`);
    expect(bySubstring.map((item: { slug: string }) => item.slug)).toEqual([slug.fixed]);

    const all = await pub(`/products?category=${slug.child}`);
    expect(all.map((item: { slug: string }) => item.slug).sort()).toEqual(
      [slug.big, slug.fixed, slug.inverter].sort(),
    );
    expect(all.some((item: { slug: string }) => item.slug === slug.draft)).toBe(false);

    // A parent category lists its whole subtree.
    const subtree = await pub(`/products?category=${slug.parent}`);
    expect(subtree).toHaveLength(3);

    const draft = await server().get(`/api/v1/products/${slug.draft}`);
    expect(draft.status).toBe(404);
    expect(draft.body.error.code).toBe('NOT_FOUND');
  });

  it('filters, sorts and counts facets that compose', async () => {
    const plp = await server().get(`/api/v1/products?category=${slug.child}`);
    expect(plp.status).toBe(200);
    const facets = plp.body.meta.facets;
    expect(plp.body.meta.totalItems).toBe(3);
    expect(facetCount(facets.brands, slug.haier)).toBe(2);
    expect(facetCount(facets.brands, slug.dawlance)).toBe(1);
    expect(facetCount(attributeFacet(facets, slug.energy).values, 'inverter')).toBe(1);
    expect(facetCount(attributeFacet(facets, slug.energy).values, 'fixed')).toBe(2);
    expect(attributeFacet(facets, slug.btu).range).toEqual({ min: '12000', max: '24000' });
    expect(facets.price).toEqual({ min: '120000.00', max: '260000.00' });

    // An attribute facet does not count itself, so multi-select stays additive.
    const byEnergy = await server().get(`/api/v1/products?category=${slug.child}&attr=${slug.energy}:inverter`);
    expect(byEnergy.body.data.map((item: { slug: string }) => item.slug)).toEqual([slug.inverter]);
    expect(facetCount(attributeFacet(byEnergy.body.meta.facets, slug.energy).values, 'fixed')).toBe(2);

    // Other facets do narrow under the filter.
    expect(facetCount(byEnergy.body.meta.facets.brands, slug.haier)).toBe(1);
    expect(byEnergy.body.meta.facets.brands.length).toBe(1);

    // Filters compose across attributes.
    const composed = await pub(
      `/products?category=${slug.child}&attr=${slug.energy}:fixed&attr=${slug.wifi}:false&attr=${slug.btu}:20000..30000`,
    );
    expect(composed.map((item: { slug: string }) => item.slug)).toEqual([slug.big]);

    const byBrand = await pub(`/products?category=${slug.child}&brand=${slug.dawlance}`);
    expect(byBrand.map((item: { slug: string }) => item.slug)).toEqual([slug.fixed]);

    const byPrice = await pub(`/products?category=${slug.child}&minPrice=100000&maxPrice=130000`);
    expect(byPrice.map((item: { slug: string }) => item.slug)).toEqual([slug.fixed]);

    const cheapestFirst = await pub(`/products?category=${slug.child}&sort=price_asc`);
    expect(cheapestFirst[0].slug).toBe(slug.fixed);
    const dearestFirst = await pub(`/products?category=${slug.child}&sort=price_desc`);
    expect(dearestFirst[0].slug).toBe(slug.big);

    const paged = await server().get(`/api/v1/products?category=${slug.child}&pageSize=2&page=2`);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it('reports availability and rejects malformed queries', async () => {
    const byAvailability = await pub(`/products?category=${slug.child}&sort=name_asc`);
    const availability = new Map(
      byAvailability.map((item: { slug: string; availability: string }) => [item.slug, item.availability]),
    );
    expect(availability.get(slug.inverter)).toBe('AVAILABLE_ON_ORDER');
    expect(availability.get(slug.fixed)).toBe('IN_STOCK');
    expect(availability.get(slug.big)).toBe('OUT_OF_STOCK');

    for (const query of [
      `sort=cheapest`,
      `attr=${run}-nope:x`,
      `attr=${slug.energy}:bogus`,
      `attr=${slug.wifi}:maybe`,
      `attr=${slug.energy}:1..2`,
      `minPrice=300000&maxPrice=1000`,
      `category=${run}-missing`,
    ]) {
      const res = await server().get(`/api/v1/products?${query}`);
      expect([400, 404], `${query} -> ${res.status}`).toContain(res.status);
      expect(res.body.error.traceId).toBeTruthy();
    }
  });

  it('suggests products, brands and categories', async () => {
    const suggestions = await pub(`/products/suggest?q=${run}-fixed`);
    expect(suggestions.products.map((item: { slug: string }) => item.slug)).toContain(slug.fixed);

    const brandSuggestions = await pub(`/products/suggest?q=${brandToken}`);
    expect(brandSuggestions.brands.map((item: { slug: string }) => item.slug)).toContain(slug.dawlance);

    expect((await server().get('/api/v1/products/suggest?q=a')).status).toBe(400);
  });

  it('serves a PDP with specs and never exposes cost price', async () => {
    const res = await server().get(`/api/v1/products/${slug.inverter}`);
    expect(res.status).toBe(200);
    const product = res.body.data;

    expect(product.brand.slug).toBe(slug.haier);
    expect(product.breadcrumb.map((node: { slug: string }) => node.slug)).toEqual([slug.parent, slug.child]);
    expect(product.fromPrice).toBe('185000.00');
    expect(product.variants[0].compareAtPrice).toBe('199000.00');
    expect(product.variants[0].availability).toBe('AVAILABLE_ON_ORDER');
    expect(product.images[0].isPrimary).toBe(true);

    const cooling = product.specGroups.find((group: { group: string }) => group.group === 'Cooling');
    expect(cooling.specs.find((spec: { slug: string }) => spec.slug === slug.energy).value).toBe('Inverter');
    expect(cooling.specs.find((spec: { slug: string }) => spec.slug === slug.btu).value).toBe('18000');
    const general = product.specGroups.find((group: { group: string }) => group.group === 'General');
    expect(general.specs.find((spec: { slug: string }) => spec.slug === slug.warranty).value).toBe('10');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('costPrice');
    expect(body).not.toContain('150000');
  });

  it('compares 2 to 4 products on shared comparable attributes', async () => {
    const res = await server().get(`/api/v1/compare?ids=${ids.inverter},${ids.fixed}`);
    expect(res.status).toBe(200);
    expect(res.body.data.products.map((item: { slug: string }) => item.slug)).toEqual([slug.inverter, slug.fixed]);

    const energyRow = res.body.data.specs.find((row: { slug: string }) => row.slug === slug.energy);
    expect(energyRow.values.map((value: { value: string }) => value.value)).toEqual(['Inverter', 'Fixed speed']);
    expect(JSON.stringify(res.body)).not.toContain('costPrice');

    expect((await server().get(`/api/v1/compare?ids=${ids.inverter}`)).status).toBe(400);
    expect((await server().get('/api/v1/compare?ids=a,b,c,d,e')).status).toBe(400);
  });

  it('keeps the search document current when a product changes', async () => {
    await patch(`/products/${ids.big}`, { tags: ['ac', tagToken] });
    const hits = await pub(`/products?q=${tagToken}`);
    expect(hits.map((item: { slug: string }) => item.slug)).toEqual([slug.big]);

    // An admin reindex is idempotent.
    const reindex = await server().post('/api/v1/admin/search/reindex').set('Authorization', `Bearer ${adminToken}`);
    expect(reindex.status).toBe(200);
    expect(reindex.body.data.products).toBeGreaterThan(0);
    expect((await pub(`/products?q=${tagToken}`)).map((item: { slug: string }) => item.slug)).toEqual([slug.big]);
  });

  async function seed(prisma: PrismaService) {
    ids.haier = (await post('/brands', { name: `Haier-${run}`, slug: slug.haier })).id;
    ids.dawlance = (await post('/brands', { name: `Dawlance ${brandToken}`, slug: slug.dawlance })).id;
    await post('/brands', { name: `Hidden-${run}`, slug: slug.hidden, isActive: false });

    ids.parent = (await post('/categories', { name: `Appliances-${run}`, slug: slug.parent, sortOrder: 1 })).id;
    ids.child = (await post('/categories', { name: `Air Conditioners-${run}`, slug: slug.child, parentId: ids.parent })).id;

    ids.warranty = (await post('/attributes', { name: 'Warranty years', slug: slug.warranty, type: 'NUMBER', unit: 'years' })).id;
    ids.btu = (await post('/attributes', { name: 'Cooling capacity', slug: slug.btu, type: 'NUMBER', unit: 'BTU' })).id;
    ids.wifi = (await post('/attributes', { name: 'WiFi', slug: slug.wifi, type: 'BOOLEAN' })).id;
    ids.energy = (await post('/attributes', { name: 'Energy', slug: slug.energy, type: 'OPTION' })).id;
    ids.inverterOption = (await post(`/attributes/${ids.energy}/options`, { value: 'inverter', label: 'Inverter' })).id;
    ids.fixedOption = (await post(`/attributes/${ids.energy}/options`, { value: 'fixed', label: 'Fixed speed' })).id;

    await put(`/categories/${ids.parent}/attributes`, {
      bindings: [{ attributeId: ids.warranty, group: 'General', sortOrder: 1, isFilterable: true }],
    });
    await put(`/categories/${ids.child}/attributes`, {
      bindings: [
        { attributeId: ids.energy, group: 'Cooling', sortOrder: 2, isRequired: true, isFilterable: true },
        { attributeId: ids.btu, group: 'Cooling', sortOrder: 3, isFilterable: true },
        { attributeId: ids.wifi, group: 'Features', sortOrder: 4, isFilterable: true },
      ],
    });

    ids.inverter = (
      await post('/products', {
        name: `Inverter AC-${run}`,
        slug: slug.inverter,
        brandId: ids.haier,
        categoryId: ids.child,
        status: 'ACTIVE',
        shortDescription: 'Inverter split air conditioner',
        tags: ['ac'],
        attributeValues: [
          { attributeId: ids.energy, optionValueId: ids.inverterOption },
          { attributeId: ids.btu, numberValue: '18000' },
          { attributeId: ids.wifi, booleanValue: true },
          { attributeId: ids.warranty, numberValue: '10' },
        ],
        variants: [
          {
            sku: `${run}-INV18`,
            price: '185000.00',
            compareAtPrice: '199000.00',
            costPrice: '150000.00',
            isAvailableOnOrder: true,
          },
        ],
        images: [{ url: 'https://cdn.example.test/inverter.jpg', alt: 'Inverter AC', isPrimary: true }],
      })
    ).id;

    ids.fixed = (
      await post('/products', {
        name: `Fixed AC-${run}`,
        slug: slug.fixed,
        brandId: ids.dawlance,
        categoryId: ids.child,
        status: 'ACTIVE',
        tags: ['ac'],
        attributeValues: [
          { attributeId: ids.energy, optionValueId: ids.fixedOption },
          { attributeId: ids.btu, numberValue: '12000' },
          { attributeId: ids.wifi, booleanValue: false },
          { attributeId: ids.warranty, numberValue: '5' },
        ],
        variants: [{ sku: `${run}-FIX12`, price: '120000.00' }],
      })
    ).id;

    ids.big = (
      await post('/products', {
        name: `Big AC-${run}`,
        slug: slug.big,
        brandId: ids.haier,
        categoryId: ids.child,
        status: 'ACTIVE',
        tags: ['ac'],
        attributeValues: [
          { attributeId: ids.energy, optionValueId: ids.fixedOption },
          { attributeId: ids.btu, numberValue: '24000' },
          { attributeId: ids.wifi, booleanValue: false },
          { attributeId: ids.warranty, numberValue: '5' },
        ],
        variants: [{ sku: `${run}-BIG24`, price: '260000.00' }],
      })
    ).id;

    await post('/products', {
      name: `Draft AC-${run}`,
      slug: slug.draft,
      brandId: ids.haier,
      categoryId: ids.child,
      variants: [{ sku: `${run}-DRAFT`, price: '99000.00' }],
    });

    // Inventory endpoints are increment 3.5; seed stock directly so the public
    // availability projection has something to read.
    const warehouse = await prisma.warehouse.create({
      data: { code: `${run}-WH`, name: 'Test warehouse', address: 'Test', city: 'Lahore' },
    });
    ids.warehouse = warehouse.id;
    const stocked = await prisma.productVariant.findFirstOrThrow({ where: { sku: `${run}-FIX12` } });
    await prisma.inventoryItem.create({
      data: { warehouseId: warehouse.id, variantId: stocked.id, onHand: 5, reserved: 1 },
    });
  }

  async function cleanup(prisma: PrismaService) {
    await prisma.inventoryItem.deleteMany({ where: { warehouse: { code: { startsWith: 'e2e33-' } } } });
    await prisma.warehouse.deleteMany({ where: { code: { startsWith: 'e2e33-' } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e33-' } } });
    await prisma.category.updateMany({ where: { slug: { startsWith: 'e2e33-' } }, data: { parentId: null } });
    await prisma.attribute.deleteMany({ where: { slug: { startsWith: 'e2e33-' } } });
    await prisma.brand.deleteMany({ where: { slug: { startsWith: 'e2e33-' } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e33-' } } });
  }
});

function marker(): string {
  return Math.random().toString(36).slice(2, 8);
}

function server() {
  return request(app.getHttpServer());
}

function facetCount(values: { value: string; count: number }[], value: string): number | undefined {
  return values.find((entry) => entry.value === value)?.count;
}

function attributeFacet(
  facets: { attributes: { slug: string; values: { value: string; count: number }[]; range: unknown }[] },
  slug: string,
) {
  const facet = facets.attributes.find((entry) => entry.slug === slug);
  expect(facet, `facet ${slug} missing`).toBeTruthy();
  return facet!;
}

/** Public routes live directly under the version prefix. */
async function pub(path: string) {
  const res = await server().get(`/api/v1${path}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
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
