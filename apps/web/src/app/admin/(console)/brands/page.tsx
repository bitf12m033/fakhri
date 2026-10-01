import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminBrand } from '@/lib/api/admin-catalog-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';

export const metadata = { title: 'Brands' };

type Search = { q?: string; isActive?: string; page?: string };

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'brands')) return <NoAccess section="brands" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q) query.set('q', search.q);
  if (search.isActive === 'true' || search.isActive === 'false') query.set('isActive', search.isActive);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: brands, meta } = await sessionApi<AdminBrand[], PaginationMeta>(`/admin/brands?${query}`, {
    session: 'admin',
  });

  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/brands?${next}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Brands</h1>
        <Link className="button" href="/admin/brands/new">
          New brand
        </Link>
      </div>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Name or slug</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="isActive">Visibility</label>
          <select id="isActive" name="isActive" defaultValue={search.isActive ?? ''}>
            <option value="">Any</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">{meta.totalItems} brands</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  <Link href={`/admin/brands/${brand.id}`}>{brand.name}</Link>
                </td>
                <td className="muted">{brand.slug}</td>
                <td>
                  <span className={`pill ${brand.isActive ? 'ok' : ''}`}>{brand.isActive ? 'Active' : 'Inactive'}</span>
                </td>
              </tr>
            ))}
            {brands.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No brands match.
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
