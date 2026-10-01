import { formatPKR } from '@fakhri/shared';
import type { Availability, OrderStatus, PaymentMethod, PaymentStatus } from './api/types';

/** Money arrives as a 2-dp string and is formatted exactly (DEC-05): never through a float. */
export function pkr(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : formatPKR(value);
}

export function priceRange(from: string | null, to: string | null): string {
  if (!from) return 'Price on request';
  return to && to !== from ? `${pkr(from)} – ${pkr(to)}` : pkr(from);
}

const DATE = new Intl.DateTimeFormat('en-PK', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Karachi',
});

const DAY = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone: 'Asia/Karachi' });

export function dateTime(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : '—';
}

export function day(iso: string | null | undefined): string {
  return iso ? DAY.format(new Date(iso)) : '—';
}

export const AVAILABILITY: Record<Availability, { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  IN_STOCK: { label: 'In stock', tone: 'ok' },
  AVAILABLE_ON_ORDER: { label: 'Available on order', tone: 'warn' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'danger' },
};

export const ORDER_STATUS: Record<OrderStatus, string> = {
  PENDING: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  PENDING: 'Awaiting payment',
  SUCCEEDED: 'Paid',
  FAILED: 'Payment failed',
  PENDING_COLLECTION: 'Cash due on delivery',
  COLLECTED: 'Cash collected',
  REFUNDED: 'Refunded',
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  COD: 'Cash on delivery',
  CARD: 'Debit / credit card',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  BANK_TRANSFER: 'Bank transfer',
};

export function statusTone(status: string): 'ok' | 'warn' | 'danger' | '' {
  if (['DELIVERED', 'SUCCEEDED', 'COLLECTED', 'APPROVED', 'PUBLISHED', 'ACTIVE'].includes(status)) return 'ok';
  if (['CANCELLED', 'FAILED', 'REFUNDED', 'RETURNED', 'REJECTED'].includes(status)) return 'danger';
  if (['PENDING', 'PENDING_COLLECTION', 'DRAFT', 'ARCHIVED'].includes(status)) return 'warn';
  return '';
}

/**
 * Only same-site paths and http(s) URLs become links. Banner links are free text
 * in the API (3.7), and a `javascript:` URL must never reach an href.
 */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Provinces the delivery fee table covers (apps/api checkout/delivery-fee.ts). */
export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Islamabad',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;
