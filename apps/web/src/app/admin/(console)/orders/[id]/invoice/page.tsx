import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { AddressBlock } from '@/components/OrderParts';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { Invoice } from '@/lib/api/admin-types';
import { sessionApi } from '@/lib/api/server';
import { day, pkr } from '@/lib/format';
import { PrintButton } from '../PrintButton';

export const metadata = { title: 'Invoice' };

const TOTAL_LABELS: Record<string, string> = {
  itemsTotal: 'Items',
  discountTotal: 'Discount',
  valueExcludingTax: 'Value excluding sales tax',
  salesTax: 'Sales tax',
  deliveryFee: 'Delivery',
  grandTotal: 'Total payable',
};

/** Printable sales invoice with the FBR fields the API supplies (REQ-31/40). */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'orders')) return <NoAccess section="orders" />;
  const { id } = await params;
  const { data: invoice } = await sessionApi<Invoice>(`/admin/orders/${encodeURIComponent(id)}/invoice`, {
    session: 'admin',
  });

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div className="row no-print">
        <Link href={`/admin/orders/${id}`}>← Back to order</Link>
        <PrintButton />
      </div>
      <div className="panel stack">
        <div className="spread">
          <div>
            <h1 style={{ marginBottom: 0 }}>Sales tax invoice</h1>
            <div>
              {invoice.invoiceNumber} · {day(invoice.invoiceDate)}
            </div>
          </div>
          <div className="small" style={{ textAlign: 'right' }}>
            <strong>{invoice.seller.name}</strong>
            <br />
            {invoice.seller.address}
            <br />
            NTN {invoice.seller.ntn}
            {invoice.seller.strn ? ` · STRN ${invoice.seller.strn}` : ''}
            <br />
            {invoice.seller.phone}
          </div>
        </div>
        <div>
          <h2>Bill to</h2>
          <p style={{ margin: 0 }}>
            {invoice.buyer.name ?? 'Customer'} · {invoice.buyer.phone}
            {invoice.buyer.email ? ` · ${invoice.buyer.email}` : ''}
          </p>
          <AddressBlock address={invoice.buyer.address} />
        </div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>SKU</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.sku}>
                <td>{line.description}</td>
                <td>{line.sku}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">{pkr(line.unitPrice)}</td>
                <td className="num">{pkr(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="totals" style={{ maxWidth: 360, marginLeft: 'auto' }}>
          <tbody>
            {Object.entries(invoice.totals)
              .filter(([key]) => key in TOTAL_LABELS)
              .map(([key, value]) => (
                <tr key={key} className={key === 'grandTotal' ? 'grand' : undefined}>
                  <td>{TOTAL_LABELS[key]}</td>
                  <td className="num">{pkr(value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="small muted">Prices are inclusive of sales tax where applicable.</p>
      </div>
    </div>
  );
}
