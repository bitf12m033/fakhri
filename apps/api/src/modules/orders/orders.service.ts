import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@fakhri/prisma';
import { AppError, buildMeta, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { currentActor } from '../../common/actor-context';
import { moneyString } from '../catalog/catalog.serialize';
import { InventoryService } from '../inventory/inventory.service';
import { AdminListOrdersQueryDto, ListOrdersQueryDto, TransitionOrderDto } from './orders.dto';
import { assertTransition, canCustomerCancel, consumesStock, releasesStock } from './order-state';
import { orderInclude, OrderView, serializeOrder } from './order.serialize';

export const ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED';

/**
 * Order lifecycle (REQ-24). Every transition is validated against the state
 * machine, recorded in history and audited, and carries its stock and payment
 * effects inside the same transaction.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** REQ-16: a customer sees their own orders with the status timeline. */
  async listForCustomer(customerId: string, query: ListOrdersQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.OrderWhereInput = { customerId, ...(query.status ? { status: query.status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: { select: { quantity: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        refNumber: row.refNumber,
        status: row.status,
        paymentStatus: row.paymentStatus,
        deliveryType: row.deliveryType,
        grandTotal: moneyString(row.grandTotal),
        itemCount: row.items.reduce((count, item) => count + item.quantity, 0),
        placedAt: row.createdAt.toISOString(),
      })),
      meta: buildMeta(total, skip, take),
    };
  }

  async getForCustomer(customerId: string, refNumber: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { refNumber, customerId },
      include: orderInclude,
    });
    if (!order) throw notFound('Order');
    return serializeOrder(order);
  }

  /** Customers may cancel only while the order is still PENDING (REQ-24). */
  async cancelByCustomer(customerId: string, refNumber: string, note?: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { refNumber, customerId },
      select: { id: true, status: true },
    });
    if (!order) throw notFound('Order');
    if (!canCustomerCancel(order.status)) {
      throw new AppError('ORDER_STATUS_INVALID', 'This order can no longer be cancelled here', {
        status: order.status,
      });
    }
    return this.applyTransition(order.id, OrderStatus.CANCELLED, note ?? 'Cancelled by customer', {
      actorType: 'CUSTOMER',
      actorId: customerId,
    });
  }

  async listForAdmin(query: AdminListOrdersQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.q) {
      where.OR = [
        { refNumber: { contains: query.q, mode: 'insensitive' } },
        { guestPhone: { contains: query.q } },
        { customer: { phone: { contains: query.q } } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          customer: { select: { id: true, phone: true, firstName: true, lastName: true } },
          items: { select: { quantity: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        refNumber: row.refNumber,
        status: row.status,
        paymentStatus: row.paymentStatus,
        deliveryType: row.deliveryType,
        grandTotal: moneyString(row.grandTotal),
        itemCount: row.items.reduce((count, item) => count + item.quantity, 0),
        contact: row.customer ? { type: 'CUSTOMER', phone: row.customer.phone } : { type: 'GUEST', phone: row.guestPhone },
        placedAt: row.createdAt.toISOString(),
      })),
      meta: buildMeta(total, skip, take),
    };
  }

  async getForAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...orderInclude,
        customer: { select: { id: true, phone: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!order) throw notFound('Order');
    return {
      ...serializeOrder(order),
      id: order.id,
      internalNote: order.internalNote,
      codConfirmation: order.codConfirmation,
      customer: order.customer,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
    };
  }

  async transitionByAdmin(id: string, dto: TransitionOrderDto): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) throw notFound('Order');
    const actorId = currentActor()?.principal?.id;
    return this.applyTransition(id, dto.status, dto.note, { actorType: 'ADMIN', actorId });
  }

  /**
   * The transition and its effects share one transaction, and the order row is
   * locked first so two admins cannot advance the same order concurrently.
   *
   * Effects (docs/aidlc/02-requirements.md §2): CANCELLED releases the reservation
   * and voids the pending payment attempt; SHIPPED and DELIVERED consume the
   * reservation, which is idempotent because InventoryService derives what is
   * still held from the ledger; DELIVERED collects a COD payment.
   */
  private async applyTransition(
    orderId: string,
    to: OrderStatus,
    note: string | undefined,
    actor: { actorType: 'ADMIN' | 'CUSTOMER' | 'SYSTEM'; actorId?: string },
  ): Promise<OrderView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`);
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
      });
      assertTransition(current.status, to);

      if (releasesStock(to)) await this.inventory.releaseForOrder(tx, orderId, actor.actorId);
      if (consumesStock(to)) await this.inventory.consumeForOrder(tx, orderId, actor.actorId);

      const payment = current.payments[0];
      let paymentStatus = current.paymentStatus;
      if (releasesStock(to) && payment && isPending(payment.status)) {
        paymentStatus = PaymentStatus.FAILED;
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      }
      const collectsCod =
        to === OrderStatus.DELIVERED && payment?.method === PaymentMethod.COD && isPending(payment.status);
      if (collectsCod && payment) {
        paymentStatus = PaymentStatus.COLLECTED;
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.COLLECTED, paidAt: new Date() },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: to,
          paymentStatus,
          codConfirmation: collectsCod ? true : undefined,
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status: to, note, actorType: actor.actorType, actorId: actor.actorId },
      });
      await this.audit.log(
        {
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: 'orders.status.change',
          entityType: 'Order',
          entityId: orderId,
          before: { status: current.status, paymentStatus: current.paymentStatus },
          after: { status: to, paymentStatus },
        },
        tx,
      );
      await this.outbox.enqueue(
        {
          type: ORDER_STATUS_CHANGED,
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, refNumber: current.refNumber, from: current.status, to },
        },
        tx,
      );

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });

    return serializeOrder(updated);
  }
}

function isPending(status: PaymentStatus): boolean {
  return status === PaymentStatus.PENDING || status === PaymentStatus.PENDING_COLLECTION;
}
