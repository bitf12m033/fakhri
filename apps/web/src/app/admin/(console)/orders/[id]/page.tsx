import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { AddressBlock, OrderItemsTable, OrderTimeline, OrderTotals } from '@/components/OrderParts';
import { StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminOrder } from '@/lib/api/admin-types';
import { sessionApiOrNull } from '@/lib/api/server';
import { dateTime, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, pkr } from '@/lib/format';
import { OrderActions } from './OrderActions';

export const metadata = { title: 'Order' };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'orders')) return <NoAccess section="orders" />;

  const { id } = await params;
  const result = await sessionApiOrNull<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`, { session: 'admin' });
  if (!result) notFound();
  const order = result.data;
  const contactName = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || 'Customer'
    : 'Guest';

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/orders">← Orders</Link>
          </p>
          <h1 data-testid="admin-order-ref">{order.refNumber}</h1>
          <div className="row">
            <StatusPill status={order.status} label={ORDER_STATUS[order.status]} />
            <StatusPill status={order.paymentStatus} label={PAYMENT_STATUS[order.paymentStatus]} />
            <span className="muted small">Placed {dateTime(order.placedAt)}</span>
          </div>
        </div>
        <div className="row no-print">
          <Link className="button secondary small" href={`/admin/orders/${order.id}/invoice`}>
            Invoice
          </Link>
          <Link className="button secondary small" href={`/admin/orders/${order.id}/packing-list`}>
            Packing list
          </Link>
          {order.shipment ? (
            <Link className="button secondary small" href={`/admin/orders/${order.id}/label`}>
              Label
            </Link>
          ) : null}
        </div>
      </div>

      <div className="two-col">
        <div className="stack">
          <OrderItemsTable order={order} />
          <div className="panel">
            <OrderTotals order={order} />
          </div>
          <div className="panel">
            <h2>History</h2>
            <OrderTimeline order={order} />
          </div>
        </div>
        <div className="stack">
          <OrderActions order={order} />
          <div className="panel stack">
            <h2>Customer</h2>
            <p style={{ margin: 0 }}>
              {contactName}
              <br />
              {order.customer?.phone ?? order.guestPhone}
              {order.customer?.email ?? order.guestEmail ? (
                <>
                  <br />
                  {order.customer?.email ?? order.guestEmail}
                </>
              ) : null}
            </p>
            <h3>{order.deliveryType === 'STORE_PICKUP' ? 'Store pickup' : 'Deliver to'}</h3>
            <AddressBlock address={order.address} />
            {order.customerNote ? (
              <p className="small">
                <strong>Note from customer:</strong> {order.customerNote}
              </p>
            ) : null}
          </div>
          <div className="panel">
            <h2>Payment</h2>
            {order.payment ? (
              <p style={{ margin: 0 }}>
                {PAYMENT_METHOD[order.payment.method]} · {pkr(order.payment.amount)}
                <br />
                <StatusPill status={order.payment.status} label={PAYMENT_STATUS[order.payment.status]} />
              </p>
            ) : (
              <p className="muted">No payment recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
