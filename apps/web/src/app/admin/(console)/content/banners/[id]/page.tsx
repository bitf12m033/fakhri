import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { Notice } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import { BannerForm } from '../../BannerForm';
import { findBanner } from '../../find';

export const metadata = { title: 'Edit banner' };

export default async function EditBannerPage({
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
  const banner = await findBanner(id);
  if (!banner) notFound();

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/content/banners">← Banners</Link>
          </p>
          <h1>{banner.title || 'Untitled banner'}</h1>
          <ActivePill active={banner.isActive} />
        </div>
        <div className="row">
          <ActionButton
            label={banner.isActive ? 'Deactivate' : 'Activate'}
            path={`/admin/content/banners/${banner.id}`}
            method="PATCH"
            body={{ isActive: !banner.isActive }}
            variant="secondary"
          />
          <ActionButton
            label="Delete banner"
            path={`/admin/content/banners/${banner.id}`}
            method="DELETE"
            variant="danger"
            confirm="Delete this banner? This cannot be undone."
            redirectTo="/admin/content/banners"
          />
        </div>
      </div>
      {created ? <Notice tone="ok">Banner created.</Notice> : null}
      <div className="panel">
        <img
          src={banner.imageUrl}
          alt="Banner preview"
          width={1200}
          height={450}
          style={{ width: '100%', maxWidth: 720, aspectRatio: '16 / 6', objectFit: 'cover', borderRadius: 6 }}
        />
      </div>
      <BannerForm banner={banner} />
    </div>
  );
}
