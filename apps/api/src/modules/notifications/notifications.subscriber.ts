import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@fakhri/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxDispatcher, OutboxEnvelopeRow, OutboxHandler } from '../../outbox/outbox.dispatcher';
import { NotificationsService } from './notifications.service';
import {
  OrderContext,
  renderOrderPlaced,
  renderPaymentSucceeded,
  renderStatusChange,
} from './templates';

const HANDLED: readonly string[] = [
  OUTBOX_EVENTS.ORDER_CREATED,
  OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
  OUTBOX_EVENTS.PAYMENT_SUCCEEDED,
];

/**
 * Turns committed events into customer messages (REQ-25). Registers itself with
 * the dispatcher at boot, so nothing in the producing modules knows notifications
 * exist. Delivery is at-least-once, and a duplicate message is harmless.
 */
@Injectable()
export class NotificationSubscriber implements OutboxHandler, OnModuleInit {
  readonly name = 'notifications';
  private readonly logger = new Logger('NotificationSubscriber');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly dispatcher: OutboxDispatcher,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register(this);
  }

  handles(type: string): boolean {
    return HANDLED.includes(type);
  }

  async handle(event: OutboxEnvelopeRow): Promise<void> {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : event.aggregateId;
    const context = await this.contextFor(orderId);
    if (!context) {
      // The order is gone (test cleanup, or a purge): nothing to tell anyone.
      this.logger.warn(`no order for ${event.type} ${event.id}`);
      return;
    }

    if (event.type === OUTBOX_EVENTS.ORDER_CREATED) {
      await this.notifications.deliver(renderOrderPlaced(context));
      return;
    }
    if (event.type === OUTBOX_EVENTS.PAYMENT_SUCCEEDED) {
      await this.notifications.deliver(renderPaymentSucceeded(context));
      return;
    }
    const to = typeof payload.to === 'string' ? (payload.to as OrderStatus) : undefined;
    if (to) await this.notifications.deliver(renderStatusChange(context, to));
  }

  private async contextFor(orderId: string): Promise<OrderContext | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        refNumber: true,
        grandTotal: true,
        guestPhone: true,
        guestEmail: true,
        customer: { select: { phone: true, email: true, firstName: true } },
        shipment: { select: { carrier: true, trackingCode: true } },
      },
    });
    if (!order) return null;
    return {
      refNumber: order.refNumber,
      grandTotal: order.grandTotal.toFixed(2),
      phone: order.customer?.phone ?? order.guestPhone,
      email: order.customer?.email ?? order.guestEmail,
      name: order.customer?.firstName ?? null,
      carrier: order.shipment?.carrier ?? null,
      trackingCode: order.shipment?.trackingCode ?? null,
    };
  }
}
