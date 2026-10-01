'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { AdminOrder, ORDER_NEXT, ShipmentStatus } from '@/lib/api/admin-types';
import { bff } from '@/lib/api/client';
import type { OrderStatus } from '@/lib/api/types';
import { ORDER_STATUS } from '@/lib/format';

/** Shipment state machine, copied from apps/api shipping/shipment-state.ts. */
const SHIPMENT_NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['PICKUP_SCHEDULED', 'IN_TRANSIT', 'FAILED'],
  PICKUP_SCHEDULED: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'RETURNED'],
  FAILED: ['IN_TRANSIT', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
};

const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  PENDING: 'Pending',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  IN_TRANSIT: 'In transit (ships the order)',
  DELIVERED: 'Delivered (delivers the order)',
  FAILED: 'Delivery failed',
  RETURNED: 'Returned',
};

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirm order',
  PACKED: 'Mark packed',
  SHIPPED: 'Mark handed over',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
};

export function OrderActions({ order }: { order: AdminOrder }) {
  const action = useAction();
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState(order.shipment?.carrier ?? '');
  const [tracking, setTracking] = useState(order.shipment?.trackingCode ?? '');
  const [event, setEvent] = useState<ShipmentStatus | ''>('');
  const [location, setLocation] = useState('');

  const homeDelivery = order.deliveryType === 'HOME_DELIVERY';
  // For home delivery the courier's events move the order on, so tracking is never skipped.
  const moves = ORDER_NEXT[order.status].filter(
    (status) => !(homeDelivery && (status === 'SHIPPED' || status === 'DELIVERED')),
  );
  const shipmentOpen = homeDelivery && ['PACKED', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const shipmentStatus = order.shipment?.status as ShipmentStatus | undefined;
  const events = shipmentStatus ? SHIPMENT_NEXT[shipmentStatus] : [];
  const payment = order.payment;
  const paymentOpen = payment && (payment.status === 'PENDING' || payment.status === 'PENDING_COLLECTION');

  const transition = (status: OrderStatus) => {
    if (status === 'CANCELLED' && !window.confirm(`Cancel ${order.refNumber}? Reserved stock is released.`)) return;
    void action.run(
      () =>
        bff(`/admin/orders/${order.id}/status`, {
          method: 'PATCH',
          body: { status, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      { success: `Order is now ${ORDER_STATUS[status].toLowerCase()}.` },
    );
    setNote('');
  };

  return (
    <div className="panel stack no-print" aria-label="Order actions">
      <h2>Actions</h2>
      <FormStatus error={action.error} message={action.message} />

      {moves.length > 0 ? (
        <div className="stack">
          <div className="field">
            <label htmlFor="transition-note">Note (optional)</label>
            <input
              id="transition-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Confirmed by phone"
            />
          </div>
          <div className="row">
            {moves.map((status) => (
              <button
                key={status}
                type="button"
                className={status === 'CANCELLED' ? 'danger' : undefined}
                disabled={action.pending}
                onClick={() => transition(status)}
              >
                {ACTION_LABEL[status] ?? ORDER_STATUS[status]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {order.status === 'PACKED' && homeDelivery
            ? 'Create the shipment below, then mark it in transit to ship the order.'
            : 'No further status changes.'}
        </p>
      )}

      {shipmentOpen ? (
        <fieldset className="stack">
          <legend>Shipment</legend>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () =>
                  bff(`/admin/orders/${order.id}/shipment`, {
                    method: 'PUT',
                    body: {
                      ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
                      ...(tracking.trim() ? { trackingCode: tracking.trim() } : {}),
                    },
                  }),
                { success: order.shipment ? 'Shipment updated.' : 'Shipment created.' },
              );
            }}
          >
            <div className="field">
              <label htmlFor="carrier">Carrier</label>
              <input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="TCS, Leopards…" />
            </div>
            <div className="field">
              <label htmlFor="tracking">Tracking code</label>
              <input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </div>
            <button type="submit" className="secondary" disabled={action.pending}>
              {order.shipment ? 'Save shipment' : 'Create shipment'}
            </button>
          </form>

          {order.shipment && events.length > 0 ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!event) return;
                void action.run(
                  () =>
                    bff(`/admin/orders/${order.id}/shipment/events`, {
                      method: 'POST',
                      body: { status: event, ...(location.trim() ? { location: location.trim() } : {}) },
                    }),
                  { success: 'Tracking event recorded.' },
                );
                setEvent('');
                setLocation('');
              }}
            >
              <div className="field">
                <label htmlFor="shipment-event">Tracking event</label>
                <select id="shipment-event" value={event} onChange={(e) => setEvent(e.target.value as ShipmentStatus)}>
                  <option value="">Choose…</option>
                  {events.map((status) => (
                    <option key={status} value={status}>
                      {SHIPMENT_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="shipment-location">Location (optional)</label>
                <input id="shipment-location" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <button type="submit" className="secondary" disabled={action.pending || !event}>
                Record event
              </button>
            </form>
          ) : null}
        </fieldset>
      ) : null}

      {paymentOpen && payment ? (
        <fieldset className="stack">
          <legend>Payment correction</legend>
          <p className="small muted" style={{ margin: 0 }}>
            For money that arrived outside the gateway. Delivery collects COD automatically.
          </p>
          <div className="row">
            <button
              type="button"
              className="secondary small"
              disabled={action.pending}
              onClick={() =>
                void action.run(
                  () =>
                    bff(`/admin/orders/${order.id}/payment-status`, {
                      method: 'PATCH',
                      body: { status: payment.method === 'COD' ? 'COLLECTED' : 'SUCCEEDED' },
                    }),
                  { success: 'Payment recorded.' },
                )
              }
            >
              {payment.method === 'COD' ? 'Mark cash collected' : 'Mark paid'}
            </button>
            <button
              type="button"
              className="danger small"
              disabled={action.pending}
              onClick={() =>
                window.confirm('Mark this payment as failed?') &&
                void action.run(
                  () =>
                    bff(`/admin/orders/${order.id}/payment-status`, { method: 'PATCH', body: { status: 'FAILED' } }),
                  { success: 'Payment marked failed.' },
                )
              }
            >
              Mark failed
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
