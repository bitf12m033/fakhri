/**
 * Demo catalog for local development and the Playwright journeys (increment 3.8).
 *
 *   npm run seed -w apps/api
 *
 * Boots the API in-process on an ephemeral port and creates everything through
 * the admin endpoints, so validation, search indexing and audit behave exactly as
 * they do for an operator. Re-running is safe: anything whose slug, code or email
 * already exists is left alone.
 *
 * Seeds one admin per role, all sharing SEED_ADMIN_PASSWORD. Refuses to run with
 * NODE_ENV=production, because those are well-known credentials.
 */
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { PrismaClient, UserRole } from '@fakhri/prisma';

// The running API's dispatcher delivers the events this script produces, and a
// log line per seeded row buries the summary.
process.env.OUTBOX_POLL_MS = '0';
process.env.LOG_LEVEL = 'warn';

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Fakhri-dev-passw0rd';
const MEDIA = (process.env.SEED_MEDIA_BASE_URL ?? 'http://localhost:3001/media').replace(/\/$/, '');

export const SEED_ADMINS: { email: string; name: string; role: UserRole }[] = [
  { email: 'super@fakhri.test', name: 'Sana Super', role: UserRole.SUPER_ADMIN },
  { email: 'catalog@fakhri.test', name: 'Kamran Catalog', role: UserRole.CATALOG },
  { email: 'inventory@fakhri.test', name: 'Imran Inventory', role: UserRole.INVENTORY },
  { email: 'orders@fakhri.test', name: 'Omar Orders', role: UserRole.ORDERS },
  { email: 'marketing@fakhri.test', name: 'Maryam Marketing', role: UserRole.MARKETING },
  { email: 'support@fakhri.test', name: 'Sara Support', role: UserRole.SUPPORT },
];

type Json = Record<string, unknown>;

interface ProductSeed {
  slug: string;
  name: string;
  brand: string;
  category: string;
  shortDescription: string;
  description: string;
  warrantyInfo: string;
  tags: string[];
  isFeatured?: boolean;
  values: Json[];
  variants: (Json & { sku: string; stock: number })[];
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data and well-known admin passwords into production.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env, or export it.');
  }

  // Imported after the env tweak above so config validation sees it.
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../bootstrap');
  const { PasswordService } = await import('../modules/auth/password.service');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], rawBody: true });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/v1`;
  const prisma = new PrismaClient();

  try {
    const passwords = app.get(PasswordService);
    for (const admin of SEED_ADMINS) {
      const existing = await prisma.adminUser.findUnique({ where: { email: admin.email } });
      if (existing) continue;
      await prisma.adminUser.create({
        data: { ...admin, passwordHash: await passwords.hash(ADMIN_PASSWORD) },
      });
      console.log(`admin    ${admin.role.padEnd(12)} ${admin.email}`);
    }

    const login = await call(base, undefined, 'POST', '/admin/auth/login', {
      email: SEED_ADMINS[0]!.email,
      password: ADMIN_PASSWORD,
    });
    const token = String(login.accessToken);
    const api = (method: string, path: string, body?: Json) => call(base, token, method, `/admin${path}`, body);

    const brands = await ensureBrands(prisma, api);
    const categories = await ensureCategories(prisma, api);
    const attributes = await ensureAttributes(prisma, api);
    await bindAttributes(api, categories, attributes);
    const warehouseId = await ensureWarehouse(prisma, api);
    await ensureProducts(prisma, api, { brands, categories, attributes, warehouseId });
    await ensureCoupons(prisma, api);
    await ensureContent(prisma, api);

    console.log(`\nSeeded. Admin password for every @fakhri.test account: ${ADMIN_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

// ------------------------------------------------------------------ catalog

async function ensureBrands(prisma: PrismaClient, api: Api): Promise<Map<string, string>> {
  const rows = [
    { slug: 'haier', name: 'Haier', description: 'Home appliances engineered for Pakistani summers.' },
    { slug: 'dawlance', name: 'Dawlance', description: 'Refrigeration and air conditioning since 1980.' },
    { slug: 'gree', name: 'Gree', description: 'Inverter air conditioning specialists.' },
    { slug: 'samsung', name: 'Samsung', description: 'Televisions and smart home electronics.' },
    { slug: 'tcl', name: 'TCL', description: 'Smart LED and QLED televisions.' },
    { slug: 'orient', name: 'Orient', description: 'Appliances assembled in Pakistan.' },
  ];
  const ids = new Map<string, string>();
  for (const row of rows) {
    const existing = await prisma.brand.findUnique({ where: { slug: row.slug } });
    ids.set(row.slug, existing?.id ?? String((await api('POST', '/brands', row)).id));
  }
  return ids;
}

async function ensureCategories(prisma: PrismaClient, api: Api): Promise<Map<string, string>> {
  const rows = [
    { slug: 'appliances', name: 'Home Appliances', sortOrder: 1, description: 'Cooling, refrigeration and kitchen.' },
    { slug: 'air-conditioners', name: 'Air Conditioners', parent: 'appliances', sortOrder: 1, description: 'Split and inverter ACs.' },
    { slug: 'refrigerators', name: 'Refrigerators', parent: 'appliances', sortOrder: 2, description: 'Fridges and freezers.' },
    { slug: 'electronics', name: 'Electronics', sortOrder: 2, description: 'Televisions and entertainment.' },
    { slug: 'led-tvs', name: 'LED TVs', parent: 'electronics', sortOrder: 1, description: 'HD, Full HD and 4K televisions.' },
  ];
  const ids = new Map<string, string>();
  for (const { parent, ...row } of rows) {
    const existing = await prisma.category.findUnique({ where: { slug: row.slug } });
    const body = { ...row, ...(parent ? { parentId: ids.get(parent) } : {}) };
    ids.set(row.slug, existing?.id ?? String((await api('POST', '/categories', body)).id));
  }
  return ids;
}

interface AttributeIds {
  ids: Map<string, string>;
  options: Map<string, string>;
}

async function ensureAttributes(prisma: PrismaClient, api: Api): Promise<AttributeIds> {
  const rows: { slug: string; name: string; type: string; unit?: string; options?: [string, string][] }[] = [
    { slug: 'warranty-years', name: 'Warranty', type: 'NUMBER', unit: 'years' },
    {
      slug: 'energy-type',
      name: 'Compressor',
      type: 'OPTION',
      options: [
        ['inverter', 'Inverter'],
        ['fixed', 'Fixed speed'],
      ],
    },
    { slug: 'cooling-btu', name: 'Cooling capacity', type: 'NUMBER', unit: 'BTU' },
    { slug: 'wifi', name: 'Wi-Fi control', type: 'BOOLEAN' },
    { slug: 'capacity-litres', name: 'Gross capacity', type: 'NUMBER', unit: 'L' },
    { slug: 'screen-size', name: 'Screen size', type: 'NUMBER', unit: 'inch' },
    {
      slug: 'resolution',
      name: 'Resolution',
      type: 'OPTION',
      options: [
        ['hd', 'HD'],
        ['fhd', 'Full HD'],
        ['uhd', '4K UHD'],
      ],
    },
    { slug: 'smart-tv', name: 'Smart TV', type: 'BOOLEAN' },
  ];
  const ids = new Map<string, string>();
  const options = new Map<string, string>();
  for (const { options: optionRows, ...row } of rows) {
    const existing = await prisma.attribute.findUnique({ where: { slug: row.slug }, include: { options: true } });
    const id = existing?.id ?? String((await api('POST', '/attributes', row)).id);
    ids.set(row.slug, id);
    for (const [value, label] of optionRows ?? []) {
      const found = existing?.options.find((option) => option.value === value);
      const optionId = found?.id ?? String((await api('POST', `/attributes/${id}/options`, { value, label })).id);
      options.set(`${row.slug}:${value}`, optionId);
    }
  }
  return { ids, options };
}

async function bindAttributes(api: Api, categories: Map<string, string>, attributes: AttributeIds): Promise<void> {
  const bind = (slug: string, group: string, sortOrder: number, extra: Json = {}) => ({
    attributeId: attributes.ids.get(slug),
    group,
    sortOrder,
    isFilterable: true,
    ...extra,
  });
  // PUT replaces the set, so re-running converges instead of duplicating.
  const plan: [string, Json[]][] = [
    ['appliances', [bind('warranty-years', 'General', 1)]],
    [
      'air-conditioners',
      [
        bind('energy-type', 'Cooling', 2, { isRequired: true }),
        bind('cooling-btu', 'Cooling', 3, { isRequired: true }),
        bind('wifi', 'Features', 4),
      ],
    ],
    ['refrigerators', [bind('capacity-litres', 'Capacity', 2, { isRequired: true }), bind('energy-type', 'Cooling', 3)]],
    ['electronics', [bind('warranty-years', 'General', 1)]],
    [
      'led-tvs',
      [
        bind('screen-size', 'Display', 2, { isRequired: true }),
        bind('resolution', 'Display', 3, { isRequired: true }),
        bind('smart-tv', 'Features', 4),
      ],
    ],
  ];
  for (const [slug, bindings] of plan) {
    await api('PUT', `/categories/${categories.get(slug)}/attributes`, { bindings });
  }
}

async function ensureWarehouse(prisma: PrismaClient, api: Api): Promise<string> {
  const existing = await prisma.warehouse.findUnique({ where: { code: 'LHE-MAIN' } });
  if (existing) return existing.id;
  const created = await api('POST', '/inventory/warehouses', {
    code: 'LHE-MAIN',
    name: 'Lahore main warehouse',
    address: 'Plot 12, Sundar Industrial Estate',
    city: 'Lahore',
  });
  return String(created.id);
}

async function ensureProducts(
  prisma: PrismaClient,
  api: Api,
  refs: { brands: Map<string, string>; categories: Map<string, string>; attributes: AttributeIds; warehouseId: string },
): Promise<void> {
  const { attributes } = refs;
  const option = (slug: string, value: string) => ({
    attributeId: attributes.ids.get(slug),
    optionValueId: attributes.options.get(`${slug}:${value}`),
  });
  const number = (slug: string, value: string) => ({ attributeId: attributes.ids.get(slug), numberValue: value });
  const flag = (slug: string, value: boolean) => ({ attributeId: attributes.ids.get(slug), booleanValue: value });

  const products: ProductSeed[] = [
    {
      slug: 'haier-hsu-18hfpaa-inverter-ac',
      name: 'Haier 1.5 Ton Inverter Split AC HSU-18HFPAA',
      brand: 'haier',
      category: 'air-conditioners',
      shortDescription: 'DC inverter, heat and cool, up to 60% energy saving.',
      description:
        'A 1.5 ton DC inverter split air conditioner with heat and cool modes, a self-cleaning evaporator and a gold-fin condenser built for coastal humidity.\n\nWorks down to 160 V, which matters during load-shedding voltage drops.',
      warrantyInfo: '10 years compressor, 1 year parts',
      tags: ['ac', 'inverter', 'split'],
      isFeatured: true,
      values: [option('energy-type', 'inverter'), number('cooling-btu', '18000'), flag('wifi', true), number('warranty-years', '10')],
      variants: [
        { sku: 'HAI-HSU18-INV', price: '189999.00', compareAtPrice: '204999.00', weightKg: '42.000', stock: 12 },
      ],
    },
    {
      slug: 'gree-gs-12pith-inverter-ac',
      name: 'Gree 1 Ton Pular Inverter AC GS-12PITH',
      brand: 'gree',
      category: 'air-conditioners',
      shortDescription: 'Compact 1 ton inverter for rooms up to 150 sq ft.',
      description: 'G10 inverter technology, 3D airflow and a quiet 22 dB sleep mode.',
      warrantyInfo: '10 years compressor, 3 years PCB',
      tags: ['ac', 'inverter'],
      values: [option('energy-type', 'inverter'), number('cooling-btu', '12000'), flag('wifi', false), number('warranty-years', '10')],
      variants: [{ sku: 'GRE-GS12-INV', price: '154999.00', weightKg: '35.000', stock: 8 }],
    },
    {
      slug: 'dawlance-mega-t-15-ac',
      name: 'Dawlance 1.5 Ton Mega T Fixed Speed AC',
      brand: 'dawlance',
      category: 'air-conditioners',
      shortDescription: 'Reliable fixed-speed cooling at an entry price.',
      description: 'Fast cooling, anti-bacterial filter and a copper condenser.',
      warrantyInfo: '3 years compressor',
      tags: ['ac', 'fixed'],
      values: [option('energy-type', 'fixed'), number('cooling-btu', '18000'), flag('wifi', false), number('warranty-years', '3')],
      variants: [{ sku: 'DAW-MEGAT-15', price: '129999.00', weightKg: '40.000', stock: 20 }],
    },
    {
      slug: 'orient-ultron-2-ton-inverter-ac',
      name: 'Orient Ultron 2 Ton Inverter AC',
      brand: 'orient',
      category: 'air-conditioners',
      shortDescription: 'Two tons for large lounges, made to order.',
      description: 'Ordered from the factory on purchase; dispatch within 7 working days.',
      warrantyInfo: '10 years compressor',
      tags: ['ac', 'inverter'],
      values: [option('energy-type', 'inverter'), number('cooling-btu', '24000'), flag('wifi', true), number('warranty-years', '10')],
      variants: [{ sku: 'ORI-ULT-24', price: '239999.00', weightKg: '55.000', isAvailableOnOrder: true, stock: 0 }],
    },
    {
      slug: 'haier-hrf-368-refrigerator',
      name: 'Haier HRF-368 Inverter Refrigerator',
      brand: 'haier',
      category: 'refrigerators',
      shortDescription: '368 litre twin-door with inverter compressor.',
      description: 'Glass door, 12-hour cooling retention during load-shedding, humidity-controlled crisper.',
      warrantyInfo: '12 years compressor',
      tags: ['fridge', 'inverter'],
      isFeatured: true,
      values: [number('capacity-litres', '368'), option('energy-type', 'inverter'), number('warranty-years', '12')],
      variants: [
        { sku: 'HAI-HRF368-SLV', name: 'Silver', price: '164999.00', weightKg: '65.000', stock: 6 },
        { sku: 'HAI-HRF368-BLK', name: 'Black glass', price: '172999.00', weightKg: '66.000', stock: 3 },
      ],
    },
    {
      slug: 'dawlance-9193-lf-refrigerator',
      name: 'Dawlance 9193 LF Avante Refrigerator',
      brand: 'dawlance',
      category: 'refrigerators',
      shortDescription: '14 cubic feet, fixed-speed compressor.',
      description: 'Classic top-mount freezer with a 10-hour cooling backup.',
      warrantyInfo: '10 years compressor',
      tags: ['fridge'],
      values: [number('capacity-litres', '397'), option('energy-type', 'fixed'), number('warranty-years', '10')],
      variants: [{ sku: 'DAW-9193-LF', price: '139999.00', weightKg: '60.000', stock: 0 }],
    },
    {
      slug: 'samsung-crystal-uhd-tv',
      name: 'Samsung Crystal UHD 4K Smart TV',
      brand: 'samsung',
      category: 'led-tvs',
      shortDescription: 'Crystal Processor 4K, Tizen smart platform.',
      description: 'PurColor, HDR10+ and a slim bezel. Choose the size that fits your room.',
      warrantyInfo: '1 year official warranty',
      tags: ['tv', '4k', 'smart'],
      isFeatured: true,
      values: [option('resolution', 'uhd'), flag('smart-tv', true), number('warranty-years', '1'), number('screen-size', '43')],
      variants: [
        { sku: 'SAM-CU-43', name: '43 inch', price: '124999.00', weightKg: '9.000', stock: 10, attributeValues: [number('screen-size', '43')] },
        { sku: 'SAM-CU-55', name: '55 inch', price: '184999.00', weightKg: '15.000', stock: 4, attributeValues: [number('screen-size', '55')] },
      ],
    },
    {
      slug: 'tcl-p635-google-tv',
      name: 'TCL P635 4K Google TV',
      brand: 'tcl',
      category: 'led-tvs',
      shortDescription: 'Google TV with HDR and Dolby Audio.',
      description: 'Voice search, Chromecast built in and a bezel-less design.',
      warrantyInfo: '2 years official warranty',
      tags: ['tv', '4k', 'google'],
      values: [option('resolution', 'uhd'), flag('smart-tv', true), number('warranty-years', '2'), number('screen-size', '50')],
      variants: [{ sku: 'TCL-P635-50', price: '109999.00', compareAtPrice: '119999.00', weightKg: '11.000', stock: 7 }],
    },
    {
      slug: 'orient-32-hd-led-tv',
      name: 'Orient 32 inch HD LED TV',
      brand: 'orient',
      category: 'led-tvs',
      shortDescription: 'A dependable HD set for bedrooms and shops.',
      description: 'USB movie playback and a wide 170 degree viewing angle.',
      warrantyInfo: '1 year',
      tags: ['tv', 'hd'],
      values: [option('resolution', 'hd'), flag('smart-tv', false), number('warranty-years', '1'), number('screen-size', '32')],
      variants: [{ sku: 'ORI-LED-32', price: '39999.00', weightKg: '5.000', stock: 25 }],
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug } });
    if (existing) {
      await syncGallery(api, existing.id, product);
      continue;
    }
    const created = await api('POST', '/products', {
      slug: product.slug,
      name: product.name,
      brandId: refs.brands.get(product.brand),
      categoryId: refs.categories.get(product.category),
      status: 'ACTIVE',
      isFeatured: product.isFeatured ?? false,
      shortDescription: product.shortDescription,
      description: product.description,
      warrantyInfo: product.warrantyInfo,
      tags: product.tags,
      seo: { title: product.name, description: product.shortDescription },
      attributeValues: product.values,
      variants: product.variants.map(({ stock: _stock, ...variant }) => variant),
      images: galleryOf(product),
    });
    const variants = created.variants as { id: string; sku: string }[];
    for (const variant of product.variants) {
      const id = variants.find((row) => row.sku === variant.sku)?.id;
      if (!id) continue;
      await api('POST', '/inventory/items', { warehouseId: refs.warehouseId, variantId: id, onHand: variant.stock });
    }
    console.log(`product  ${product.slug}`);
  }
}

/** Front view, detail view and spec card, served by the storefront from public/media/products. */
function galleryOf(product: Pick<ProductSeed, 'slug' | 'name'>): Json[] {
  return [
    { url: `${MEDIA}/products/${product.slug}-1.svg`, alt: product.name, sortOrder: 0, isPrimary: true },
    { url: `${MEDIA}/products/${product.slug}-2.svg`, alt: `${product.name}, detail`, sortOrder: 1 },
    { url: `${MEDIA}/products/${product.slug}-3.svg`, alt: `${product.name}, key specifications`, sortOrder: 2 },
  ];
}

/**
 * Brings an already-seeded product's images up to its gallery: earlier seeds gave
 * every product one generic placeholder. Only images under the seed's media base are
 * touched, so anything an admin added by hand stays.
 */
async function syncGallery(api: Api, productId: string, product: Pick<ProductSeed, 'slug' | 'name'>): Promise<void> {
  const wanted = galleryOf(product);
  const wantedUrls = new Set(wanted.map((image) => String(image.url)));
  const current = (await api('GET', `/products/${productId}/images`)) as unknown as { id: string; url: string }[];
  const haveUrls = new Set(current.map((image) => image.url));
  for (const image of wanted) {
    if (!haveUrls.has(String(image.url))) await api('POST', `/products/${productId}/images`, image);
  }
  for (const image of current) {
    if (image.url.startsWith(`${MEDIA}/`) && !wantedUrls.has(image.url)) {
      await api('DELETE', `/products/${productId}/images/${image.id}`);
    }
  }
  if (current.length === 0 || [...wantedUrls].some((url) => !haveUrls.has(url))) {
    console.log(`images   ${product.slug}`);
  }
}

// ------------------------------------------------------------------ promotions and content

async function ensureCoupons(prisma: PrismaClient, api: Api): Promise<void> {
  const rows = [
    {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: '10',
      maxDiscount: '5000.00',
      minOrderValue: '20000.00',
      perCustomerLimit: 1,
      validFrom: '2026-01-01T00:00:00.000Z',
    },
    { code: 'FREESHIP', type: 'FREE_SHIPPING', value: '0', validFrom: '2026-01-01T00:00:00.000Z' },
  ];
  for (const row of rows) {
    if (await prisma.coupon.findUnique({ where: { code: row.code } })) continue;
    await api('POST', '/coupons', row);
    console.log(`coupon   ${row.code}`);
  }
}

async function ensureContent(prisma: PrismaClient, api: Api): Promise<void> {
  const pages = [
    {
      slug: 'about',
      title: 'About Fakhri',
      body: 'Fakhri sells electronics and home appliances across Pakistan with real specifications and honest PKR prices.\n\nEvery order is confirmed by phone before dispatch, and cash on delivery is available nationwide.',
    },
    {
      slug: 'returns',
      title: 'Returns and warranty',
      body: 'Unopened items can be returned within 14 days of delivery.\n\nManufacturer warranties are honoured through the brand service centre; keep your invoice, which carries the serial number.',
    },
    {
      slug: 'delivery',
      title: 'Delivery and store pickup',
      body: 'Home delivery is charged by zone and weight: Punjab, Sindh and Islamabad from Rs 350; Khyber Pakhtunkhwa and Balochistan from Rs 550; Gilgit-Baltistan and AJK from Rs 850, for the first 10 kg.\n\nStore pickup from our Lahore warehouse is always free.',
    },
  ];
  for (const page of pages) {
    const existing = await prisma.contentPage.findUnique({ where: { slug: page.slug } });
    if (existing) continue;
    const created = await api('POST', '/content/pages', page);
    await api('PATCH', `/content/pages/${created.id}`, { isPublished: true });
    console.log(`page     ${page.slug}`);
  }

  if ((await prisma.banner.count({ where: { position: 'home-hero' } })) === 0) {
    await api('POST', '/content/banners', {
      title: 'Beat the heat: inverter ACs from Rs 1,54,999',
      imageUrl: `${MEDIA}/hero-ac.svg`,
      linkUrl: '/category/air-conditioners',
      position: 'home-hero',
      sortOrder: 1,
    });
    await api('POST', '/content/banners', {
      title: '4K TVs with free delivery: use FREESHIP',
      imageUrl: `${MEDIA}/hero-tv.svg`,
      linkUrl: '/category/led-tvs',
      position: 'home-hero',
      sortOrder: 2,
    });
    console.log('banner   home-hero x2');
  }
}

// ------------------------------------------------------------------ http

type Api = (method: string, path: string, body?: Json) => Promise<Json>;

async function call(base: string, token: string | undefined, method: string, path: string, body?: Json): Promise<Json> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: Json; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${payload.error?.message ?? 'no body'}`);
  }
  return payload.data ?? {};
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
