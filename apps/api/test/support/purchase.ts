import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { UserRole } from '@fakhri/prisma';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createAdmin } from './admin';

export interface PurchaseFixture {
  adminToken: string;
  adminId: string;
  warehouseId: string;
  /** Stocked variant: 54999.00, 12.5 kg, opening stock as requested. */
  variantId: string;
  sku: string;
  price: string;
  /** Sells with no stock at all (REQ-28). */
  backorderVariantId: string;
  productSlug: string;
}

/**
 * A published product with real stock, the minimum a purchase test needs.
 * Seeded through the admin API so the test exercises the same paths an operator
 * would, except inventory rows, which have their own admin endpoints from 3.5.
 */
export async function seedPurchaseFixture(
  app: INestApplication,
  run: string,
  options: { onHand?: number } = {},
): Promise<PurchaseFixture> {
  const admin = await createAdmin(app, UserRole.SUPER_ADMIN, 'purchase');
  const token = admin.token;

  const brand = await post(app, token, '/brands', { name: `Brand ${run}`, slug: `${run}-brand` });
  const category = await post(app, token, '/categories', { name: `Category ${run}`, slug: `${run}-cat` });
  const product = await post(app, token, '/products', {
    name: `Appliance ${run}`,
    slug: `${run}-product`,
    brandId: brand.id,
    categoryId: category.id,
    status: 'ACTIVE',
    variants: [
      { sku: `${run}-STOCKED`, price: '54999.00', weightKg: '12.500' },
      { sku: `${run}-BACKORDER`, price: '9999.00', weightKg: '1.000', isAvailableOnOrder: true },
    ],
  });
  const stocked = product.variants.find((variant: { sku: string }) => variant.sku.endsWith('-STOCKED'));
  const backorder = product.variants.find((variant: { sku: string }) => variant.sku.endsWith('-BACKORDER'));

  const warehouse = await post(app, token, '/inventory/warehouses', {
    code: `${run}-WH`.toUpperCase().slice(0, 20),
    name: `Warehouse ${run}`,
    address: 'Test hub',
    city: 'Lahore',
  });
  await post(app, token, '/inventory/items', {
    warehouseId: warehouse.id,
    variantId: stocked.id,
    onHand: options.onHand ?? 5,
  });

  return {
    adminToken: token,
    adminId: admin.id,
    warehouseId: warehouse.id,
    variantId: stocked.id,
    sku: stocked.sku,
    price: '54999.00',
    backorderVariantId: backorder.id,
    productSlug: `${run}-product`,
  };
}

/** Sellable and reserved counts straight from the table, for invariant checks. */
export async function stockOf(
  prisma: PrismaService,
  variantId: string,
): Promise<{ onHand: number; reserved: number; available: number }> {
  const rows = await prisma.inventoryItem.findMany({ where: { variantId } });
  const onHand = rows.reduce((total, row) => total + row.onHand, 0);
  const reserved = rows.reduce((total, row) => total + row.reserved, 0);
  return { onHand, reserved, available: onHand - reserved };
}

/**
 * Orders, ledger rows and cart lines all reference variants with ON DELETE
 * RESTRICT, so they have to go before the catalog rows they point at.
 */
export async function cleanupPurchase(prisma: PrismaService, prefix: string): Promise<void> {
  const variants = await prisma.productVariant.findMany({
    where: { product: { slug: { startsWith: prefix } } },
    select: { id: true },
  });
  const variantIds = variants.map((variant) => variant.id);

  if (variantIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { items: { some: { variantId: { in: variantIds } } } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      // Shipment references Order with ON DELETE RESTRICT; its events cascade.
      await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.stockLedger.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.stockAdjustment.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.wishlistItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: { in: variantIds } } });
  }

  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.warehouse.deleteMany({ where: { code: { startsWith: prefix.toUpperCase() } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: prefix } } });
}

async function post(app: INestApplication, token: string, path: string, body: unknown) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/admin${path}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data;
}
