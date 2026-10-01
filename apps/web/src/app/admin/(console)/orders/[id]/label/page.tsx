import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { AddressBlock } from '@/components/OrderParts';
import { canAccess, currentAdmin } from '@/lib/admin';
import { sessionApi } from '@/lib/api/server';
import { pkr } from '@/lib/format';
import { PrintButton } from '../PrintButton';

export const metadata = { title: 'Shipping label' };

interface Label {
  orderRef: string;
  carrier: string | null;
  trackingCode: string | null;
  from: { name: string; address: string; phone: string };
  to: Record<string, unknown> | null;
  contactPhone: string | null;
  pieces: number;
  weightKg: string;
  collectOnDelivery: string | null;
  [key: string]: unknown;
}

/** Generic courier label; carrier-specific formats are out of scope (3.6 deviation 3). */
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'orders')) return <NoAccess section="orders" />;
  const { id } = await params;
  const { data: label } = await sessionApi<Label>(`/admin/orders/${encodeURIComponent(id)}/shipment/label`, {
    session: 'admin',
  });

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <div className="row no-print">
        <Link href={`/admin/orders/${id}`}>← Back to order</Link>
        <PrintButton />
      </div>
      <div className="panel stack" style={{ border: '2px solid var(--ink)' }}>
        <div className="spread">
          <strong style={{ fontSize: '1.3rem' }}>{label.carrier ?? 'Courier'}</strong>
          <span>{label.trackingCode ?? 'No tracking code'}</span>
        </div>
        <div>
          <div className="small muted">To</div>
          <AddressBlock address={label.to} />
          <div>{label.contactPhone}</div>
        </div>
        <div className="small">
          <div className="muted">From</div>
          {label.from.name}, {label.from.address}, {label.from.phone}
        </div>
        <div className="spread">
          <span>Order {label.orderRef}</span>
          <span>
            {label.pieces} pcs · {label.weightKg} kg
          </span>
        </div>
        {label.collectOnDelivery ? <div className="notice warn">Collect cash: {pkr(label.collectOnDelivery)}</div> : null}
      </div>
    </div>
  );
}
