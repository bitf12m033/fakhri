import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CampaignSummary } from '@/lib/api/leads-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { CAMPAIGN_LINKS, CAMPAIGN_STATUS } from './links';

export const metadata = { title: 'Campaigns' };

type Search = { page?: string };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'campaigns')) return <NoAccess section="campaigns" />;

  const search = await searchParams;
  const query = new URLSearchParams({ page: search.page ?? '1', pageSize: '25' });
  const { data: campaigns, meta } = await sessionApi<CampaignSummary[], PaginationMeta>(`/admin/campaigns?${query}`, {
    session: 'admin',
  });
  const hrefFor = (page: number) => `/admin/campaigns?page=${page}`;

  return (
    <div className="stack">
      <div className="spread">
        <h1>Campaigns</h1>
        <Link href="/admin/campaigns/new" className="button">
          New campaign
        </Link>
      </div>
      <SubNav links={CAMPAIGN_LINKS} current="/admin/campaigns" />
      <p className="muted small">A send includes only leads who opted in and match the city and product. Dev delivery is logged, not sent on WhatsApp.</p>
      <p className="muted small">{meta.totalItems} campaigns</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Audience</th>
              <th className="num">Sent</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} data-testid="campaign-row">
                <td>
                  <Link href={`/admin/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </td>
                <td>
                  {campaign.city ?? 'Any city'}
                  <div className="muted small">{campaign.productInterest ?? 'Any product'}</div>
                </td>
                <td className="num">
                  {campaign.sentCount} / {campaign.recipientCount}
                </td>
                <td>{CAMPAIGN_STATUS[campaign.status]}</td>
                <td className="small">{dateTime(campaign.sentAt ?? campaign.createdAt)}</td>
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No campaigns yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
