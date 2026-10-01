import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteButton } from '@/components/admin/catalog/DeleteButton';
import { flattenTree } from '@/components/admin/catalog/form-values';
import { allBrands, categoryTree } from '@/components/admin/catalog/load';
import { ProductEditor } from '@/components/admin/catalog/ProductEditor';
import { NoAccess } from '@/components/admin/NoAccess';
import { StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminProduct, TemplateBinding } from '@/lib/api/admin-catalog-types';
import { sessionApi, sessionApiOrNull } from '@/lib/api/server';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Product' };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'products')) return <NoAccess section="products" />;

  const { id } = await params;
  const result = await sessionApiOrNull<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`, {
    session: 'admin',
  });
  if (!result) notFound();
  const product = result.data;

  const [brands, tree, template] = await Promise.all([
    allBrands(),
    categoryTree(),
    sessionApi<TemplateBinding[]>(`/admin/categories/${product.category.id}/attribute-template`, { session: 'admin' }),
  ]);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link href="/admin/products">← Products</Link>
          </p>
          <h1>{product.name}</h1>
          <div className="row">
            <StatusPill status={product.status} />
            <span className="muted small">
              {product.publishedAt ? `Published ${dateTime(product.publishedAt)}` : 'Never published'} · updated{' '}
              {dateTime(product.updatedAt)}
            </span>
          </div>
        </div>
        {product.status === 'ACTIVE' ? (
          <Link className="button secondary small" href={`/product/${product.slug}`}>
            View in shop
          </Link>
        ) : null}
      </div>

      <ProductEditor
        product={product}
        brands={brands.map(({ id: brandId, slug, name, isActive }) => ({ id: brandId, slug, name, isActive }))}
        categories={flattenTree(tree)}
        template={template.data}
      />

      <div className="panel stack">
        <h2>Delete product</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Removes the product with its variants and images. Archive it instead to keep order history readable.
        </p>
        <DeleteButton
          path={`/admin/products/${product.id}`}
          confirmText={`Delete "${product.name}" with all its variants and images? This cannot be undone.`}
          label="Delete product"
          redirectTo="/admin/products"
        />
      </div>
    </div>
  );
}
