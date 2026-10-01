import Link from 'next/link';
import { STATUS_LABEL } from '@/components/admin/catalog/form-values';
import { ReindexButton } from '@/components/admin/catalog/ReindexButton';
import { NoAccess } from '@/components/admin/NoAccess';
import { Pagination, StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import { PRODUCT_STATUSES, type AdminProductRow, type ProductStatus } from '@/lib/api/admin-catalog-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime, pkr } from '@/lib/format';

export const metadata = { title: 'Products' };

type Search = { q?: string; status?: string; page?: string };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'products')) return <NoAccess section="products" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q) query.set('q', search.q);
  if (PRODUCT_STATUSES.includes(search.status as ProductStatus)) query.set('status', search.status!);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: products, meta } = await sessionApi<AdminProductRow[], PaginationMeta>(`/admin/products?${query}`, {
    session: 'admin',
  });

  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/products?${next}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Products</h1>
        <div className="row">
          <ReindexButton />
          <Link className="button" href="/admin/products/new">
            New product
          </Link>
        </div>
      </div>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Name or slug</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={search.status ?? ''}>
            <option value="">Any</option>
            {PRODUCT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">{meta.totalItems} products</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Status</th>
              <th className="num">From</th>
              <th className="num">Variants</th>
              <th className="num">Images</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <Link href={`/admin/products/${product.id}`}>{product.name}</Link>
                  {product.isFeatured ? <span className="pill ok small"> Featured</span> : null}
                  <br />
                  <span className="muted small">{product.slug}</span>
                </td>
                <td>{product.brand.name}</td>
                <td>{product.category.name}</td>
                <td>
                  <StatusPill status={product.status} />
                </td>
                <td className="num">{pkr(product.fromPrice)}</td>
                <td className="num">{product.variantCount}</td>
                <td className="num">{product.imageCount}</td>
                <td className="small">{dateTime(product.updatedAt)}</td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No products match.
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
