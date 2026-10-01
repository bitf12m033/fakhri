import Link from 'next/link';
import { canAccess, currentAdmin, Section, SECTIONS } from '@/lib/admin';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';

export const metadata = { title: 'Dashboard' };

async function count(path: string): Promise<number | null> {
  try {
    const result = await sessionApi<unknown[], PaginationMeta>(path, { session: 'admin' });
    return result.meta.totalItems;
  } catch {
    return null;
  }
}

export default async function AdminDashboard() {
  const admin = (await currentAdmin())!;
  const sees = (section: Section) => canAccess(admin.role, section);

  const [pending, confirmed, packed, reviews] = await Promise.all([
    sees('orders') ? count('/admin/orders?status=PENDING&pageSize=1') : null,
    sees('orders') ? count('/admin/orders?status=CONFIRMED&pageSize=1') : null,
    sees('orders') ? count('/admin/orders?status=PACKED&pageSize=1') : null,
    sees('reviews') ? count('/admin/reviews?status=PENDING&pageSize=1') : null,
  ]);

  const stats = [
    { label: 'Orders to confirm', value: pending, href: '/admin/orders?status=PENDING' },
    { label: 'Orders to pack', value: confirmed, href: '/admin/orders?status=CONFIRMED' },
    { label: 'Orders to ship', value: packed, href: '/admin/orders?status=PACKED' },
    { label: 'Reviews to moderate', value: reviews, href: '/admin/reviews?status=PENDING' },
  ].filter((stat) => stat.value !== null);

  return (
    <div className="stack">
      <h1>Dashboard</h1>
      {stats.length > 0 ? (
        <div className="stat-grid">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href} className="stat" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted small">{stat.label}</div>
              <div className="value">{stat.value}</div>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="panel">
        <h2>Your sections</h2>
        <ul>
          {(Object.keys(SECTIONS) as Section[])
            .filter(sees)
            .map((section) => (
              <li key={section}>
                <Link href={SECTIONS[section].href}>{SECTIONS[section].label}</Link>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
