import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@fakhri/prisma';
import { AppError, conflict, invalidInput, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import { currentActor } from '../../common/actor-context';
import { moneyString } from '../catalog/catalog.serialize';
import { normalizePhone } from '../customers/phone';
import { OrdersService } from '../orders/orders.service';
import { Principal } from '../auth/principal';
import { MockPaymentGateway, PaymentGateway, SessionResponse } from './gateway';
import { assertPaymentTransition, isOpen, isSettled } from './payment-state';
import { InitiatePaymentDto, SetPaymentStatusDto } from './payments.dto';


export interface CallbackResult {
  gatewayRef: string;
  status: PaymentStatus;
  /** True when this callback had already been applied. */
  duplicate: boolean;
}

/**
 * Payment ledger and the gateway boundary (REQ-21).
 *
 * Payment rows are never rewritten beyond their status and settlement metadata,
 * and a settled payment advances its order inside the same transaction, so a
 * paid order cannot be left sitting in PENDING.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly gateways: Map<string, PaymentGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    mock: MockPaymentGateway,
  ) {
    this.gateways = new Map([[mock.name, mock as PaymentGateway]]);
  }

  gateway(name: string): PaymentGateway {
    const gateway = this.gateways.get(name.toLowerCase());
    if (!gateway) throw notFound('Payment gateway');
    return gateway;
  }

  /**
   * Hand back a hosted-checkout session. Calling it again while the session is
   * still valid returns the same one rather than orphaning the previous ref.
   */
  async initiate(
    paymentId: string,
    dto: InitiatePaymentDto,
    principal: Principal | undefined,
  ): Promise<SessionResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            id: true,
            refNumber: true,
            status: true,
            customerId: true,
            guestPhone: true,
            guestEmail: true,
            customer: { select: { phone: true, email: true } },
          },
        },
      },
    });
    if (!payment) throw notFound('Payment');
    this.authorize(payment.order, dto, principal);

    if (payment.method === PaymentMethod.COD) {
      throw invalidInput('Cash on delivery is collected by the courier, not online');
    }
    if (!isOpen(payment.status)) {
      throw conflict('This payment is no longer open', { status: payment.status });
    }
    if (payment.order.status === OrderStatus.CANCELLED) {
      throw conflict('This order was cancelled');
    }

    const existing = readSession(payment.meta);
    if (payment.gatewayRef && existing && Date.parse(existing.expiresAt) > Date.now()) {
      return existing;
    }

    const gateway = this.gateway(MOCK_NAME);
    const session = await gateway.createSession({
      paymentId: payment.id,
      orderRef: payment.order.refNumber,
      amount: payment.amount.toFixed(2),
      customerPhone: payment.order.customer?.phone ?? payment.order.guestPhone ?? '',
      customerEmail: payment.order.customer?.email ?? payment.order.guestEmail ?? undefined,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gateway: session.gateway,
        gatewayRef: session.gatewayRef,
        meta: session as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      actorType: principal ? 'CUSTOMER' : 'SYSTEM',
      actorId: principal?.id,
      action: 'payments.session.create',
      entityType: 'Payment',
      entityId: payment.id,
      after: { gateway: session.gateway, gatewayRef: session.gatewayRef },
    });
    return session;
  }

  /**
   * Provider callback (REQ-21). The signature is verified against the raw body,
   * the amount must match the ledger, and a replay is answered without changing
   * anything so the provider's retries stay harmless.
   */
  async handleCallback(
    gatewayName: string,
    body: unknown,
    rawBody: string,
    signature: string | undefined,
  ): Promise<CallbackResult> {
    const gateway = this.gateway(gatewayName);
    if (!gateway.verifySignature(rawBody, signature)) {
      throw new AppError('UNAUTHENTICATED', 'Callback signature did not verify');
    }
    const parsed = gateway.parseCallback(body);

    const payment = await this.prisma.payment.findUnique({
      where: { gateway_gatewayRef: { gateway: gateway.name, gatewayRef: parsed.gatewayRef } },
      include: { order: { select: { id: true, status: true, refNumber: true } } },
    });
    if (!payment) throw notFound('Payment');
    if (payment.amount.toFixed(2) !== parsed.amount) {
      throw conflict('Callback amount does not match the payment', {
        expected: payment.amount.toFixed(2),
        received: parsed.amount,
      });
    }

    const target = parsed.outcome === 'SUCCEEDED' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
    if (payment.status === target) {
      this.logger.log(`callback replay for ${parsed.gatewayRef} (${target})`);
      return { gatewayRef: parsed.gatewayRef, status: target, duplicate: true };
    }
    assertPaymentTransition(payment.status, target);

    await this.settle(payment.id, payment.order.id, payment.order.status, target, {
      actorType: 'SYSTEM',
      action: 'payments.callback.apply',
      meta: { gatewayRef: parsed.gatewayRef, raw: parsed.raw },
    });
    return { gatewayRef: parsed.gatewayRef, status: target, duplicate: false };
  }

  /** Operator correction for bank transfers and early COD collection (REQ-31). */
  async setStatusByAdmin(orderId: string, dto: SetPaymentStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw notFound('Order');
    const payment = order.payments[0];
    if (!payment) throw notFound('Payment');
    assertPaymentTransition(payment.status, dto.status);

    await this.settle(payment.id, order.id, order.status, dto.status, {
      actorType: 'ADMIN',
      actorId: currentActor()?.principal?.id,
      action: 'payments.status.set',
      note: dto.note,
      meta: dto.reference ? { reference: dto.reference } : undefined,
    });
    return this.viewFor(orderId);
  }

  async viewFor(orderId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amount: moneyString(payment.amount),
      gateway: payment.gateway,
      gatewayRef: payment.gatewayRef,
      paidAt: payment.paidAt?.toISOString() ?? null,
    }));
  }

  /**
   * Apply a settlement: the payment row, the order's payment status, the audit
   * row, the outbox event and — when the money is in and the order is still
   * PENDING — the order's own move to CONFIRMED, all in one transaction.
   */
  private async settle(
    paymentId: string,
    orderId: string,
    orderStatus: OrderStatus,
    to: PaymentStatus,
    context: {
      actorType: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
      actorId?: string;
      action: string;
      note?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      assertPaymentTransition(current.status, to);

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: to,
          paidAt: isSettled(to) ? new Date() : null,
          meta: context.meta
            ? ({ ...(readJson(current.meta) ?? {}), ...context.meta } as Prisma.InputJsonValue)
            : undefined,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: to } });

      // Money in on a fresh order confirms it; the state machine does the checking.
      if (isSettled(to) && orderStatus === OrderStatus.PENDING) {
        await this.orders.transitionWithin(tx, orderId, OrderStatus.CONFIRMED, context.note ?? 'Payment received', {
          actorType: context.actorType,
          actorId: context.actorId,
        });
      }

      await this.audit.log(
        {
          actorType: context.actorType,
          actorId: context.actorId,
          action: context.action,
          entityType: 'Payment',
          entityId: paymentId,
          before: { status: current.status },
          after: { status: to, note: context.note },
        },
        tx,
      );
      if (isSettled(to)) {
        await this.outbox.enqueue(
          {
            type: OUTBOX_EVENTS.PAYMENT_SUCCEEDED,
            aggregateType: 'Payment',
            aggregateId: paymentId,
            payload: { paymentId, orderId, status: to, amount: current.amount.toFixed(2) },
          },
          tx,
        );
      }
    });
  }

  /** A customer owns the order, or a guest knows its reference and phone. */
  private authorize(
    order: { refNumber: string; customerId: string | null; guestPhone: string | null },
    dto: InitiatePaymentDto,
    principal: Principal | undefined,
  ): void {
    if (principal?.type === 'CUSTOMER') {
      if (order.customerId !== principal.id) throw notFound('Payment');
      return;
    }
    if (order.customerId) throw new AppError('UNAUTHENTICATED', 'Sign in to pay for this order');
    if (!dto.refNumber || !dto.guestPhone) {
      throw invalidInput('Provide the order reference and the phone number you ordered with');
    }
    const phone = normalizePhone(dto.guestPhone);
    if (dto.refNumber !== order.refNumber || order.guestPhone !== phone) throw notFound('Payment');
  }
}

const MOCK_NAME = 'mock';

function readJson(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readSession(value: Prisma.JsonValue | null): SessionResponse | null {
  const meta = readJson(value);
  if (!meta || typeof meta.redirectUrl !== 'string' || typeof meta.expiresAt !== 'string') return null;
  return meta as unknown as SessionResponse;
}
