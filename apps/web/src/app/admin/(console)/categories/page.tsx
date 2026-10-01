import Link from 'next/link';
import { categoryTree } from '@/components/admin/catalog/load';
import { NoAccess } from '@/components/admin/NoAccess';
import { EmptyState } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { CategoryNode } from '@/lib/api/admin-catalog-types';

export const metadata = { title: 'Categories' };

function Branch({ nodes }: { nodes: CategoryNode[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, paddingLeft: '1.25rem', borderLeft: '1px solid var(--line)' }}>
      {nodes.map((node) => (
        <li key={node.id} style={{ padding: '0.3rem 0' }}>
          <div className="row">
            <Link href={`/admin/categories/${node.id}`}>
              <strong>{node.name}</strong>
            </Link>
            <span className="muted small">/{node.slug}</span>
            <span className="muted small">sort {node.sortOrder}</span>
            {node.isActive ? null : <span className="pill">Inactive</span>}
            <Link className="small" href={`/admin/categories/new?parentId=${node.id}`}>
              Add subcategory<span className="visually-hidden"> to {node.name}</span>
            </Link>
          </div>
          {node.children.length > 0 ? <Branch nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function AdminCategoriesPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'categories')) return <NoAccess section="categories" />;

  const tree = await categoryTree();

  return (
    <div className="stack">
      <div className="spread">
        <h1>Categories</h1>
        <Link className="button" href="/admin/categories/new">
          New category
        </Link>
      </div>
      {tree.length === 0 ? (
        <EmptyState title="No categories yet">
          <p>Create a top-level category to start the catalog.</p>
        </EmptyState>
      ) : (
        <nav className="panel" aria-label="Category tree" data-testid="category-tree">
          <Branch nodes={tree} />
        </nav>
      )}
    </div>
  );
}
