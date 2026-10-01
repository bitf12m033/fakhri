import Link from 'next/link';
import type { ReactNode } from 'react';
import { NoAccess } from '@/components/admin/NoAccess';
import { dayEnd, dayStart, karachiDay } from '@/components/admin/ops/time';
import { Notice, StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CodOutstandingRow, LowStockRow, SalesRow, TopProductRow } from '@/lib/api/admin-ops-types';
import { messageOf } from '@/lib/api/errors';
import { sessionApi } from '@/lib/api/server';
import type { OrderStatus } from '@/lib/api/types';
import { dateTime, ORDER_STATUS, pkr } from '@/lib/format';

export const metadata = { title: 'Reports' };

type Search = { from?: string; to?: string; status?: string; limit?: string; threshold?: string };

type Outcome<T> = { rows: T[]; error: null } | { rows: null; error: string };

/** A report that fails (a bad window, say) shows its error without taking the others down. */
async function report<T>(path: string): Promise<Outcome<T>> {
  try {
    const { data } = await sessionApi<T[]>(path, { session: 'admin' });
    return { rows: data, error: null };
  } catch (error) {
    return { rows: null, error: messageOf(error) };
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'reports')) return <NoAccess section="reports" />;

  const search = await searchParams;
  const from = search.from && DAY.test(search.from) ? search.from : karachiDay(-29);
  const to = search.to && DAY.test(search.to) ? search.to : karachiDay();
  const status = (Object.keys(ORDER_STATUS) as OrderStatus[]).find((s) => s === search.status);
  const limit = search.limit && /^\d+$/.test(search.limit) ? search.limit : '20';
  const threshold = search.threshold && /^\d+$/.test(search.threshold) ? search.threshold : '5';

  // Whole Pakistan days: the API takes instants, and its own date-only parsing is UTC.
  const window = { from: dayStart(from)!, to: dayEnd(to)! };
  const salesQuery = new URLSearchParams({ ...window, ...(status ? { status } : {}) });
  const topQuery = new URLSearchParams({ ...window, limit });
  const lowQuery = new URLSearchParams({ threshold });

  const [sales, top, low, cod] = await Promise.all([
    report<SalesRow>(`/admin/reports/sales?${salesQuery}`),
    report<TopProductRow>(`/admin/reports/top-products?${topQuery}`),
    report<LowStockRow>(`/admin/reports/low-stock?${lowQuery}`),
    report<CodOutstandingRow>('/admin/reports/cod-outstanding'),
  ]);

  const csv = (name: string, query?: URLSearchParams) => {
    const params = new URLSearchParams(query);
    params.set('format', 'csv');
    return `/bff/admin/reports/${name}?${params}`;
  };

  return (
    <div className="stack">
      <h1>Reports</h1>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from} required />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to} required />
        </div>
        <div className="field">
          <label htmlFor="status">Sales: order status</label>
          <select id="status" name="status" defaultValue={status ?? ''}>
            <option value="">All but cancelled</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="limit">Top products: how many</label>
          <input id="limit" name="limit" type="number" min={1} max={100} defaultValue={limit} />
        </div>
        <div className="field">
          <label htmlFor="threshold">Low stock: available at most</label>
          <input id="threshold" name="threshold" type="number" min={0} max={10000} defaultValue={threshold} />
        </div>
        <button type="submit">Run reports</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>
        Dates are whole days in Pakistan time; windows are limited to 400 days. Cancelled orders never count as
        revenue.
      </p>

      <ReportSection
        title="Sales by day"
        csvHref={csv('sales', salesQuery)}
        outcome={sales}
        testId="report-sales"
        note="The API groups days in UTC, so an order placed before 5 am Pakistan time is counted on the previous day."
      >
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Orders</th>
                <th className="num">Items</th>
                <th className="num">Discounts</th>
                <th className="num">Delivery</th>
                <th className="num">Tax</th>
                <th className="num">Grand total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td className="num">{row.orders}</td>
                  <td className="num">{pkr(row.itemsTotal)}</td>
                  <td className="num">{pkr(row.discountTotal)}</td>
                  <td className="num">{pkr(row.deliveryFee)}</td>
                  <td className="num">{pkr(row.taxTotal)}</td>
                  <td className="num">
                    <strong>{pkr(row.grandTotal)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Top products"
        csvHref={csv('top-products', topQuery)}
        outcome={top}
        testId="report-top-products"
      >
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="num">Units sold</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sku}>
                  <td>
                    <code>{row.sku}</code>
                  </td>
                  <td>{row.productName}</td>
                  <td className="num">{row.quantity}</td>
                  <td className="num">{pkr(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title={`Low stock (available ≤ ${threshold})`}
        csvHref={csv('low-stock', lowQuery)}
        outcome={low}
        testId="report-low-stock"
        note="Active variants in active warehouses, up to 500 rows."
      >
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th className="num">On hand</th>
                <th className="num">Reserved</th>
                <th className="num">Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.sku}-${row.warehouse}`}>
                  <td>
                    <code>{row.sku}</code>
                  </td>
                  <td>{row.productName}</td>
                  <td>{row.warehouse}</td>
                  <td className="num">{row.onHand}</td>
                  <td className="num">{row.reserved}</td>
                  <td className="num">
                    <strong>{row.available}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Cash on delivery outstanding"
        csvHref={csv('cod-outstanding')}
        outcome={cod}
        testId="report-cod"
        note="COD payments still awaiting collection, oldest first, whatever the dates above."
      >
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Phone</th>
                <th>Placed</th>
                <th className="num">Amount due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.refNumber}>
                  <td>
                    <Link href={`/admin/orders?q=${encodeURIComponent(row.refNumber)}`}>{row.refNumber}</Link>
                  </td>
                  <td>
                    <StatusPill status={row.status} label={ORDER_STATUS[row.status as OrderStatus] ?? row.status} />
                  </td>
                  <td>{row.phone ?? '—'}</td>
                  <td>{dateTime(row.placedAt)}</td>
                  <td className="num">{pkr(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>
    </div>
  );
}

function ReportSection<T>({
  title,
  csvHref,
  outcome,
  note,
  testId,
  children,
}: {
  title: string;
  csvHref: string;
  outcome: Outcome<T>;
  note?: string;
  testId: string;
  children: (rows: T[]) => ReactNode;
}) {
  return (
    <section className="stack" aria-label={title} data-testid={testId}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>{title}</h2>
        {/* A plain link: the BFF streams the CSV through with its download headers. */}
        <a className="button secondary small" href={csvHref} download>
          Download CSV
        </a>
      </div>
      {note ? (
        <p className="small muted" style={{ margin: 0 }}>
          {note}
        </p>
      ) : null}
      {outcome.error !== null ? (
        <Notice tone="error">{outcome.error}</Notice>
      ) : outcome.rows.length === 0 ? (
        <p className="muted">Nothing to report.</p>
      ) : (
        <div className="table-wrap">{children(outcome.rows)}</div>
      )}
    </section>
  );
}
