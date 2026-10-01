import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/shop/Listing';
import { Breadcrumb } from '@/components/ui';
import { publicApiOrNull } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { BrandDetail } from '@/lib/api/types';
import { hasFilters, parseListing, RawSearch } from '@/lib/listing';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearch> };

async function load(slug: string) {
  return publicApiOrNull<BrandDetail>(`/brands/${encodeURIComponent(slug)}`, { tags: [TAGS.catalog] });
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = (await load(slug))?.data;
  if (!brand) return { title: 'Brand not found' };
  return {
    title: brand.seo?.title ?? `${brand.name} products`,
    description: brand.seo?.description ?? brand.description ?? undefined,
    alternates: { canonical: `/brand/${brand.slug}` },
    robots: hasFilters(parseListing(await searchParams)) ? { index: false, follow: true } : undefined,
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const result = await load(slug);
  if (!result) notFound();
  const brand = result.data;
  // The brand is fixed by the page, so a `brand=` in the URL would only fight it.
  const state = { ...parseListing(await searchParams), brands: [] };

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { href: '/', label: 'Home' },
          { href: '/brands', label: 'Brands' },
          { label: brand.name },
        ]}
      />
      <div className="row">
        {brand.logoUrl ? (
          // Brand logos are remote and tiny; see ProductCard for why this is a plain img.
          <img src={brand.logoUrl} alt="" width={64} height={64} style={{ objectFit: 'contain' }} />
        ) : null}
        <div>
          <h1>{brand.name}</h1>
          {brand.description ? <p className="muted">{brand.description}</p> : null}
        </div>
      </div>
      <Listing path={`/brand/${brand.slug}`} state={state} scope={{ brand: brand.slug }} />
    </div>
  );
}
