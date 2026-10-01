import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Notice } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import { dateTime } from '@/lib/format';
import { findPage } from '../../find';
import { PageForm } from '../../PageForm';

export const metadata = { title: 'Edit page' };

export default async function EditContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'content')) return <NoAccess section="content" />;

  const { id } = await params;
  const { created } = await searchParams;
  const page = await findPage(id);
  if (!page) notFound();

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/content">← Content</Link>
          </p>
          <h1>{page.title}</h1>
          <div className="row">
            <ActivePill active={page.isPublished} on="published" off="draft" />
            <span className="muted small">
              {page.publishedAt ? `First published ${dateTime(page.publishedAt)} · ` : ''}Updated{' '}
              {dateTime(page.updatedAt)}
            </span>
            {page.isPublished ? (
              <a href={`/pages/${page.slug}`} target="_blank" rel="noopener" className="small">
                View on site
              </a>
            ) : null}
          </div>
        </div>
        <div className="row">
          <ActionButton
            label={page.isPublished ? 'Unpublish' : 'Publish'}
            path={`/admin/content/pages/${page.id}`}
            method="PATCH"
            body={{ isPublished: !page.isPublished }}
            variant={page.isPublished ? 'secondary' : undefined}
            confirm={page.isPublished ? 'Take this page off the storefront?' : undefined}
            success={page.isPublished ? 'Unpublished.' : 'Published.'}
          />
          <ActionButton
            label="Delete page"
            path={`/admin/content/pages/${page.id}`}
            method="DELETE"
            variant="danger"
            confirm={`Delete the page “${page.title}”? This cannot be undone.`}
            redirectTo="/admin/content"
          />
        </div>
      </div>
      {created ? <Notice tone="ok">Page created{page.isPublished ? ' and published' : ' as a draft'}.</Notice> : null}
      <PageForm page={page} />
    </div>
  );
}
