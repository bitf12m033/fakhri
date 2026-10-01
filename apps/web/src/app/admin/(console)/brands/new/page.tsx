import Link from 'next/link';
import { BrandForm } from '@/components/admin/catalog/BrandForm';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';

export const metadata = { title: 'New brand' };

export default async function NewBrandPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'brands')) return <NoAccess section="brands" />;

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/brands">← Brands</Link>
      </p>
      <h1>New brand</h1>
      <BrandForm />
    </div>
  );
}
