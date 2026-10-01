import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb, Stars } from '@/components/ui';
import { publicApi, publicApiOrNull } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { ProductDetail, Review, ReviewsMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { absolute } from '@/lib/site';
import { BuyBox } from './BuyBox';
import { Gallery } from './Gallery';
import { ReviewForm } from './ReviewForm';

type Props = { params: Promise<{ slug: string }> };

/** ISR (REQ-10): rebuilt at most once a minute, or at once when PRODUCT_PUBLISHED revalidates the tag. */
export const revalidate = 60;

/** None at build time: each page is rendered on first request, then cached (ISR) until revalidated. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

async function load(slug: string) {
  return publicApiOrNull<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
    tags: [TAGS.product(slug), TAGS.catalog],
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = (await load(slug))?.data;
  if (!product) return { title: 'Product not found' };
  const image = product.images[0]?.url;
  return {
    title: product.seo?.title ?? product.name,
    description: product.seo?.description ?? product.shortDescription ?? undefined,
    keywords: product.seo?.keywords,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: { title: product.name, type: 'website', images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const result = await load(slug);
  if (!result) notFound();
  const product = result.data;
  const reviews = await publicApi<Review[], ReviewsMeta>(`/reviews?productId=${product.id}&pageSize=10`, {
    tags: [TAGS.product(slug)],
  }).catch(() => null);

  const breadcrumb = [
    { href: '/', label: 'Home' },
    ...product.breadcrumb.map((node) => ({ href: `/category/${node.slug}`, label: node.name })),
    { label: product.name },
  ];

  return (
    <div className="stack">
      <script
        type="application/ld+json"
        // JSON.stringify output is data, not markup; `<` is escaped so a name cannot close the tag.
        dangerouslySetInnerHTML={{ __html: jsonLd(product, breadcrumb).replace(/</g, '\\u003c') }}
      />
      <Breadcrumb items={breadcrumb} />
      <div className="pdp">
        <Gallery images={product.images} name={product.name} />
        <div className="stack">
          <div>
            <a href={`/brand/${product.brand.slug}`} className="small">
              {product.brand.name}
            </a>
            <h1>{product.name}</h1>
            <Stars average={product.rating.average} count={product.rating.count} />
          </div>
          {product.shortDescription ? <p>{product.shortDescription}</p> : null}
          <BuyBox product={product} />
          {product.warrantyInfo ? (
            <p className="small">
              <strong>Warranty:</strong> {product.warrantyInfo}
            </p>
          ) : null}
        </div>
      </div>

      {product.description ? (
        <section className="panel" aria-labelledby="about">
          <h2 id="about">About this product</h2>
          {product.description.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      ) : null}

      {product.specGroups.length > 0 ? (
        <section className="panel" aria-labelledby="specs">
          <h2 id="specs">Specifications</h2>
          {product.specGroups.map((group) => (
            <table key={group.group ?? 'general'} className="spec-table">
              {group.group ? (
                <caption style={{ textAlign: 'left', fontWeight: 700, padding: '0.75rem 0 0.25rem' }}>{group.group}</caption>
              ) : null}
              <tbody>
                {group.specs.map((spec) => (
                  <tr key={spec.attributeId}>
                    <th scope="row">{spec.name}</th>
                    <td>{specValue(spec.value, spec.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </section>
      ) : null}

      <section className="panel stack" aria-labelledby="reviews">
        <h2 id="reviews">Customer reviews</h2>
        <Stars average={reviews?.meta.summary.average ?? null} count={reviews?.meta.summary.count ?? 0} />
        {reviews && reviews.data.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
            {reviews.data.map((review, index) => (
              <li key={index} style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
                <div className="row">
                  <span className="stars" aria-label={`${review.rating} out of 5`}>
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </span>
                  {review.title ? <strong>{review.title}</strong> : null}
                  {review.isVerifiedPurchase ? <span className="pill ok">Verified purchase</span> : null}
                </div>
                {review.body ? <p style={{ margin: '0.25rem 0' }}>{review.body}</p> : null}
                <div className="muted small">
                  {review.author} · {dateTime(review.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <ReviewForm productId={product.id} />
      </section>
    </div>
  );
}

function specValue(value: string | boolean | null, unit: string | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return unit ? `${value} ${unit}` : value;
}

/** Product + BreadcrumbList structured data (REQ-10). */
function jsonLd(product: ProductDetail, breadcrumb: { href?: string; label: string }[]): string {
  const availability = {
    IN_STOCK: 'https://schema.org/InStock',
    AVAILABLE_ON_ORDER: 'https://schema.org/PreOrder',
    OUT_OF_STOCK: 'https://schema.org/OutOfStock',
  }[product.availability];
  const offers = product.variants
    .filter((variant) => variant.price)
    .map((variant) => ({
      '@type': 'Offer',
      sku: variant.sku,
      price: variant.price,
      priceCurrency: 'PKR',
      availability,
      url: absolute(`/product/${product.slug}`),
    }));
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.shortDescription ?? undefined,
      image: product.images.map((image) => image.url),
      sku: product.variants[0]?.sku,
      brand: { '@type': 'Brand', name: product.brand.name },
      offers,
      aggregateRating:
        product.rating.count > 0 && product.rating.average
          ? { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count }
          : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumb.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        item: item.href ? absolute(item.href) : absolute(`/product/${product.slug}`),
      })),
    },
  ]);
}
