import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CampaignDetail } from '@/lib/api/leads-types';
import { sessionApiOrNull } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { CAMPAIGN_LINKS, CAMPAIGN_STATUS, RECIPIENT_STATUS } from '../links';

export const metadata = { title: 'Campaign' };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'campaigns')) return <NoAccess section="campaigns" />;

  const { id } = await params;
  const result = await sessionApiOrNull<CampaignDetail>(`/admin/campaigns/${id}`, { session: 'admin' });
  if (!result) notFound();
  const campaign = result.data;

  return (
    <div className="stack">
      <div>
        <p className="small" style={{ margin: 0 }}>
          <Link href="/admin/campaigns">← Campaigns</Link>
        </p>
        <h1>{campaign.name}</h1>
      </div>
      <SubNav links={CAMPAIGN_LINKS} current="/admin/campaigns" />
      <div className="panel stack">
        <p style={{ margin: 0 }}>
          {CAMPAIGN_STATUS[campaign.status]} · {campaign.sentCount} of {campaign.recipientCount} sent
          {campaign.sentAt ? ` · ${dateTime(campaign.sentAt)}` : ''}
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          {campaign.city ?? 'Any city'} · {campaign.productInterest ?? 'Any product'}
        </p>
      </div>
      <h2>Recipients</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {campaign.recipients.map((recipient) => (
              <tr key={recipient.id} data-testid="recipient-row">
                <td>
                  <Link href={`/admin/leads/${recipient.leadId}`}>{recipient.firstName ?? 'Unnamed'}</Link>
                </td>
                <td>{recipient.phone}</td>
                <td>{RECIPIENT_STATUS[recipient.status]}</td>
                <td className="small">{recipient.sentAt ? dateTime(recipient.sentAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
