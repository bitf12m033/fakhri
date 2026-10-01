import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { AddressBlock } from '@/components/OrderParts';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { PackingList } from '@/lib/api/admin-types';
import { sessionApi } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { PrintButton } from '../PrintButton';

export const metadata = { title: 'Packing list' };

export default async function PackingListPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'orders')) return <NoAccess section="orders" />;
  const { id } = await params;
  const { data: list } = await sessionApi<PackingList>(`/admin/orders/${encodeURIComponent(id)}/packing-list`, {
    session: 'admin',
  });

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div className="row no-print">
        <Link href={`/admin/orders/${id}`}>← Back to order</Link>
        <PrintButton />
      </div>
      <div className="panel stack">
        <h1>Packing list · {list.orderRef}</h1>
        <p className="small" style={{ margin: 0 }}>
          Placed {dateTime(list.placedAt)} · {list.deliveryType === 'STORE_PICKUP' ? 'Store pickup' : 'Home delivery'} ·{' '}
          {list.pieces} pieces · {list.weightKg} kg
        </p>
        <AddressBlock address={list.recipient} />
        <p style={{ margin: 0 }}>Contact: {list.contactPhone}</p>
        {list.customerNote ? <p className="notice warn">Customer note: {list.customerNote}</p> : null}
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th className="num">Qty</th>
              <th>Packed</th>
            </tr>
          </thead>
          <tbody>
            {list.lines.map((line) => (
              <tr key={line.sku}>
                <td>{line.sku}</td>
                <td>{line.description}</td>
                <td className="num">{line.quantity}</td>
                <td>☐</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Printed {dateTime(list.printedAt)}</p>
      </div>
    </div>
  );
}
