import Link from 'next/link';
import { Suspense } from 'react';
import { CompareTray } from '@/components/shop/CompareToggle';
import { HeaderLinks } from '@/components/shop/HeaderLinks';
import { SearchBox } from '@/components/shop/SearchBox';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { CategoryNode } from '@/lib/api/types';

/**
 * Storefront shell. Reads only cached public data, so every page under it can be
 * statically rendered; per-visitor bits (account link, cart count) load client-side.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await publicApi<CategoryNode[]>('/categories', { tags: [TAGS.catalog] })
    .then((result) => result.data)
    .catch(() => [] as CategoryNode[]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container bar">
          <Link href="/" className="logo">
            Fakhri
          </Link>
          <Suspense fallback={<div className="search-form" />}>
            <SearchBox />
          </Suspense>
          <HeaderLinks />
        </div>
        <nav className="nav" aria-label="Categories">
          <ul className="container">
            {categories.flatMap((root) => [root, ...root.children]).map((node) => (
              <li key={node.slug}>
                <Link href={`/category/${node.slug}`}>{node.name}</Link>
              </li>
            ))}
            <li>
              <Link href="/brands">Brands</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main">
        <div className="container">{children}</div>
      </main>
      <CompareTray />
      <footer className="site-footer">
        <div className="container stack">
          <ul>
            <li>
              <Link href="/pages/about">About us</Link>
            </li>
            <li>
              <Link href="/pages/delivery">Delivery</Link>
            </li>
            <li>
              <Link href="/pages/returns">Returns &amp; warranty</Link>
            </li>
            <li>
              <Link href="/track">Track your order</Link>
            </li>
          </ul>
          <p className="small">Prices in PKR and inclusive of applicable taxes. Cash on delivery nationwide.</p>
        </div>
      </footer>
    </>
  );
}
