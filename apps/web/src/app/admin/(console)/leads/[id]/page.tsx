import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { LeadDetail } from '@/lib/api/leads-types';
import { leadName } from '@/lib/api/leads-types';
import { sessionApiOrNull } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { ConsentPill } from '../ConsentPill';
import { LEAD_LINKS } from '../links';

export const metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'leads')) return <NoAccess section="leads" />;

  const { id } = await params;
  const result = await sessionApiOrNull<LeadDetail>(`/admin/leads/${id}`, { session: 'admin' });
  if (!result) notFound();
  const lead = result.data;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/leads">← Leads</Link>
        </p>
        <h1>{leadName(lead)}</h1>
      </div>
      <SubNav links={LEAD_LINKS} current="/admin/leads" />
      <div className="panel stack">
        <p>
          <ConsentPill consent={lead.consent} />
          {lead.consentAt ? <span className="muted small"> recorded {dateTime(lead.consentAt)}</span> : null}
        </p>
        <p style={{ margin: 0 }}>
          {lead.phone}
          <br />
          {lead.accountName ? <>{lead.accountName}<br /></> : null}
          {[lead.locality, lead.city].filter(Boolean).join(', ') || 'No city'}
          <br />
          {lead.productInterest ?? 'No product interest'}
          <br />
          <span className="muted small">{lead.customerId ? 'Linked to a store account' : 'No store account'}</span>
        </p>
        <div className="row">
          <ActionButton
            label="Opt in"
            path={`/admin/leads/${lead.id}/consent`}
            method="PATCH"
            body={{ consent: 'OPTED_IN' }}
            success="Marked as opted in."
            testId="opt-in"
          />
          <ActionButton
            label="Opt out"
            path={`/admin/leads/${lead.id}/consent`}
            method="PATCH"
            body={{ consent: 'OPTED_OUT' }}
            variant="danger"
            confirm="Mark this number as opted out? Campaigns will skip it."
            success="Marked as opted out."
            testId="opt-out"
          />
        </div>
      </div>
      <h2>Cases</h2>
      {lead.cases.length === 0 ? (
        <p className="muted">No cases on this lead.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Product</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {lead.cases.map((item) => (
                <tr key={item.id}>
                  <td>{item.caseNumber ?? '—'}</td>
                  <td>{item.status ?? '—'}</td>
                  <td>{item.product ?? '—'}</td>
                  <td className="small">{item.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
