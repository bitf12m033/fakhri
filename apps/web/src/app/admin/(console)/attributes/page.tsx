import Link from 'next/link';
import { TYPE_LABEL } from '@/components/admin/catalog/form-values';
import { NoAccess } from '@/components/admin/NoAccess';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import { ATTRIBUTE_TYPES, type AdminAttributeRow, type AttributeType } from '@/lib/api/admin-catalog-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';

export const metadata = { title: 'Attributes' };

type Search = { q?: string; type?: string; page?: string };

export default async function AdminAttributesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'attributes')) return <NoAccess section="attributes" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q) query.set('q', search.q);
  if (ATTRIBUTE_TYPES.includes(search.type as AttributeType)) query.set('type', search.type!);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: attributes, meta } = await sessionApi<AdminAttributeRow[], PaginationMeta>(
    `/admin/attributes?${query}`,
    { session: 'admin' },
  );

  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/attributes?${next}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Attributes</h1>
        <Link className="button" href="/admin/attributes/new">
          New attribute
        </Link>
      </div>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Name or slug</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={search.type ?? ''}>
            <option value="">Any</option>
            {ATTRIBUTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">{meta.totalItems} attributes</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Type</th>
              <th>Unit</th>
              <th className="num">Options</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {attributes.map((attribute) => (
              <tr key={attribute.id}>
                <td>
                  <Link href={`/admin/attributes/${attribute.id}`}>{attribute.name}</Link>
                </td>
                <td className="muted">{attribute.slug}</td>
                <td>{TYPE_LABEL[attribute.type]}</td>
                <td>{attribute.unit ?? '—'}</td>
                <td className="num">{attribute.type === 'OPTION' ? attribute.optionCount : '—'}</td>
                <td className="small">
                  {[attribute.isSearchable ? 'searchable' : null, attribute.isComparable ? 'comparable' : null]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
              </tr>
            ))}
            {attributes.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No attributes match.
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
