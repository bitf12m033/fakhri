import Link from 'next/link';
import { CategoryForm } from '@/components/admin/catalog/CategoryForm';
import { flattenTree } from '@/components/admin/catalog/form-values';
import { categoryTree } from '@/components/admin/catalog/load';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';

export const metadata = { title: 'New category' };

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ parentId?: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'categories')) return <NoAccess section="categories" />;

  const { parentId } = await searchParams;
  const parents = flattenTree(await categoryTree());

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/categories">← Categories</Link>
      </p>
      <h1>New category</h1>
      <CategoryForm
        parents={parents}
        defaultParentId={parents.some((parent) => parent.id === parentId) ? parentId : undefined}
      />
    </div>
  );
}
