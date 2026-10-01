import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { BrandSummary, CategoryNode, PaginationMeta, ProductCard } from '@/lib/api/types';
import { absolute } from '@/lib/site';

/** Short enough that a sitemap built while the API was unreachable (an image build) heals quickly. */
export const revalidate = 600;

/** Above this many product pages the sitemap needs splitting into an index (50k URLs per file). */
const MAX_PRODUCT_PAGES = 100;
const PAGE_SIZE = 100;

/** Pages the footer links to; the API has no public list of content pages. */
const CONTENT_PAGES = ['about', 'delivery', 'returns'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    return await build();
  } catch {
    // Image builds prerender without an API; serve the static part until the next revalidation.
    return [{ url: absolute('/'), changeFrequency: 'daily', priority: 1 }];
  }
}

async function build(): Promise<MetadataRoute.Sitemap> {
  const [categories, brands] = await Promise.all([
    publicApi<CategoryNode[]>('/categories', { tags: [TAGS.catalog] }).then((r) => r.data),
    publicApi<BrandSummary[], PaginationMeta>('/brands?pageSize=100', { tags: [TAGS.catalog] }).then((r) => r.data),
  ]);

  const products: ProductCard[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
    const result = await publicApi<ProductCard[], PaginationMeta>(
      `/products?sort=newest&page=${page}&pageSize=${PAGE_SIZE}`,
      { tags: [TAGS.catalog] },
    );
    products.push(...result.data);
    if (page >= result.meta.totalPages) break;
  }

  const flatten = (nodes: CategoryNode[]): CategoryNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);

  return [
    { url: absolute('/'), changeFrequency: 'daily', priority: 1 },
    ...flatten(categories).map((node) => ({ url: absolute(`/category/${node.slug}`), changeFrequency: 'daily' as const })),
    { url: absolute('/brands'), changeFrequency: 'weekly' },
    ...brands.map((brand) => ({ url: absolute(`/brand/${brand.slug}`), changeFrequency: 'weekly' as const })),
    ...products.map((product) => ({ url: absolute(`/product/${product.slug}`), changeFrequency: 'weekly' as const })),
    ...CONTENT_PAGES.map((slug) => ({ url: absolute(`/pages/${slug}`), changeFrequency: 'monthly' as const })),
  ];
}
