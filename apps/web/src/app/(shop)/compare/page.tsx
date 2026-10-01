import Link from 'next/link';
import { EmptyState, Notice } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { Comparison } from '@/lib/api/types';
import { pkr } from '@/lib/format';
import { ClearCompare } from './ClearCompare';

export const metadata = { title: 'Compare products', robots: { index: false, follow: true } };

/** Side by side, shared comparable attributes only (REQ-08). */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length < 2) {
    return (
      <EmptyState title="Pick products to compare">
        <p>Tick “Compare” on two to four products in a listing, then press “Compare now”.</p>
      </EmptyState>
    );
  }

  let comparison: Comparison;
  try {
    comparison = (await publicApi<Comparison>(`/compare?ids=${encodeURIComponent(ids.join(','))}`, { tags: [TAGS.catalog] }))
      .data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      return <Notice tone="warn">{error.message}</Notice>;
    }
    throw error;
  }

  const display = (value: string | boolean | null, unit: string | null) => {
    if (value === null) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return unit ? `${value} ${unit}` : value;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Compare products</h1>
        <ClearCompare />
      </div>
      <div className="table-wrap">
        <table data-testid="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Specification</span>
              </th>
              {comparison.products.map((product) => (
                <th key={product.id} scope="col" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                  {product.image ? (
                    <img src={product.image.url} alt="" width={160} height={120} style={{ objectFit: 'contain' }} />
                  ) : null}
                  <Link href={`/product/${product.slug}`}>{product.name}</Link>
                  <div className="small muted">{product.brand.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price from</th>
              {comparison.products.map((product) => (
                <td key={product.id}>{pkr(product.fromPrice)}</td>
              ))}
            </tr>
            {comparison.specs.map((spec) => (
              <tr key={spec.attributeId}>
                <th scope="row">{spec.name}</th>
                {spec.values.map((entry) => (
                  <td key={entry.productId}>{display(entry.value, spec.unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparison.specs.length === 0 ? (
        <p className="muted small">These products share no comparable specifications.</p>
      ) : null}
    </div>
  );
}
