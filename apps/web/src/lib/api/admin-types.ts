/**
 * Admin-only response shapes (apps/api admin controllers). Storefront shapes
 * live in ./types.ts; these carry internal fields the public never sees.
 */
import type { DeliveryType, Order, OrderStatus, PaymentStatus } from './types';

export interface AdminOrderRow {
  id: string;
  refNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  grandTotal: string | null;
  itemCount: number;
  contact: { type: 'CUSTOMER' | 'GUEST'; phone: string | null };
  placedAt: string;
}

export interface AdminOrder extends Order {
  id: string;
  internalNote: string | null;
  codConfirmation: boolean;
  customer: { id: string; phone: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  guestPhone: string | null;
  guestEmail: string | null;
}

export type ShipmentStatus = 'PENDING' | 'PICKUP_SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';

export interface Invoice {
  invoiceNumber: string;
  invoiceDate: string;
  seller: { name: string; ntn: string; strn: string | null; address: string; phone: string };
  buyer: { name: string | null; phone: string | null; email: string | null; address: Record<string, unknown> | null };
  lines: { description: string; sku: string; quantity: number; unitPrice: string | null; lineTotal: string | null }[];
  totals: Record<string, string | null>;
  [key: string]: unknown;
}

export interface PackingList {
  orderRef: string;
  placedAt: string;
  deliveryType: DeliveryType;
  recipient: Record<string, unknown> | null;
  contactPhone: string | null;
  customerNote: string | null;
  lines: { sku: string; description: string; quantity: number }[];
  pieces: number;
  weightKg: string;
  printedAt: string;
}

/** Order state machine, copied from apps/api orders/order-state.ts to offer only legal moves. */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};
