import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { Banner, CategoryNode, ProductCard as Card, SearchMeta } from '@/lib/api/types';
import { safeHref } from '@/lib/format';

export const metadata = { alternates: { canonical: '/' } };

/** Banner positions the storefront renders; admins target them by these slugs (REQ-33). */
const HERO = 'home-hero';

export default async function HomePage() {
  const [banners, categories, newest] = await Promise.all([
    publicApi<Banner[]>(`/banners?position=${HERO}`, { tags: [TAGS.content] })
      .then((result) => result.data)
      .catch(() => [] as Banner[]),
    publicApi<CategoryNode[]>('/categories', { tags: [TAGS.catalog] })
      .then((result) => result.data)
      .catch(() => [] as CategoryNode[]),
    publicApi<Card[], SearchMeta>('/products?sort=newest&pageSize=8', { tags: [TAGS.catalog] })
      .then((result) => result.data)
      .catch(() => [] as Card[]),
  ]);
  const featured = newest.filter((product) => product.isFeatured);
  const rest = newest.filter((product) => !product.isFeatured);

  return (
    <div className="stack" style={{ gap: '2rem' }}>
      <h1 className="visually-hidden">Fakhri — electronics and home appliances</h1>
      {banners.length > 0 ? (
        <section className="banner-strip" aria-label="Promotions">
          {banners.map((banner, index) => {
            const href = safeHref(banner.linkUrl);
            const body = (
              <>
                <img
                  src={banner.imageUrl}
                  alt={banner.title ?? ''}
                  width={1200}
                  height={450}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : undefined}
                />
                {banner.title ? <span>{banner.title}</span> : null}
              </>
            );
            return href ? (
              <Link key={`${banner.position}-${index}`} href={href} className="banner">
                {body}
              </Link>
            ) : (
              <div key={`${banner.position}-${index}`} className="banner">
                {body}
              </div>
            );
          })}
        </section>
      ) : null}

      <section aria-labelledby="shop-by-category">
        <h2 id="shop-by-category">Shop by category</h2>
        <div className="grid">
          {categories.flatMap((root) => (root.children.length > 0 ? root.children : [root])).map((node) => (
            <Link key={node.slug} href={`/category/${node.slug}`} className="panel" style={{ textDecoration: 'none' }}>
              <strong>{node.name}</strong>
              <div className="muted small">
                {node.productCount} {node.productCount === 1 ? 'product' : 'products'}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        <section aria-labelledby="featured">
          <h2 id="featured">Featured</h2>
          <div className="grid">
            {featured.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 2 && banners.length === 0} />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section aria-labelledby="new-arrivals">
          <div className="spread">
            <h2 id="new-arrivals">New arrivals</h2>
            <Link href="/search?sort=newest">See all</Link>
          </div>
          <div className="grid">
            {rest.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
