import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from '@fakhri/prisma';
import { AppConfig } from '@fakhri/config';
import { conflict, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../common/actor-context';
import { moneyString } from '../catalog/catalog.serialize';
import { OrdersService } from '../orders/orders.service';
import { assertShipmentTransition, deliversOrder, shipsOrder } from './shipment-state';
import { ShipmentEventDto, UpsertShipmentDto } from './shipping.dto';

export interface ShipmentView {
  id: string;
  carrier: string | null;
  trackingCode: string | null;
  status: ShipmentStatus;
  events: { status: ShipmentStatus; location: string | null; note: string | null; at: string }[];
  updatedAt: string;
}

/**
 * Shipments and manual tracking (REQ-31). Shipment status and order status are
 * kept in step: marking a parcel in transit ships the order, and marking it
 * delivered delivers the order, which is what collects COD.
 */
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Create the shipment or amend its carrier and tracking code. */
  async upsert(orderId: string, dto: UpsertShipmentDto): Promise<ShipmentView> {
    const order = await this.requireShippableOrder(orderId);
    const existing = await this.prisma.shipment.findUnique({ where: { orderId } });

    const shipment = existing
      ? await this.prisma.shipment.update({
          where: { orderId },
          data: { carrier: dto.carrier, trackingCode: dto.trackingCode },
        })
      : await this.prisma.shipment.create({
          data: {
            orderId,
            carrier: dto.carrier,
            trackingCode: dto.trackingCode,
            events: { create: [{ status: ShipmentStatus.PENDING, note: 'Shipment created' }] },
          },
        });

    await this.audit.log({
      action: existing ? 'shipping.shipment.update' : 'shipping.shipment.create',
      entityType: 'Shipment',
      entityId: shipment.id,
      after: { orderId: order.id, carrier: dto.carrier, trackingCode: dto.trackingCode },
    });
    return this.view(orderId);
  }

  /**
   * Record a tracking event and, when it means the parcel moved, advance the
   * order in the same transaction. The order must already be in the matching
   * state, so the two machines cannot drift apart.
   */
  async addEvent(orderId: string, dto: ShipmentEventDto): Promise<ShipmentView> {
    const actorId = currentActor()?.principal?.id;

    await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { orderId },
        include: { order: { select: { id: true, status: true } } },
      });
      if (!shipment) throw notFound('Shipment');
      assertShipmentTransition(shipment.status, dto.status);

      if (shipsOrder(dto.status)) {
        if (shipment.order.status !== OrderStatus.PACKED) {
          throw conflict('Pack the order before the parcel goes in transit', {
            orderStatus: shipment.order.status,
          });
        }
        await this.orders.transitionWithin(tx, orderId, OrderStatus.SHIPPED, dto.note ?? 'Handed to carrier', {
          actorType: 'ADMIN',
          actorId,
        });
      }
      if (deliversOrder(dto.status)) {
        if (shipment.order.status !== OrderStatus.SHIPPED) {
          throw conflict('The order must be shipped before it can be delivered', {
            orderStatus: shipment.order.status,
          });
        }
        await this.orders.transitionWithin(tx, orderId, OrderStatus.DELIVERED, dto.note ?? 'Delivered', {
          actorType: 'ADMIN',
          actorId,
        });
      }

      await tx.shipment.update({ where: { orderId }, data: { status: dto.status } });
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, status: dto.status, location: dto.location, note: dto.note },
      });
      await this.audit.log(
        {
          actorType: 'ADMIN',
          actorId,
          action: 'shipping.shipment.event',
          entityType: 'Shipment',
          entityId: shipment.id,
          before: { status: shipment.status },
          after: { status: dto.status, location: dto.location },
        },
        tx,
      );
    });

    return this.view(orderId);
  }

  async view(orderId: string): Promise<ShipmentView> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!shipment) throw notFound('Shipment');
    return {
      id: shipment.id,
      carrier: shipment.carrier,
      trackingCode: shipment.trackingCode,
      status: shipment.status,
      events: shipment.events.map((event) => ({
        status: event.status,
        location: event.location,
        note: event.note,
        at: event.createdAt.toISOString(),
      })),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }

  /**
   * Data for a printed label. Returned as JSON rather than a rendered PDF: the
   * admin UI prints it in 3.8, and the courier's own format differs per carrier.
   */
  async label(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        shipment: true,
        items: { include: { variant: { select: { weightKg: true } } } },
        payments: { orderBy: { createdAt: 'asc' } },
        customer: { select: { phone: true } },
      },
    });
    if (!order) throw notFound('Order');
    if (!order.shipment) throw notFound('Shipment');

    const weightKg = order.items.reduce(
      (total, item) => total + Number(item.variant.weightKg ?? 0) * item.quantity,
      0,
    );
    const codPayment = order.payments.find(
      (payment) => payment.method === PaymentMethod.COD && payment.status === PaymentStatus.PENDING_COLLECTION,
    );

    return {
      orderRef: order.refNumber,
      carrier: order.shipment.carrier,
      trackingCode: order.shipment.trackingCode,
      from: {
        name: this.config.get('SELLER_NAME', { infer: true }),
        address: this.config.get('SELLER_ADDRESS', { infer: true }),
        phone: this.config.get('SELLER_PHONE', { infer: true }),
      },
      to: order.addressSnapshot,
      contactPhone: order.customer?.phone ?? order.guestPhone,
      pieces: order.items.reduce((count, item) => count + item.quantity, 0),
      weightKg: weightKg.toFixed(3),
      /** Amount the courier must collect, or null when the order is already paid. */
      collectOnDelivery: codPayment ? moneyString(codPayment.amount) : null,
      printedAt: new Date().toISOString(),
    };
  }

  private async requireShippableOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, deliveryType: true },
    });
    if (!order) throw notFound('Order');
    if (order.deliveryType === DeliveryType.STORE_PICKUP) {
      throw conflict('A store pickup order is collected in person, so it has no shipment');
    }
    if (order.status === OrderStatus.CANCELLED) throw conflict('This order was cancelled');
    if (order.status === OrderStatus.PENDING || order.status === OrderStatus.CONFIRMED) {
      throw conflict('Pack the order before creating a shipment', { orderStatus: order.status });
    }
    return order;
  }
}
