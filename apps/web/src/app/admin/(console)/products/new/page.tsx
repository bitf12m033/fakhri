import Link from 'next/link';
import { flattenTree } from '@/components/admin/catalog/form-values';
import { allBrands, categoryTree } from '@/components/admin/catalog/load';
import { ProductCoreForm } from '@/components/admin/catalog/ProductCoreForm';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';

export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'products')) return <NoAccess section="products" />;

  const [brands, tree] = await Promise.all([allBrands(), categoryTree()]);

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/products">← Products</Link>
      </p>
      <h1>New product</h1>
      <p className="muted small" style={{ margin: 0 }}>
        Start as a draft: attributes, variants and images are added on the next page, then set it active.
      </p>
      <ProductCoreForm
        brands={brands.map(({ id, slug, name, isActive }) => ({ id, slug, name, isActive }))}
        categories={flattenTree(tree)}
      />
    </div>
  );
}
