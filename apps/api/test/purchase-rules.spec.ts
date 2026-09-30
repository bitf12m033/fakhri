import { describe, expect, it } from 'vitest';
import { DeliveryType, OrderStatus } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';
import {
  assertTransition,
  canCustomerCancel,
  canTransition,
  consumesStock,
  ORDER_TRANSITIONS,
  releasesStock,
} from '../src/modules/orders/order-state';
import { FIRST_BAND_KG, quoteDelivery } from '../src/modules/checkout/delivery-fee';
import { computeTotals, itemsTotalOf, priceLine } from '../src/modules/checkout/pricing';
import { hashRequest } from '../src/modules/checkout/idempotency.service';
import { newOrderRef } from '../src/modules/checkout/checkout.service';

/** Purchase-path domain rules (increment 3.5). No database needed. */

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

describe('order state machine (REQ-24)', () => {
  it('allows exactly the documented transitions', () => {
    expect(ORDER_TRANSITIONS[OrderStatus.PENDING]).toEqual([OrderStatus.CONFIRMED, OrderStatus.CANCELLED]);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.PACKED)).toBe(true);
    expect(canTransition(OrderStatus.PACKED, OrderStatus.SHIPPED)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
    for (const status of [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED]) {
      expect(canTransition(status, OrderStatus.CANCELLED), status).toBe(true);
    }
  });

  it('refuses skipping, reversing and leaving a terminal state', () => {
    expect(code(() => assertTransition(OrderStatus.PENDING, OrderStatus.SHIPPED))).toBe('ORDER_STATUS_INVALID');
    expect(code(() => assertTransition(OrderStatus.SHIPPED, OrderStatus.PACKED))).toBe('ORDER_STATUS_INVALID');
    expect(code(() => assertTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED))).toBe('ORDER_STATUS_INVALID');
    expect(code(() => assertTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED))).toBe('ORDER_STATUS_INVALID');
    expect(code(() => assertTransition(OrderStatus.PENDING, OrderStatus.PENDING))).toBe('ORDER_STATUS_INVALID');
  });

  it('keeps RETURNED recorded but unreachable', () => {
    expect(ORDER_TRANSITIONS[OrderStatus.RETURNED]).toEqual([]);
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      expect(targets, from).not.toContain(OrderStatus.RETURNED);
    }
  });

  it('names the transitions with stock and cancellation effects', () => {
    expect(canCustomerCancel(OrderStatus.PENDING)).toBe(true);
    expect(canCustomerCancel(OrderStatus.CONFIRMED)).toBe(false);
    expect(releasesStock(OrderStatus.CANCELLED)).toBe(true);
    expect(consumesStock(OrderStatus.SHIPPED)).toBe(true);
    expect(consumesStock(OrderStatus.DELIVERED)).toBe(true);
    expect(consumesStock(OrderStatus.CONFIRMED)).toBe(false);
  });
});

describe('delivery fee rule table (REQ-20)', () => {
  it('is free for store pickup regardless of weight', () => {
    const quote = quoteDelivery({ deliveryType: DeliveryType.STORE_PICKUP, weightKg: '120' });
    expect(quote).toMatchObject({ fee: '0.00', zone: null, bands: 0 });
  });

  it('charges the zone base inside the first weight band', () => {
    expect(quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'Punjab', weightKg: '9.5' }).fee).toBe('350.00');
    expect(quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'Balochistan', weightKg: '1' }).fee).toBe('550.00');
    expect(quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'AJK', weightKg: '0' }).fee).toBe('850.00');
  });

  it('adds one band charge per extra band, rounding up', () => {
    const base = quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'sindh', weightKg: `${FIRST_BAND_KG}` });
    expect(base).toMatchObject({ bands: 0, fee: '350.00' });
    expect(quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'sindh', weightKg: '10.1' })).toMatchObject({ bands: 1, fee: '500.00' });
    expect(quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'sindh', weightKg: '25' })).toMatchObject({ bands: 2, fee: '650.00' });
  });

  it('rejects a province it cannot price instead of guessing', () => {
    expect(code(() => quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, province: 'Goa', weightKg: '1' }))).toBe('INVALID_INPUT');
    expect(code(() => quoteDelivery({ deliveryType: DeliveryType.HOME_DELIVERY, weightKg: '1' }))).toBe('INVALID_INPUT');
  });
});

describe('order money (REQ-40)', () => {
  it('multiplies exactly and keeps two decimal places', () => {
    const line = priceLine({
      variantId: 'v1', sku: 'SKU1', productName: 'AC', variantName: null, quantity: 3, unitPrice: '185000.55',
    });
    expect(line.subtotal).toBe('555001.65');
    expect(itemsTotalOf([line, { ...line, subtotal: '0.45' }])).toBe('555002.10');
  });

  it('rejects a non-positive or fractional quantity', () => {
    const base = { variantId: 'v1', sku: 'SKU1', productName: 'AC', variantName: null, unitPrice: '10.00' };
    expect(code(() => priceLine({ ...base, quantity: 0 }))).toBe('INVALID_INPUT');
    expect(code(() => priceLine({ ...base, quantity: 1.5 }))).toBe('INVALID_INPUT');
  });

  it('computes items - discount + delivery + tax', () => {
    expect(computeTotals({ itemsTotal: '10000.00', deliveryFee: '350.00' })).toEqual({
      itemsTotal: '10000.00', discountTotal: '0.00', deliveryFee: '350.00', taxTotal: '0.00', grandTotal: '10350.00',
    });
    expect(computeTotals({ itemsTotal: '10000.00', discountTotal: '1000.00', deliveryFee: '350.00', taxRatePercent: 17 })).toEqual({
      itemsTotal: '10000.00', discountTotal: '1000.00', deliveryFee: '350.00', taxTotal: '1530.00', grandTotal: '10880.00',
    });
  });

  it('refuses a discount larger than the items total', () => {
    expect(code(() => computeTotals({ itemsTotal: '100.00', discountTotal: '100.01', deliveryFee: '0' }))).toBe('INTERNAL');
  });
});

describe('checkout plumbing', () => {
  it('formats an order reference as FK-YYMMDD-XXXXXX', () => {
    const ref = newOrderRef(new Date('2026-09-30T12:00:00Z'));
    expect(ref).toMatch(/^FK-260930-[0-9A-F]{6}$/);
    expect(newOrderRef()).not.toBe(newOrderRef());
  });

  it('hashes a request independently of key order but not of values', () => {
    expect(hashRequest({ a: 1, b: [1, 2] })).toBe(hashRequest({ b: [1, 2], a: 1 }));
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }));
    expect(hashRequest({ a: [1, 2] })).not.toBe(hashRequest({ a: [2, 1] }));
  });
});
