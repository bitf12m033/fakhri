import {
  DeliveryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ShipmentStatus,
} from '@fakhri/prisma';
import { moneyString } from '../catalog/catalog.serialize';

export interface OrderItemView {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string | null;
  subtotal: string | null;
}

export interface OrderView {
  refNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  itemsTotal: string | null;
  discountTotal: string | null;
  deliveryFee: string | null;
  taxTotal: string | null;
  grandTotal: string | null;
  items: OrderItemView[];
  address: Record<string, unknown> | null;
  customerNote: string | null;
  payment: { id: string; method: PaymentMethod; status: PaymentStatus; amount: string | null } | null;
  shipment: {
    carrier: string | null;
    trackingCode: string | null;
    status: ShipmentStatus;
    events: { status: ShipmentStatus; location: string | null; note: string | null; at: string }[];
  } | null;
  history: { status: OrderStatus; note: string | null; at: string }[];
  placedAt: string;
  updatedAt: string;
}

type OrderRow = {
  refNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  itemsTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  addressSnapshot: Prisma.JsonValue | null;
  customerNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: {
    variantId: string;
    sku: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
  }[];
  payments: { id: string; method: PaymentMethod; status: PaymentStatus; amount: Prisma.Decimal }[];
  history: { status: OrderStatus; note: string | null; createdAt: Date }[];
  shipment?: {
    carrier: string | null;
    trackingCode: string | null;
    status: ShipmentStatus;
    events: { status: ShipmentStatus; location: string | null; note: string | null; createdAt: Date }[];
  } | null;
};

/** What a customer sees. Internal notes and actor ids stay out. */
export function serializeOrder(row: OrderRow): OrderView {
  const payment = row.payments[0];
  return {
    refNumber: row.refNumber,
    status: row.status,
    paymentStatus: row.paymentStatus,
    deliveryType: row.deliveryType,
    itemsTotal: moneyString(row.itemsTotal),
    discountTotal: moneyString(row.discountTotal),
    deliveryFee: moneyString(row.deliveryFee),
    taxTotal: moneyString(row.taxTotal),
    grandTotal: moneyString(row.grandTotal),
    items: row.items.map((item) => ({
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: moneyString(item.unitPrice),
      subtotal: moneyString(item.subtotal),
    })),
    address: readAddress(row.addressSnapshot),
    customerNote: row.customerNote,
    payment: payment
      ? { id: payment.id, method: payment.method, status: payment.status, amount: moneyString(payment.amount) }
      : null,
    shipment: row.shipment
      ? {
          carrier: row.shipment.carrier,
          trackingCode: row.shipment.trackingCode,
          status: row.shipment.status,
          events: row.shipment.events.map((event) => ({
            status: event.status,
            location: event.location,
            note: event.note,
            at: event.createdAt.toISOString(),
          })),
        }
      : null,
    history: row.history.map((entry) => ({
      status: entry.status,
      note: entry.note,
      at: entry.createdAt.toISOString(),
    })),
    placedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const orderInclude = {
  items: { orderBy: { sku: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  history: { orderBy: { createdAt: 'asc' as const } },
  shipment: { include: { events: { orderBy: { createdAt: 'asc' as const } } } },
} satisfies Prisma.OrderInclude;

function readAddress(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
