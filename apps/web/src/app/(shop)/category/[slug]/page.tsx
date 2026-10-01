import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Listing } from '@/components/shop/Listing';
import { Breadcrumb } from '@/components/ui';
import { publicApiOrNull } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { CategoryDetail } from '@/lib/api/types';
import { hasFilters, parseListing, RawSearch } from '@/lib/listing';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearch> };

async function load(slug: string) {
  return publicApiOrNull<CategoryDetail>(`/categories/${encodeURIComponent(slug)}/tree`, { tags: [TAGS.catalog] });
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await load(slug))?.data;
  if (!category) return { title: 'Category not found' };
  const filtered = hasFilters(parseListing(await searchParams));
  return {
    title: category.seo?.title ?? category.name,
    description: category.seo?.description ?? category.description ?? undefined,
    // One canonical URL per category; filtered views are not separate pages to index.
    alternates: { canonical: `/category/${category.slug}` },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const result = await load(slug);
  if (!result) notFound();
  const category = result.data;
  const state = parseListing(await searchParams);

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { href: '/', label: 'Home' },
          ...category.breadcrumb.map((node) => ({ href: `/category/${node.slug}`, label: node.name })),
        ]}
      />
      <div>
        <h1>{category.name}</h1>
        {category.description ? <p className="muted">{category.description}</p> : null}
      </div>
      {category.children.length > 0 ? (
        <nav aria-label="Subcategories" className="row">
          {category.children.map((child) => (
            <Link key={child.slug} href={`/category/${child.slug}`} className="button secondary small">
              {child.name} <span className="muted">({child.productCount})</span>
            </Link>
          ))}
        </nav>
      ) : null}
      <Listing path={`/category/${category.slug}`} state={state} scope={{ category: category.slug }} />
    </div>
  );
}
