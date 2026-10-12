import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CampaignTemplate } from '@/lib/api/leads-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { CAMPAIGN_LINKS } from '../campaigns/links';

export const metadata = { title: 'Campaign templates' };

type Search = { page?: string };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'campaigns')) return <NoAccess section="campaigns" />;

  const search = await searchParams;
  const query = new URLSearchParams({ page: search.page ?? '1', pageSize: '25' });
  const { data: templates, meta } = await sessionApi<CampaignTemplate[], PaginationMeta>(
    `/admin/campaign-templates?${query}`,
    { session: 'admin' },
  );
  const hrefFor = (page: number) => `/admin/campaign-templates?page=${page}`;

  return (
    <div className="stack">
      <div className="spread">
        <h1>Templates</h1>
        <Link href="/admin/campaign-templates/new" className="button">
          New template
        </Link>
      </div>
      <SubNav links={CAMPAIGN_LINKS} current="/admin/campaign-templates" />
      <p className="muted small">
        A draft cannot be sent. The body must mention STOP and may use {'{{firstName}}'}, {'{{productInterest}}'}, and {'{{city}}'}.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Body</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} data-testid="template-row">
                <td>
                  {template.name}
                  {template.providerTemplateName ? (
                    <div className="muted small">{template.providerTemplateName}</div>
                  ) : null}
                </td>
                <td className="small">{template.body}</td>
                <td>
                  <span className={`pill${template.status === 'APPROVED' ? ' ok' : ' warn'}`}>
                    {template.status === 'APPROVED' ? 'Approved' : 'Draft'}
                  </span>
                </td>
                <td>
                  {template.status === 'DRAFT' ? (
                    <ActionButton
                      label="Approve"
                      path={`/admin/campaign-templates/${template.id}/approve`}
                      success="Template approved."
                      testId="approve-template"
                    />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No templates yet.
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
