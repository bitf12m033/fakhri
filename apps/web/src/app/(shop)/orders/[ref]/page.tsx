import { cookies } from 'next/headers';
import Link from 'next/link';
import { AddressBlock, OrderItemsTable, OrderTimeline, OrderTotals } from '@/components/OrderParts';
import { Notice, StatusPill } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { sessionApi } from '@/lib/api/server';
import type { Order } from '@/lib/api/types';
import { dateTime, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/lib/format';
import { COOKIE, readGuestOrders } from '@/lib/session/cookies';
import { isFresh } from '@/lib/session/jwt';
import { TrackForm } from '../../track/TrackForm';
import { OrderControls } from './OrderControls';

export const metadata = { title: 'Your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ placed?: string; payment?: string }> };

/**
 * Order confirmation and tracking (REQ-16, REQ-19). A customer sees their own
 * order; a guest is recognised by the reference + phone remembered at checkout,
 * or asked for the phone number.
 */
export default async function OrderPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { placed, payment } = await searchParams;
  // `payment` only picks the success banner; failure is read from the order itself.
  const jar = await cookies();
  const signedIn = isFresh(jar.get(COOKIE.customerAccess)?.value, 0);
  const guest = readGuestOrders(jar.get(COOKIE.guestOrders)?.value).find((entry) => entry.ref === ref);

  let order: Order | null = null;
  try {
    if (signedIn) {
      order = (await sessionApi<Order>(`/customers/me/orders/${encodeURIComponent(ref)}`, { session: 'customer' })).data;
    }
    if (!order && guest) {
      order = (
        await sessionApi<Order>('/orders/lookup', {
          session: 'customer',
          method: 'POST',
          body: { refNumber: guest.ref, phone: guest.phone },
        })
      ).data;
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  if (!order) {
    return (
      <div className="stack" style={{ maxWidth: 520 }}>
        <h1>Track order {ref}</h1>
        <p>Enter the mobile number you ordered with to see this order.</p>
        <TrackForm initialRef={ref} />
      </div>
    );
  }

  const onlinePending =
    order.payment && order.payment.method !== 'COD' && order.payment.status === 'PENDING' && order.status !== 'CANCELLED';

  return (
    <div className="stack">
      {placed ? (
        <Notice tone="ok" role="status">
          Thank you! Your order <strong>{order.refNumber}</strong> has been placed.
          {order.payment?.method === 'COD' ? ' We will call you to confirm it before dispatch.' : ''}
        </Notice>
      ) : null}
      {payment === 'succeeded' ? (
        <Notice tone="ok" role="status">
          Payment received. Your order is confirmed.
        </Notice>
      ) : null}
      {order.payment?.status === 'FAILED' && order.status === 'PENDING' ? (
        // A declined online payment is final for that payment (3.6); there is no retry yet.
        <Notice tone="error">
          The payment did not go through, so this order is on hold. We will call you to arrange payment, or you can
          place the order again.
        </Notice>
      ) : null}

      <div className="spread">
        <div>
          <h1 data-testid="order-ref">Order {order.refNumber}</h1>
          <div className="row">
            <StatusPill status={order.status} label={ORDER_STATUS[order.status]} />
            <StatusPill status={order.paymentStatus} label={PAYMENT_STATUS[order.paymentStatus]} />
            <span className="muted small">Placed {dateTime(order.placedAt)}</span>
          </div>
        </div>
        {signedIn ? <Link href="/account/orders">All my orders</Link> : null}
      </div>

      <OrderControls
        refNumber={order.refNumber}
        paymentId={onlinePending ? order.payment!.id : null}
        canCancel={signedIn && order.status === 'PENDING'}
      />

      <div className="two-col">
        <div className="stack">
          <OrderItemsTable order={order} />
          <div className="panel">
            <h2>Progress</h2>
            <OrderTimeline order={order} />
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <OrderTotals order={order} />
            {order.payment ? (
              <p className="small" style={{ margin: '0.5rem 0 0' }}>
                Paying by {PAYMENT_METHOD[order.payment.method]}
              </p>
            ) : null}
          </div>
          <div className="panel">
            <h2>{order.deliveryType === 'STORE_PICKUP' ? 'Store pickup' : 'Delivering to'}</h2>
            <AddressBlock address={order.address} />
          </div>
          {!signedIn ? (
            <div className="panel">
              <h2>Save time next order</h2>
              <p className="small">Create an account to see all your orders in one place and check out faster.</p>
              <Link className="button secondary" href="/register">
                Create an account
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
