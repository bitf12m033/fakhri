import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { ActionButton } from '@/components/admin/ops/ActionButton';
import { ActivePill } from '@/components/admin/ops/ActivePill';
import { SubNav } from '@/components/admin/ops/SubNav';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminBanner } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { CONTENT_LINKS, HOME_HERO } from '../links';

export const metadata = { title: 'Banners' };

function schedule(banner: AdminBanner, now: number): string {
  if (banner.endsAt && new Date(banner.endsAt).getTime() < now) return 'ended';
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) return 'scheduled';
  return 'running';
}

export default async function BannersPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'content')) return <NoAccess section="content" />;

  const { data: banners } = await sessionApi<AdminBanner[]>('/admin/content/banners', { session: 'admin' });
  const now = Date.now();

  return (
    <div className="stack">
      <div className="spread">
        <h1>Content</h1>
        <Link href="/admin/content/banners/new" className="button">
          New banner
        </Link>
      </div>
      <SubNav links={CONTENT_LINKS} current="/admin/content/banners" />
      <p className="small muted" style={{ margin: 0 }}>
        The storefront home page shows active banners in the <code>{HOME_HERO}</code> position, by sort order, while
        their schedule is running. Changes reach the storefront within about a minute.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Image</th>
              <th>Headline and link</th>
              <th>Position</th>
              <th className="num">Order</th>
              <th>Schedule</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {banners.map((banner) => (
              <tr key={banner.id} data-testid="banner-row">
                <td>
                  <img
                    src={banner.imageUrl}
                    alt=""
                    width={160}
                    height={60}
                    style={{ objectFit: 'cover', borderRadius: 4, background: 'var(--canvas)' }}
                  />
                </td>
                <td>
                  <Link href={`/admin/content/banners/${banner.id}`}>{banner.title || 'Untitled banner'}</Link>
                  <div className="muted small">{banner.linkUrl || 'No link'}</div>
                </td>
                <td>
                  <code>{banner.position}</code>
                  {banner.position === HOME_HERO ? null : <div className="muted small">not displayed</div>}
                </td>
                <td className="num">{banner.sortOrder}</td>
                <td className="small">
                  {banner.startsAt || banner.endsAt ? (
                    <>
                      {dateTime(banner.startsAt)} – {banner.endsAt ? dateTime(banner.endsAt) : 'no end'}
                      <div className="muted">{schedule(banner, now)}</div>
                    </>
                  ) : (
                    'Always'
                  )}
                </td>
                <td>
                  <ActivePill active={banner.isActive} />
                </td>
                <td>
                  <div className="row" style={{ gap: '0.4rem', alignItems: 'start' }}>
                    <Link href={`/admin/content/banners/${banner.id}`} className="button secondary small">
                      Edit
                    </Link>
                    <ActionButton
                      label={banner.isActive ? 'Deactivate' : 'Activate'}
                      path={`/admin/content/banners/${banner.id}`}
                      method="PATCH"
                      body={{ isActive: !banner.isActive }}
                      variant="secondary"
                    />
                    <ActionButton
                      label="Delete"
                      path={`/admin/content/banners/${banner.id}`}
                      method="DELETE"
                      variant="danger"
                      confirm={`Delete the banner “${banner.title || banner.imageUrl}”?`}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {banners.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No banners yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
