import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { Warehouse } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import { INVENTORY_LINKS } from '../links';
import { WarehouseForm } from './WarehouseForm';

export const metadata = { title: 'Warehouses' };

export default async function WarehousesPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'inventory')) return <NoAccess section="inventory" />;

  const { data: warehouses } = await sessionApi<Warehouse[]>('/admin/inventory/warehouses', { session: 'admin' });

  return (
    <div className="stack">
      <h1>Warehouses</h1>
      <SubNav links={INVENTORY_LINKS} current="/admin/inventory/warehouses" />
      <div className="two-col">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Links</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id} data-testid="warehouse-row">
                  <td>
                    <code>{warehouse.code}</code>
                  </td>
                  <td>{warehouse.name}</td>
                  <td>
                    {warehouse.address}
                    <br />
                    <span className="muted small">{warehouse.city}</span>
                  </td>
                  <td>{warehouse.phone ?? '—'}</td>
                  <td>
                    <ActivePill active={warehouse.isActive} />
                  </td>
                  <td className="small">
                    <Link href={`/admin/inventory?warehouseId=${warehouse.id}`}>Stock</Link>
                    {' · '}
                    <Link href={`/admin/inventory/ledger?warehouseId=${warehouse.id}`}>Ledger</Link>
                  </td>
                </tr>
              ))}
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No warehouses yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <WarehouseForm />
      </div>
    </div>
  );
}
