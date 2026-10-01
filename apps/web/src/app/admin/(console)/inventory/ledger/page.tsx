import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Notice, Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { LedgerEntry, StockMovementType, StockRow, Warehouse } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { INVENTORY_LINKS } from '../links';

export const metadata = { title: 'Stock ledger' };

type Search = { sku?: string; variantId?: string; warehouseId?: string; page?: string };

/** How each movement changes on-hand stock: reservations only move the reserved count. */
const MOVEMENT: Record<StockMovementType, { label: string; sign: '+' | '−' | '' }> = {
  RECEIPT: { label: 'Receipt', sign: '+' },
  SALE: { label: 'Sale', sign: '−' },
  RESERVATION: { label: 'Reserved', sign: '' },
  RESERVATION_RELEASE: { label: 'Reservation released', sign: '' },
  TRANSFER_OUT: { label: 'Transfer out', sign: '−' },
  TRANSFER_IN: { label: 'Transfer in', sign: '+' },
  ADJUSTMENT_IN: { label: 'Adjustment in', sign: '+' },
  ADJUSTMENT_OUT: { label: 'Adjustment out', sign: '−' },
};

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'inventory')) return <NoAccess section="inventory" />;

  const search = await searchParams;
  const { data: warehouses } = await sessionApi<Warehouse[]>('/admin/inventory/warehouses', { session: 'admin' });

  // The ledger is keyed by variant; a SKU is resolved through the stock rows.
  let variantId = search.variantId?.trim() || undefined;
  let skuProblem: string | null = null;
  const skus = new Map<string, string>();
  const sku = search.sku?.trim();
  if (sku && !variantId) {
    const { data: matches } = await sessionApi<StockRow[], PaginationMeta>(
      `/admin/inventory/items?${new URLSearchParams({ sku, pageSize: '100' })}`,
      { session: 'admin' },
    );
    const exact = matches.find((row) => row.sku.toLowerCase() === sku.toLowerCase());
    if (exact) variantId = exact.variantId;
    else skuProblem = matches.length ? `No SKU is exactly “${sku}”.` : `No stocked SKU matches “${sku}”.`;
    for (const row of matches) skus.set(row.variantId, row.sku);
  }

  const query = new URLSearchParams();
  if (variantId) query.set('variantId', variantId);
  if (search.warehouseId) query.set('warehouseId', search.warehouseId);
  const filtered = query.size > 0;
  query.set('page', search.page ?? '1');
  query.set('pageSize', '50');

  const [ledger, stock] = filtered
    ? await Promise.all([
        sessionApi<LedgerEntry[], PaginationMeta>(`/admin/inventory/ledger?${query}`, { session: 'admin' }),
        // SKUs for the rows: the ledger itself only carries variant IDs.
        sessionApi<StockRow[], PaginationMeta>(
          `/admin/inventory/items?${new URLSearchParams({
            ...(variantId ? { variantId } : {}),
            ...(search.warehouseId ? { warehouseId: search.warehouseId } : {}),
            pageSize: '100',
          })}`,
          { session: 'admin' },
        ),
      ])
    : [null, null];
  for (const row of stock?.data ?? []) skus.set(row.variantId, row.sku);
  const warehouseCode = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.code]));

  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/inventory/ledger?${next}`;
  };

  return (
    <div className="stack">
      <h1>Stock ledger</h1>
      <SubNav links={INVENTORY_LINKS} current="/admin/inventory/ledger" />
      <p className="muted small" style={{ margin: 0 }}>
        Every stock movement, newest first. The ledger is append-only: corrections are new adjustments.
      </p>

      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="sku">SKU</label>
          <input id="sku" name="sku" defaultValue={search.sku ?? (variantId ? skus.get(variantId) : '') ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="variantId">or variant ID</label>
          <input id="variantId" name="variantId" defaultValue={search.variantId ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="warehouseId">Warehouse</label>
          <select id="warehouseId" name="warehouseId" defaultValue={search.warehouseId ?? ''}>
            <option value="">All</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Show movements</button>
      </form>

      {skuProblem ? <Notice tone="warn">{skuProblem}</Notice> : null}
      {!ledger ? (
        skuProblem ? null : <Notice>Choose a SKU, a variant or a warehouse to see its movements.</Notice>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            {ledger.meta.totalItems} movements
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>SKU</th>
                  <th>Warehouse</th>
                  <th>Movement</th>
                  <th className="num">Quantity</th>
                  <th>Reference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.map((entry) => {
                  const movement = MOVEMENT[entry.type];
                  return (
                    <tr key={entry.id} data-testid="ledger-row">
                      <td>{dateTime(entry.createdAt)}</td>
                      <td>
                        <Link href={`/admin/inventory/ledger?variantId=${entry.variantId}`}>
                          <code>{skus.get(entry.variantId) ?? entry.variantId}</code>
                        </Link>
                      </td>
                      <td>{warehouseCode.get(entry.warehouseId) ?? entry.warehouseId}</td>
                      <td>{movement.label}</td>
                      <td className="num">
                        {movement.sign}
                        {entry.quantity}
                      </td>
                      <td className="small">
                        {entry.refType ? (
                          <>
                            {entry.refType}
                            <br />
                            <span className="muted">{entry.refId}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="small">{entry.note ?? '—'}</td>
                    </tr>
                  );
                })}
                {ledger.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No movements recorded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            + and − change the on-hand count; reservations only change what is reserved.
          </p>
          <Pagination page={ledger.meta.page} totalPages={ledger.meta.totalPages} hrefFor={hrefFor} />
        </>
      )}
    </div>
  );
}
