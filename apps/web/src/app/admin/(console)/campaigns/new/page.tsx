import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CampaignTemplate } from '@/lib/api/leads-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { CampaignForm } from './CampaignForm';
import { CAMPAIGN_LINKS } from '../links';

export const metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'campaigns')) return <NoAccess section="campaigns" />;

  const { data: templates } = await sessionApi<CampaignTemplate[], PaginationMeta>(
    '/admin/campaign-templates?pageSize=100',
    { session: 'admin' },
  );
  const approved = templates.filter((template) => template.status === 'APPROVED');

  return (
    <div className="stack">
      <h1>New campaign</h1>
      <SubNav links={CAMPAIGN_LINKS} current="/admin/campaigns/new" />
      {approved.length === 0 ? (
        <div className="notice warn" role="status">
          Approve a template before sending. <Link href="/admin/campaign-templates/new">Create one</Link>
        </div>
      ) : (
        <CampaignForm templates={approved} />
      )}
    </div>
  );
}
