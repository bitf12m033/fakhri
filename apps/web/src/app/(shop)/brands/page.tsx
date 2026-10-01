import Link from 'next/link';
import { Breadcrumb } from '@/components/ui';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { BrandSummary, PaginationMeta } from '@/lib/api/types';

export const metadata = { title: 'Brands', alternates: { canonical: '/brands' } };

export default async function BrandsPage() {
  // Tolerates an unreachable API so an image build can prerender it; ISR refills it within a minute.
  const brands = await publicApi<BrandSummary[], PaginationMeta>('/brands?pageSize=100', { tags: [TAGS.catalog] })
    .then((result) => result.data)
    .catch(() => [] as BrandSummary[]);
  return (
    <div className="stack">
      <Breadcrumb items={[{ href: '/', label: 'Home' }, { label: 'Brands' }]} />
      <h1>Brands</h1>
      <div className="grid">
        {brands.map((brand) => (
          <Link key={brand.slug} href={`/brand/${brand.slug}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2 style={{ marginBottom: '0.25rem' }}>{brand.name}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
            </p>
            {brand.description ? <p className="small" style={{ margin: '0.5rem 0 0' }}>{brand.description}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
