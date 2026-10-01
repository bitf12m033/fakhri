import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BindingsEditor } from '@/components/admin/catalog/BindingsEditor';
import { CategoryForm } from '@/components/admin/catalog/CategoryForm';
import { DeleteButton } from '@/components/admin/catalog/DeleteButton';
import { flattenTree } from '@/components/admin/catalog/form-values';
import { allAttributes, categoryTree } from '@/components/admin/catalog/load';
import { NoAccess } from '@/components/admin/NoAccess';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminCategory, TemplateBinding } from '@/lib/api/admin-catalog-types';
import { sessionApi, sessionApiOrNull } from '@/lib/api/server';

export const metadata = { title: 'Category' };

export default async function AdminCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'categories')) return <NoAccess section="categories" />;

  const { id } = await params;
  const path = `/admin/categories/${encodeURIComponent(id)}`;
  const result = await sessionApiOrNull<AdminCategory>(path, { session: 'admin' });
  if (!result) notFound();
  const category = result.data;

  const [tree, bindings, template, attributes] = await Promise.all([
    categoryTree(),
    sessionApi<TemplateBinding[]>(`${path}/attributes`, { session: 'admin' }),
    sessionApi<TemplateBinding[]>(`${path}/attribute-template`, { session: 'admin' }),
    allAttributes(),
  ]);
  // The effective template reports a child's own row, so an overridden parent binding is not "inherited" here.
  const inherited = template.data.filter((binding) => binding.inherited);

  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/categories">← Categories</Link>
      </p>
      <div className="spread">
        <h1>{category.name}</h1>
        <Link className="button secondary small" href={`/admin/categories/new?parentId=${category.id}`}>
          Add subcategory
        </Link>
      </div>
      <CategoryForm category={category} parents={flattenTree(tree, category.id)} />
      <BindingsEditor
        categoryId={category.id}
        bindings={bindings.data}
        inherited={inherited}
        attributes={attributes}
      />
      <div className="panel stack">
        <h2>Delete category</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Only possible once it has no subcategories and no products. To hide it instead, untick Active.
        </p>
        <DeleteButton
          path={`/admin/categories/${category.id}`}
          confirmText={`Delete the category "${category.name}"? This cannot be undone.`}
          label="Delete category"
          redirectTo="/admin/categories"
        />
      </div>
    </div>
  );
}
