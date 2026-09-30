import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@fakhri/prisma';
import { invalidInput } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvColumn, toCsv } from './csv';
import { LowStockDto, SalesReportDto, TopProductsDto } from './reports.dto';

export interface SalesRow {
  date: string;
  orders: number;
  itemsTotal: string;
  discountTotal: string;
  deliveryFee: string;
  taxTotal: string;
  grandTotal: string;
}

export interface TopProductRow {
  sku: string;
  productName: string;
  quantity: number;
  revenue: string;
}

export interface LowStockRow {
  sku: string;
  productName: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface CodOutstandingRow {
  refNumber: string;
  status: OrderStatus;
  phone: string | null;
  amount: string;
  placedAt: string;
}

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 400;

/**
 * Admin reports (REQ-35). Money is summed in SQL and cast to text, so totals
 * never pass through a float on the way to a spreadsheet (REQ-40).
 *
 * Cancelled orders are excluded from revenue unless the caller asks for that
 * status explicitly: a cancelled order is not a sale.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesByDay(query: SalesReportDto): Promise<SalesRow[]> {
    const { from, to } = this.window(query.from, query.to);
    const statusFilter = query.status
      ? Prisma.sql`AND o."status" = ${query.status}::"OrderStatus"`
      : Prisma.sql`AND o."status" <> 'CANCELLED'::"OrderStatus"`;

    return this.prisma.$queryRaw<SalesRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', o."createdAt"), 'YYYY-MM-DD') AS date,
             count(*)::int AS orders,
             sum(o."itemsTotal")::text AS "itemsTotal",
             sum(o."discountTotal")::text AS "discountTotal",
             sum(o."deliveryFee")::text AS "deliveryFee",
             sum(o."taxTotal")::text AS "taxTotal",
             sum(o."grandTotal")::text AS "grandTotal"
        FROM "Order" o
       WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
             ${statusFilter}
       GROUP BY date_trunc('day', o."createdAt")
       ORDER BY date_trunc('day', o."createdAt") ASC
    `);
  }

  async topProducts(query: TopProductsDto): Promise<TopProductRow[]> {
    const { from, to } = this.window(query.from, query.to);
    const limit = query.limit ?? 20;

    return this.prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
      SELECT oi."sku",
             max(oi."productName") AS "productName",
             sum(oi."quantity")::int AS quantity,
             sum(oi."subtotal")::text AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
       WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
         AND o."status" <> 'CANCELLED'::"OrderStatus"
       GROUP BY oi."sku"
       ORDER BY quantity DESC, revenue DESC
       LIMIT ${limit}
    `);
  }

  async lowStock(query: LowStockDto): Promise<LowStockRow[]> {
    const threshold = query.threshold ?? 5;
    return this.prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
      SELECT v."sku",
             p."name" AS "productName",
             w."code" AS warehouse,
             ii."onHand"::int AS "onHand",
             ii."reserved"::int AS reserved,
             (ii."onHand" - ii."reserved")::int AS available
        FROM "InventoryItem" ii
        JOIN "ProductVariant" v ON v.id = ii."variantId"
        JOIN "Product" p ON p.id = v."productId"
        JOIN "Warehouse" w ON w.id = ii."warehouseId"
       WHERE w."isActive" AND v."isActive"
         AND (ii."onHand" - ii."reserved") <= ${threshold}
       ORDER BY available ASC, v."sku" ASC
       LIMIT 500
    `);
  }

  /** Money the couriers still owe us (REQ-35). */
  async codOutstanding(): Promise<CodOutstandingRow[]> {
    return this.prisma.$queryRaw<CodOutstandingRow[]>(Prisma.sql`
      SELECT o."refNumber",
             o."status",
             coalesce(c."phone", o."guestPhone") AS phone,
             pay."amount"::text AS amount,
             to_char(o."createdAt", 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "placedAt"
        FROM "Payment" pay
        JOIN "Order" o ON o.id = pay."orderId"
        LEFT JOIN "Customer" c ON c.id = o."customerId"
       WHERE pay."method" = 'COD'::"PaymentMethod"
         AND pay."status" = 'PENDING_COLLECTION'::"PaymentStatus"
         AND o."status" <> 'CANCELLED'::"OrderStatus"
       ORDER BY o."createdAt" ASC
       LIMIT 500
    `);
  }

  // ---------------------------------------------------------------- CSV shapes

  salesCsv(rows: readonly SalesRow[]): string {
    return toCsv(rows, [
      { header: 'Date', value: (row) => row.date },
      { header: 'Orders', value: (row) => row.orders },
      { header: 'Items total', value: (row) => row.itemsTotal },
      { header: 'Discount', value: (row) => row.discountTotal },
      { header: 'Delivery', value: (row) => row.deliveryFee },
      { header: 'Tax', value: (row) => row.taxTotal },
      { header: 'Grand total', value: (row) => row.grandTotal },
    ] satisfies CsvColumn<SalesRow>[]);
  }

  topProductsCsv(rows: readonly TopProductRow[]): string {
    return toCsv(rows, [
      { header: 'SKU', value: (row) => row.sku },
      { header: 'Product', value: (row) => row.productName },
      { header: 'Quantity', value: (row) => row.quantity },
      { header: 'Revenue', value: (row) => row.revenue },
    ] satisfies CsvColumn<TopProductRow>[]);
  }

  lowStockCsv(rows: readonly LowStockRow[]): string {
    return toCsv(rows, [
      { header: 'SKU', value: (row) => row.sku },
      { header: 'Product', value: (row) => row.productName },
      { header: 'Warehouse', value: (row) => row.warehouse },
      { header: 'On hand', value: (row) => row.onHand },
      { header: 'Reserved', value: (row) => row.reserved },
      { header: 'Available', value: (row) => row.available },
    ] satisfies CsvColumn<LowStockRow>[]);
  }

  codOutstandingCsv(rows: readonly CodOutstandingRow[]): string {
    return toCsv(rows, [
      { header: 'Order', value: (row) => row.refNumber },
      { header: 'Status', value: (row) => row.status },
      { header: 'Phone', value: (row) => row.phone },
      { header: 'Amount', value: (row) => row.amount },
      { header: 'Placed at', value: (row) => row.placedAt },
    ] satisfies CsvColumn<CodOutstandingRow>[]);
  }

  /** Defaults to the last 30 days; a window wider than 400 days is refused. */
  private window(from?: string, to?: string): { from: Date; to: Date } {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw invalidInput('from and to must be valid dates');
    }
    if (start > end) throw invalidInput('from must not be after to');
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 86_400_000) {
      throw invalidInput(`Report windows are limited to ${MAX_WINDOW_DAYS} days`);
    }
    // `to` is exclusive at day resolution, so a same-day range still returns that day.
    return { from: start, to: new Date(end.getTime() + 1000) };
  }
}
