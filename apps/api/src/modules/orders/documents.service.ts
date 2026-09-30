import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { notFound, sub } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { moneyString } from '../catalog/catalog.serialize';

/**
 * Printable order documents (REQ-31, REQ-40). Returned as structured data rather
 * than rendered PDFs: the admin UI lays them out and prints in increment 3.8, and
 * keeping the numbers here means one source of truth for the money on them.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Invoice with the fields FBR expects on a sales tax invoice. */
  async invoice(orderId: string) {
    const order = await this.require(orderId);
    const taxTotal = order.taxTotal.toFixed(2);
    const netOfTax = sub(order.itemsTotal.toFixed(2), order.discountTotal.toFixed(2)).toFixed(2);

    return {
      invoiceNumber: `${order.refNumber}-INV`,
      invoiceDate: order.createdAt.toISOString(),
      seller: {
        name: this.config.get('SELLER_NAME', { infer: true }),
        ntn: this.config.get('SELLER_NTN', { infer: true }),
        strn: this.config.get('SELLER_STRN', { infer: true }) ?? null,
        address: this.config.get('SELLER_ADDRESS', { infer: true }),
        phone: this.config.get('SELLER_PHONE', { infer: true }),
      },
      buyer: {
        name: order.customer
          ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || null
          : null,
        phone: order.customer?.phone ?? order.guestPhone,
        email: order.customer?.email ?? order.guestEmail,
        address: order.addressSnapshot,
      },
      lines: order.items.map((item) => ({
        description: [item.productName, item.variantName].filter(Boolean).join(' — '),
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: moneyString(item.unitPrice),
        lineTotal: moneyString(item.subtotal),
      })),
      totals: {
        itemsTotal: moneyString(order.itemsTotal),
        discountTotal: moneyString(order.discountTotal),
        valueExcludingTax: netOfTax,
        salesTax: taxTotal,
        deliveryFee: moneyString(order.deliveryFee),
        grandTotal: moneyString(order.grandTotal),
      },
      /** With no separate tax line, catalog prices are treated as tax-inclusive. */
      pricesIncludeTax: taxTotal === '0.00',
      payment: order.payments[0]
        ? { method: order.payments[0].method, status: order.payments[0].status }
        : null,
      deliveryType: order.deliveryType,
    };
  }

  /** What the warehouse picks and packs. No prices: pickers do not need them. */
  async packingList(orderId: string) {
    const order = await this.require(orderId);
    const weightKg = order.items.reduce(
      (total, item) => total + Number(item.variant.weightKg ?? 0) * item.quantity,
      0,
    );
    return {
      orderRef: order.refNumber,
      placedAt: order.createdAt.toISOString(),
      deliveryType: order.deliveryType,
      recipient: order.addressSnapshot,
      contactPhone: order.customer?.phone ?? order.guestPhone,
      customerNote: order.customerNote,
      lines: order.items.map((item) => ({
        sku: item.sku,
        description: [item.productName, item.variantName].filter(Boolean).join(' — '),
        quantity: item.quantity,
      })),
      pieces: order.items.reduce((count, item) => count + item.quantity, 0),
      weightKg: weightKg.toFixed(3),
      printedAt: new Date().toISOString(),
    };
  }

  private async require(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { sku: 'asc' }, include: { variant: { select: { weightKg: true } } } },
        payments: { orderBy: { createdAt: 'asc' } },
        customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
      },
    });
    if (!order) throw notFound('Order');
    return order;
  }
}
