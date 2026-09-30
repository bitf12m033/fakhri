import { OrderStatus } from '@fakhri/prisma';
import { formatPKR } from '@fakhri/shared';

export type NotificationChannel = 'SMS' | 'EMAIL';

export interface NotificationMessage {
  channel: NotificationChannel;
  to: string;
  subject: string;
  body: string;
  event: string;
}

export interface OrderContext {
  refNumber: string;
  grandTotal: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  carrier?: string | null;
  trackingCode?: string | null;
}

/**
 * Message templates for order and payment events (REQ-25). Pure: the adapter
 * decides how to deliver, this decides what is said. SMS is the primary channel
 * in this market, so every message has an SMS form and email is a bonus.
 */
export function renderOrderPlaced(context: OrderContext): NotificationMessage[] {
  const total = formatPKR(context.grandTotal);
  return fanOut(context, 'ORDER_CREATED', {
    subject: `Order ${context.refNumber} received`,
    sms: `Thank you${context.name ? ` ${context.name}` : ''}! Order ${context.refNumber} for ${total} is received. We will confirm shortly.`,
    email:
      `We have your order ${context.refNumber}.\n\n` +
      `Total: ${total}\n\n` +
      'You will hear from us again when it is confirmed.',
  });
}

export function renderStatusChange(context: OrderContext, status: OrderStatus): NotificationMessage[] {
  const copy = STATUS_COPY[status];
  if (!copy) return [];
  const tracking =
    context.trackingCode && context.carrier
      ? ` Track with ${context.carrier}: ${context.trackingCode}.`
      : '';
  return fanOut(context, 'ORDER_STATUS_CHANGED', {
    subject: `Order ${context.refNumber} ${copy.label}`,
    sms: `${copy.sms(context.refNumber)}${tracking}`,
    email: `${copy.sms(context.refNumber)}${tracking}\n\nTotal: ${formatPKR(context.grandTotal)}`,
  });
}

export function renderPaymentSucceeded(context: OrderContext): NotificationMessage[] {
  const total = formatPKR(context.grandTotal);
  return fanOut(context, 'PAYMENT_SUCCEEDED', {
    subject: `Payment received for ${context.refNumber}`,
    sms: `Payment of ${total} for order ${context.refNumber} is received. Thank you.`,
    email: `We received your payment of ${total} for order ${context.refNumber}.`,
  });
}

const STATUS_COPY: Partial<Record<OrderStatus, { label: string; sms: (ref: string) => string }>> = {
  [OrderStatus.CONFIRMED]: { label: 'confirmed', sms: (ref) => `Order ${ref} is confirmed and being prepared.` },
  [OrderStatus.PACKED]: { label: 'packed', sms: (ref) => `Order ${ref} is packed and ready to leave our warehouse.` },
  [OrderStatus.SHIPPED]: { label: 'shipped', sms: (ref) => `Order ${ref} is on its way.` },
  [OrderStatus.DELIVERED]: { label: 'delivered', sms: (ref) => `Order ${ref} was delivered. Thank you for shopping with us.` },
  [OrderStatus.CANCELLED]: { label: 'cancelled', sms: (ref) => `Order ${ref} has been cancelled.` },
};

/** One message per channel we have an address for. */
function fanOut(
  context: OrderContext,
  event: string,
  copy: { subject: string; sms: string; email: string },
): NotificationMessage[] {
  const messages: NotificationMessage[] = [];
  if (context.phone) {
    messages.push({ channel: 'SMS', to: context.phone, subject: copy.subject, body: copy.sms, event });
  }
  if (context.email) {
    messages.push({ channel: 'EMAIL', to: context.email, subject: copy.subject, body: copy.email, event });
  }
  return messages;
}
