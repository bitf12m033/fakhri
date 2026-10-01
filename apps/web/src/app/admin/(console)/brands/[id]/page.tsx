import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandForm } from '@/components/admin/catalog/BrandForm';
import { DeleteButton } from '@/components/admin/catalog/DeleteButton';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminBrand } from '@/lib/api/admin-catalog-types';
import { sessionApiOrNull } from '@/lib/api/server';

export const metadata = { title: 'Brand' };

export default async function AdminBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'brands')) return <NoAccess section="brands" />;

  const { id } = await params;
  const result = await sessionApiOrNull<AdminBrand>(`/admin/brands/${encodeURIComponent(id)}`, { session: 'admin' });
  if (!result) notFound();
  const brand = result.data;

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/brands">← Brands</Link>
      </p>
      <h1>{brand.name}</h1>
      <BrandForm brand={brand} />
      <div className="panel stack">
        <h2>Delete brand</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Only possible while no product uses this brand. To hide it instead, untick Active.
        </p>
        <DeleteButton
          path={`/admin/brands/${brand.id}`}
          confirmText={`Delete the brand "${brand.name}"? This cannot be undone.`}
          label="Delete brand"
          redirectTo="/admin/brands"
        />
      </div>
    </div>
  );
}
