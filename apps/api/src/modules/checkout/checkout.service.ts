import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
} from '@fakhri/prisma';
import { AppConfig } from '@fakhri/config';
import { AppError, conflict, invalidInput, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import { CartOwner, CartService } from '../cart/cart.service';
import { InventoryService, ReservationLine } from '../inventory/inventory.service';
import { normalizePhone } from '../customers/phone';
import { orderInclude, OrderView, serializeOrder } from '../orders/order.serialize';
import { CheckoutAddressDto, CheckoutDto } from './checkout.dto';
import { quoteDelivery } from './delivery-fee';
import { IdempotencyService } from './idempotency.service';
import { computeTotals, itemsTotalOf, priceLine, PricedLine } from './pricing';

const REF_ATTEMPTS = 3;

interface CheckoutContext extends CartOwner {
  ip?: string;
  userAgent?: string;
}

export interface CheckoutResult extends OrderView {
  /** True when this response is a replay of an earlier identical request. */
  replayed?: boolean;
}

/**
 * Order placement (docs/aidlc/04-architecture-api.md §5, REQ-19/20/23).
 *
 * Everything that must be all-or-nothing happens in one transaction: order rows,
 * stock reservation, the payment record, the audit row and the outbox event. Stock
 * is reserved through InventoryService inside that same transaction, so there is no
 * window where an order exists without its reservation.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly inventory: InventoryService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Retries on the same key return the first order rather than placing another. */
  async checkout(
    context: CheckoutContext,
    dto: CheckoutDto,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const { result, replayed } = await this.idempotency.run<OrderView>(
      'checkout',
      idempotencyKey,
      { dto, customerId: context.customerId ?? null, cartToken: context.token ?? null },
      async () => {
        const order = await this.place(context, dto);
        return { result: order, entityId: order.refNumber };
      },
    );
    return replayed ? { ...result, replayed: true } : result;
  }

  private async place(context: CheckoutContext, dto: CheckoutDto): Promise<OrderView> {
    const cart = await this.carts.require(context);
    if (cart.items.length === 0) throw new AppError('CART_EMPTY', 'Your cart is empty');

    const contact = await this.resolveContact(context, dto);
    const address = await this.resolveAddress(context, dto);

    // Every line is re-read from the catalog: the cart snapshot is a quote, not a promise.
    const lines: PricedLine[] = [];
    const reservations: ReservationLine[] = [];
    let weightKg = 0;
    for (const item of cart.items) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: item.variantId,
          isActive: true,
          product: { status: ProductStatus.ACTIVE, brand: { isActive: true }, category: { isActive: true } },
        },
        select: {
          id: true,
          sku: true,
          name: true,
          price: true,
          weightKg: true,
          isAvailableOnOrder: true,
          product: { select: { name: true } },
        },
      });
      if (!variant) {
        throw conflict('An item in your cart is no longer available', { sku: item.variant.sku });
      }
      if (!item.unitPrice.equals(variant.price)) {
        throw new AppError('PRICE_CHANGED', 'A price in your cart changed. Review the cart and try again.', {
          sku: variant.sku,
          was: item.unitPrice.toFixed(2),
          now: variant.price.toFixed(2),
        });
      }

      lines.push(
        priceLine({
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          variantName: variant.name,
          quantity: item.quantity,
          unitPrice: variant.price.toFixed(2),
        }),
      );
      reservations.push({
        variantId: variant.id,
        sku: variant.sku,
        quantity: item.quantity,
        isAvailableOnOrder: variant.isAvailableOnOrder,
      });
      weightKg += Number(variant.weightKg ?? 0) * item.quantity;
    }

    const delivery = quoteDelivery({
      deliveryType: dto.deliveryType,
      province: address?.province,
      weightKg: weightKg.toFixed(3),
    });
    const totals = computeTotals({
      itemsTotal: itemsTotalOf(lines),
      deliveryFee: delivery.fee,
      taxRatePercent: this.config.get('TAX_RATE_PERCENT', { infer: true }),
    });

    for (let attempt = 0; attempt < REF_ATTEMPTS; attempt += 1) {
      try {
        return await this.commit(context, dto, cart.id, lines, reservations, totals, address, contact);
      } catch (error) {
        if (attempt < REF_ATTEMPTS - 1 && isRefCollision(error)) continue;
        throw error;
      }
    }
    throw new AppError('INTERNAL', 'Could not allocate an order reference');
  }

  private async commit(
    context: CheckoutContext,
    dto: CheckoutDto,
    cartId: string,
    lines: PricedLine[],
    reservations: ReservationLine[],
    totals: ReturnType<typeof computeTotals>,
    address: CheckoutAddressDto | null,
    contact: { phone: string; email?: string },
  ): Promise<OrderView> {
    const refNumber = newOrderRef();

    const order = await this.prisma.$transaction(async (tx) => {
      // Lock the cart so two concurrent checkouts cannot both convert it.
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`);
      const stillOpen = await tx.cart.findFirst({ where: { id: cartId, status: 'OPEN' }, select: { id: true } });
      if (!stillOpen) throw conflict('This cart was already checked out');

      const created = await tx.order.create({
        data: {
          refNumber,
          customerId: context.customerId,
          guestPhone: context.customerId ? undefined : contact.phone,
          guestEmail: context.customerId ? undefined : contact.email,
          deliveryType: dto.deliveryType,
          addressSnapshot: address ? (address as unknown as Prisma.InputJsonValue) : undefined,
          status: OrderStatus.PENDING,
          paymentStatus:
            dto.paymentMethod === PaymentMethod.COD ? PaymentStatus.PENDING_COLLECTION : PaymentStatus.PENDING,
          itemsTotal: totals.itemsTotal,
          discountTotal: totals.discountTotal,
          deliveryFee: totals.deliveryFee,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          customerNote: dto.customerNote,
          items: {
            create: lines.map((line) => ({
              variantId: line.variantId,
              sku: line.sku,
              productName: line.productName,
              variantName: line.variantName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
          },
          history: {
            create: [
              {
                status: OrderStatus.PENDING,
                note: 'Order placed',
                actorType: context.customerId ? 'CUSTOMER' : 'GUEST',
                actorId: context.customerId,
              },
            ],
          },
          payments: {
            create: [
              {
                method: dto.paymentMethod,
                amount: totals.grandTotal,
                status:
                  dto.paymentMethod === PaymentMethod.COD
                    ? PaymentStatus.PENDING_COLLECTION
                    : PaymentStatus.PENDING,
              },
            ],
          },
        },
        select: { id: true },
      });

      // Reserve inside the same transaction: an out-of-stock line rolls the order back.
      await this.inventory.reserveForOrder(tx, created.id, reservations, context.customerId);
      await this.carts.close(tx, cartId);

      await this.audit.log(
        {
          actorType: context.customerId ? 'CUSTOMER' : 'SYSTEM',
          actorId: context.customerId,
          action: 'checkout.order.create',
          entityType: 'Order',
          entityId: created.id,
          after: { refNumber, grandTotal: totals.grandTotal, lines: lines.length },
        },
        tx,
      );
      await this.outbox.enqueue(
        {
          type: OUTBOX_EVENTS.ORDER_CREATED,
          aggregateType: 'Order',
          aggregateId: created.id,
          payload: { orderId: created.id, refNumber, grandTotal: totals.grandTotal },
        },
        tx,
      );

      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude });
    });

    return serializeOrder(order);
  }

  /** Guests must supply a phone; customers inherit theirs from the account. */
  private async resolveContact(
    context: CheckoutContext,
    dto: CheckoutDto,
  ): Promise<{ phone: string; email?: string }> {
    if (context.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: context.customerId },
        select: { phone: true, email: true },
      });
      if (!customer) throw notFound('Customer');
      return { phone: customer.phone, email: customer.email ?? undefined };
    }
    if (!dto.guestPhone) throw invalidInput('A phone number is required to place a guest order');
    return { phone: normalizePhone(dto.guestPhone), email: dto.guestEmail };
  }

  /**
   * Home delivery needs an address; store pickup does not. The address is
   * snapshotted onto the order so later edits to the address book cannot rewrite
   * where a past order went.
   */
  private async resolveAddress(
    context: CheckoutContext,
    dto: CheckoutDto,
  ): Promise<CheckoutAddressDto | null> {
    if (dto.deliveryType === DeliveryType.STORE_PICKUP) return null;

    if (dto.addressId) {
      if (!context.customerId) throw invalidInput('Sign in to use a saved address');
      const saved = await this.prisma.customerAddress.findFirst({
        where: { id: dto.addressId, customerId: context.customerId },
      });
      if (!saved) throw notFound('Address');
      return {
        recipientName: saved.recipientName,
        phone: saved.phone,
        province: saved.province,
        city: saved.city,
        area: saved.area ?? undefined,
        addressLine: saved.addressLine,
        landmark: saved.landmark ?? undefined,
      };
    }

    if (!dto.address) throw invalidInput('Home delivery needs a delivery address');
    return { ...dto.address, phone: normalizePhone(dto.address.phone) };
  }
}

/** Human-readable and hard to guess: FK-YYMMDD-XXXXXX. */
export function newOrderRef(now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `FK-${date}-${suffix}`;
}

function isRefCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target ?? '').includes('refNumber')
  );
}
