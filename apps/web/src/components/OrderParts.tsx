import type { Order } from '@/lib/api/types';
import { dateTime, ORDER_STATUS, pkr } from '@/lib/format';

/** Order pieces shared by the customer, guest and admin views. */

export function OrderItemsTable({ order }: { order: Pick<Order, 'items'> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.variantId}>
              <td>
                {item.productName}
                {item.variantName ? <span className="muted"> — {item.variantName}</span> : null}
              </td>
              <td className="small">{item.sku}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">{pkr(item.unitPrice)}</td>
              <td className="num">{pkr(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const hasDiscount = order.discountTotal && order.discountTotal !== '0.00';
  const hasTax = order.taxTotal && order.taxTotal !== '0.00';
  return (
    <table className="totals">
      <tbody>
        <tr>
          <td>Items</td>
          <td className="num">{pkr(order.itemsTotal)}</td>
        </tr>
        {hasDiscount ? (
          <tr>
            <td>Discount</td>
            <td className="num">− {pkr(order.discountTotal)}</td>
          </tr>
        ) : null}
        <tr>
          <td>Delivery</td>
          <td className="num">{order.deliveryFee === '0.00' ? 'Free' : pkr(order.deliveryFee)}</td>
        </tr>
        {hasTax ? (
          <tr>
            <td>Sales tax</td>
            <td className="num">{pkr(order.taxTotal)}</td>
          </tr>
        ) : null}
        <tr className="grand">
          <td>Total</td>
          <td className="num" data-testid="order-total">
            {pkr(order.grandTotal)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function OrderTimeline({ order }: { order: Pick<Order, 'history' | 'shipment'> }) {
  return (
    <div className="stack">
      <ol className="timeline" aria-label="Order history">
        {order.history.map((entry, index) => (
          <li key={`${entry.status}-${index}`}>
            <strong>{ORDER_STATUS[entry.status]}</strong> <span className="muted small">{dateTime(entry.at)}</span>
            {entry.note ? <div className="small">{entry.note}</div> : null}
          </li>
        ))}
      </ol>
      {order.shipment ? (
        <div className="small">
          <strong>Shipment:</strong> {order.shipment.carrier ?? 'Courier'}
          {order.shipment.trackingCode ? ` · tracking ${order.shipment.trackingCode}` : ''} ·{' '}
          {order.shipment.status.replaceAll('_', ' ').toLowerCase()}
          {order.shipment.events.length > 0 ? (
            <ul>
              {order.shipment.events.map((event, index) => (
                <li key={index}>
                  {event.status.replaceAll('_', ' ').toLowerCase()}
                  {event.location ? ` — ${event.location}` : ''} <span className="muted">{dateTime(event.at)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddressBlock({ address }: { address: Record<string, unknown> | null }) {
  if (!address) return <p className="muted">Store pickup — no delivery address.</p>;
  const text = (key: string) => (typeof address[key] === 'string' ? (address[key] as string) : null);
  return (
    <address style={{ fontStyle: 'normal' }}>
      <strong>{text('recipientName')}</strong>
      <br />
      {text('addressLine')}
      {text('landmark') ? (
        <>
          <br />
          Near {text('landmark')}
        </>
      ) : null}
      <br />
      {[text('area'), text('city'), text('province')].filter(Boolean).join(', ')}
      <br />
      {text('phone')}
    </address>
  );
}
