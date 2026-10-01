import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminContentPage } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { CONTENT_LINKS } from './links';

export const metadata = { title: 'Content pages' };

type Search = { q?: string; page?: string };

export default async function ContentPagesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'content')) return <NoAccess section="content" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q?.trim()) query.set('q', search.q.trim());
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: pages, meta } = await sessionApi<AdminContentPage[], PaginationMeta>(
    `/admin/content/pages?${query}`,
    { session: 'admin' },
  );
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/content?${next}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Content</h1>
        <Link href="/admin/content/pages/new" className="button">
          New page
        </Link>
      </div>
      <SubNav links={CONTENT_LINKS} current="/admin/content" />
      <p className="small muted" style={{ margin: 0 }}>
        Information pages such as About, Returns and Delivery, shown at /pages/&lt;slug&gt;. Drafts are never public.
      </p>

      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Title or slug</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <button type="submit">Search</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Address</th>
              <th>Status</th>
              <th>Updated</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} data-testid="content-page-row">
                <td>
                  <Link href={`/admin/content/pages/${page.id}`}>{page.title}</Link>
                </td>
                <td>
                  {page.isPublished ? (
                    <a href={`/pages/${page.slug}`} target="_blank" rel="noopener">
                      /pages/{page.slug}
                    </a>
                  ) : (
                    <span className="muted">/pages/{page.slug}</span>
                  )}
                </td>
                <td>
                  <ActivePill active={page.isPublished} on="published" off="draft" />
                </td>
                <td className="small">{dateTime(page.updatedAt)}</td>
                <td>
                  <div className="row" style={{ gap: '0.4rem', alignItems: 'start' }}>
                    <Link href={`/admin/content/pages/${page.id}`} className="button secondary small">
                      Edit
                    </Link>
                    <ActionButton
                      label={page.isPublished ? 'Unpublish' : 'Publish'}
                      path={`/admin/content/pages/${page.id}`}
                      method="PATCH"
                      body={{ isPublished: !page.isPublished }}
                      variant="secondary"
                      confirm={page.isPublished ? `Take “${page.title}” off the storefront?` : undefined}
                      testId="page-publish-toggle"
                    />
                    <ActionButton
                      label="Delete"
                      path={`/admin/content/pages/${page.id}`}
                      method="DELETE"
                      variant="danger"
                      confirm={`Delete the page “${page.title}”? This cannot be undone.`}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {pages.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No pages match.
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
