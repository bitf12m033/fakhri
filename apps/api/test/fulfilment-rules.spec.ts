import { describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';
import {
  assertPaymentTransition,
  isOpen,
  isSettled,
  PAYMENT_TRANSITIONS,
  settledStatusFor,
} from '../src/modules/payments/payment-state';
import {
  assertShipmentTransition,
  deliversOrder,
  SHIPMENT_TRANSITIONS,
  shipsOrder,
} from '../src/modules/shipping/shipment-state';
import {
  OrderContext,
  renderOrderPlaced,
  renderPaymentSucceeded,
  renderStatusChange,
} from '../src/modules/notifications/templates';

/** Payment and shipment state machines plus notification copy (increment 3.6). */

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

describe('payment state machine (REQ-21/24)', () => {
  it('settles an online payment and a COD collection down their own paths', () => {
    expect(PAYMENT_TRANSITIONS[PaymentStatus.PENDING]).toEqual([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED]);
    expect(PAYMENT_TRANSITIONS[PaymentStatus.PENDING_COLLECTION]).toEqual([
      PaymentStatus.COLLECTED,
      PaymentStatus.FAILED,
    ]);
    expect(settledStatusFor(PaymentMethod.COD)).toBe(PaymentStatus.COLLECTED);
    expect(settledStatusFor(PaymentMethod.CARD)).toBe(PaymentStatus.SUCCEEDED);
  });

  it('refuses crossing the paths or leaving a terminal status', () => {
    expect(code(() => assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.COLLECTED))).toBe('CONFLICT');
    expect(code(() => assertPaymentTransition(PaymentStatus.PENDING_COLLECTION, PaymentStatus.SUCCEEDED))).toBe('CONFLICT');
    expect(code(() => assertPaymentTransition(PaymentStatus.FAILED, PaymentStatus.SUCCEEDED))).toBe('CONFLICT');
    expect(code(() => assertPaymentTransition(PaymentStatus.SUCCEEDED, PaymentStatus.SUCCEEDED))).toBe('CONFLICT');
    expect(code(() => assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.SUCCEEDED))).toBe('NO_ERROR');
  });

  it('classifies open and settled statuses', () => {
    expect(isOpen(PaymentStatus.PENDING)).toBe(true);
    expect(isOpen(PaymentStatus.PENDING_COLLECTION)).toBe(true);
    expect(isOpen(PaymentStatus.SUCCEEDED)).toBe(false);
    expect(isSettled(PaymentStatus.COLLECTED)).toBe(true);
    expect(isSettled(PaymentStatus.FAILED)).toBe(false);
  });
});

describe('shipment state machine (REQ-31)', () => {
  it('allows a retry after a failed delivery attempt', () => {
    expect(SHIPMENT_TRANSITIONS[ShipmentStatus.FAILED]).toContain(ShipmentStatus.IN_TRANSIT);
    expect(code(() => assertShipmentTransition(ShipmentStatus.FAILED, ShipmentStatus.IN_TRANSIT))).toBe('NO_ERROR');
  });

  it('refuses going backwards or leaving a returned parcel', () => {
    expect(code(() => assertShipmentTransition(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT))).toBe('CONFLICT');
    expect(code(() => assertShipmentTransition(ShipmentStatus.RETURNED, ShipmentStatus.DELIVERED))).toBe('CONFLICT');
    expect(code(() => assertShipmentTransition(ShipmentStatus.PENDING, ShipmentStatus.DELIVERED))).toBe('CONFLICT');
  });

  it('names the events that move the order', () => {
    expect(shipsOrder(ShipmentStatus.IN_TRANSIT)).toBe(true);
    expect(shipsOrder(ShipmentStatus.PICKUP_SCHEDULED)).toBe(false);
    expect(deliversOrder(ShipmentStatus.DELIVERED)).toBe(true);
  });
});

describe('notification templates (REQ-25)', () => {
  const context: OrderContext = {
    refNumber: 'FK-260930-ABC123',
    grandTotal: '55499.00',
    phone: '+923001234567',
    email: 'buyer@example.test',
    name: 'Ayesha',
  };

  it('sends one message per channel it has an address for', () => {
    const messages = renderOrderPlaced(context);
    expect(messages.map((message) => message.channel)).toEqual(['SMS', 'EMAIL']);
    expect(messages[0]?.body).toContain('FK-260930-ABC123');
    // PKR with South-Asian grouping, never a raw float.
    expect(messages[0]?.body).toContain('Rs 55,499.00');
    expect(messages[0]?.body).toContain('Ayesha');

    expect(renderOrderPlaced({ ...context, email: null }).map((m) => m.channel)).toEqual(['SMS']);
    expect(renderOrderPlaced({ ...context, phone: null, email: null })).toEqual([]);
  });

  it('writes copy for the statuses a customer should hear about, and stays quiet otherwise', () => {
    expect(renderStatusChange(context, OrderStatus.CONFIRMED)[0]?.body).toContain('confirmed');
    expect(renderStatusChange(context, OrderStatus.DELIVERED)[0]?.subject).toContain('delivered');
    expect(renderStatusChange(context, OrderStatus.CANCELLED)[0]?.body).toContain('cancelled');
    // Placement already had its own message, and RETURNED is not reachable yet.
    expect(renderStatusChange(context, OrderStatus.PENDING)).toEqual([]);
    expect(renderStatusChange(context, OrderStatus.RETURNED)).toEqual([]);
  });

  it('includes tracking details once a parcel is on its way', () => {
    const shipped = renderStatusChange(
      { ...context, carrier: 'TCS', trackingCode: 'TCS-99' },
      OrderStatus.SHIPPED,
    );
    expect(shipped[0]?.body).toContain('TCS');
    expect(shipped[0]?.body).toContain('TCS-99');
    expect(renderStatusChange(context, OrderStatus.SHIPPED)[0]?.body).not.toContain('Track');
  });

  it('confirms a received payment with the amount', () => {
    expect(renderPaymentSucceeded(context)[0]?.body).toContain('Rs 55,499.00');
    expect(renderPaymentSucceeded(context)[0]?.event).toBe('PAYMENT_SUCCEEDED');
  });
});
