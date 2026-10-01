import Link from 'next/link';
import { EmptyState, Pagination, StatusPill } from '@/components/ui';
import { sessionApi } from '@/lib/api/server';
import type { OrderSummary, PaginationMeta } from '@/lib/api/types';
import { dateTime, ORDER_STATUS, pkr } from '@/lib/format';

export const metadata = { title: 'Orders' };

export default async function AccountOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page ?? '1') || 1);
  const { data: orders, meta } = await sessionApi<OrderSummary[], PaginationMeta>(
    `/customers/me/orders?page=${page}&pageSize=20`,
    { session: 'customer' },
  );
  return (
    <>
      <h1>Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet">
          <p>
            <Link href="/">Start shopping</Link>
          </p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.refNumber}>
                  <td>
                    <Link href={`/orders/${order.refNumber}`}>{order.refNumber}</Link>
                  </td>
                  <td>{dateTime(order.placedAt)}</td>
                  <td>
                    <StatusPill status={order.status} label={ORDER_STATUS[order.status]} />
                  </td>
                  <td className="num">{order.itemCount}</td>
                  <td className="num">{pkr(order.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(p) => `/account/orders?page=${p}`} />
    </>
  );
}
