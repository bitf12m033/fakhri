import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { Pagination, StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminOrderRow } from '@/lib/api/admin-types';
import { sessionApi } from '@/lib/api/server';
import type { OrderStatus, PaginationMeta, PaymentStatus } from '@/lib/api/types';
import { dateTime, ORDER_STATUS, PAYMENT_STATUS, pkr } from '@/lib/format';

export const metadata = { title: 'Orders' };

type Search = { status?: string; paymentStatus?: string; q?: string; page?: string };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'orders')) return <NoAccess section="orders" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.status) query.set('status', search.status);
  if (search.paymentStatus) query.set('paymentStatus', search.paymentStatus);
  if (search.q) query.set('q', search.q);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: orders, meta } = await sessionApi<AdminOrderRow[], PaginationMeta>(`/admin/orders?${query}`, {
    session: 'admin',
  });

  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/orders?${next}`;
  };

  return (
    <div className="stack">
      <h1>Orders</h1>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Reference or phone</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} placeholder="FK-… or 0300…" />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={search.status ?? ''}>
            <option value="">Any</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="paymentStatus">Payment</label>
          <select id="paymentStatus" name="paymentStatus" defaultValue={search.paymentStatus ?? ''}>
            <option value="">Any</option>
            {(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">{meta.totalItems} orders</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Placed</th>
              <th>Contact</th>
              <th>Delivery</th>
              <th>Status</th>
              <th>Payment</th>
              <th className="num">Items</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/admin/orders/${order.id}`}>{order.refNumber}</Link>
                </td>
                <td>{dateTime(order.placedAt)}</td>
                <td>
                  {order.contact.phone ?? '—'}{' '}
                  <span className="muted small">{order.contact.type === 'GUEST' ? '(guest)' : ''}</span>
                </td>
                <td>{order.deliveryType === 'STORE_PICKUP' ? 'Pickup' : 'Home'}</td>
                <td>
                  <StatusPill status={order.status} label={ORDER_STATUS[order.status]} />
                </td>
                <td>
                  <StatusPill status={order.paymentStatus} label={PAYMENT_STATUS[order.paymentStatus]} />
                </td>
                <td className="num">{order.itemCount}</td>
                <td className="num">{pkr(order.grandTotal)}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No orders match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
