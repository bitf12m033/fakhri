import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Notice, Pagination, StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { StockRow, Warehouse } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { INVENTORY_LINKS } from './links';
import { AddStockItemForm, AdjustStockForm } from './StockForms';

export const metadata = { title: 'Inventory' };

type Search = { sku?: string; warehouseId?: string; maxAvailable?: string; page?: string; adjust?: string; wh?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'inventory')) return <NoAccess section="inventory" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.sku) query.set('sku', search.sku);
  if (search.warehouseId) query.set('warehouseId', search.warehouseId);
  if (search.maxAvailable && /^\d+$/.test(search.maxAvailable)) query.set('maxAvailable', search.maxAvailable);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '50');

  const [{ data: rows, meta }, { data: warehouses }] = await Promise.all([
    sessionApi<StockRow[], PaginationMeta>(`/admin/inventory/items?${query}`, { session: 'admin' }),
    sessionApi<Warehouse[]>('/admin/inventory/warehouses', { session: 'admin' }),
  ]);

  const listQuery = () => {
    const next = new URLSearchParams(query);
    next.delete('pageSize');
    return next;
  };
  const hrefFor = (page: number) => {
    const next = listQuery();
    next.set('page', String(page));
    return `/admin/inventory?${next}`;
  };
  const adjustHref = (row: StockRow) => {
    const next = listQuery();
    next.set('adjust', row.variantId);
    next.set('wh', row.warehouse.id);
    return `/admin/inventory?${next}#adjust-heading`;
  };

  return (
    <div className="stack">
      <h1>Inventory</h1>
      <SubNav links={INVENTORY_LINKS} current="/admin/inventory" />

      <div className="two-col">
        <div className="stack">
          <form className="toolbar" method="get" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="sku">SKU contains</label>
              <input id="sku" name="sku" defaultValue={search.sku ?? ''} placeholder="e.g. DAW-" />
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
            <div className="field">
              <label htmlFor="maxAvailable">Available at most</label>
              <input
                id="maxAvailable"
                name="maxAvailable"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={search.maxAvailable ?? ''}
              />
            </div>
            <button type="submit">Filter</button>
          </form>
          {query.has('maxAvailable') ? (
            <p className="small muted" style={{ margin: 0 }}>
              “Available at most” filters within each page. For a full list use the{' '}
              <Link href={`/admin/reports?threshold=${query.get('maxAvailable')}`}>low stock report</Link>.
            </p>
          ) : null}

          <p className="muted small" style={{ margin: 0 }}>
            {meta.totalItems} stock rows. Available = on hand − reserved for open orders.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th className="num">On hand</th>
                  <th className="num">Reserved</th>
                  <th className="num">Available</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.variantId}-${row.warehouse.id}`} data-testid="stock-row">
                    <td>
                      <code>{row.sku}</code>
                      {row.isAvailableOnOrder ? (
                        <>
                          {' '}
                          <StatusPill status="ON_ORDER" label="on order" />
                        </>
                      ) : null}
                    </td>
                    <td>{row.productName}</td>
                    <td>
                      {row.warehouse.code}
                      {row.warehouse.isActive ? null : <span className="muted small"> (inactive)</span>}
                    </td>
                    <td className="num">{row.onHand}</td>
                    <td className="num">{row.reserved}</td>
                    <td className="num">
                      <strong style={{ color: row.available <= 0 ? 'var(--danger)' : undefined }}>{row.available}</strong>
                    </td>
                    <td>
                      <div className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
                        <Link href={adjustHref(row)} className="small">
                          Adjust
                        </Link>
                        <Link
                          href={`/admin/inventory/ledger?variantId=${row.variantId}&warehouseId=${row.warehouse.id}`}
                          className="small"
                        >
                          Ledger
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No stock rows match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
        </div>

        <div className="stack">
          {warehouses.length === 0 ? (
            <Notice tone="warn">
              Create a <Link href="/admin/inventory/warehouses">warehouse</Link> before stocking anything.
            </Notice>
          ) : (
            <>
              <AdjustStockForm
                key={`${search.adjust ?? ''}-${search.wh ?? ''}`}
                warehouses={warehouses}
                initialVariantId={search.adjust}
                initialWarehouseId={search.wh}
                selectedSku={rows.find((row) => row.variantId === search.adjust)?.sku}
              />
              <AddStockItemForm warehouses={warehouses} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
