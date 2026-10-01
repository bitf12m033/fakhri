import Link from 'next/link';
import type { ProductCard as Card } from '@/lib/api/types';
import { priceRange } from '@/lib/format';
import { AvailabilityBadge } from './ui';
import { CompareToggle } from './shop/CompareToggle';

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  return (
    <article className="card" data-testid="product-card">
      <div className="media">
        {product.image ? (
          // Plain img: product media is SVG or remote and sized by CSS; next/image adds nothing here.
          <img
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            width={400}
            height={300}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
          />
        ) : (
          <span className="muted small">No image</span>
        )}
      </div>
      <div className="body">
        <span className="muted small">{product.brand.name}</span>
        <Link href={`/product/${product.slug}`} className="title">
          {product.name}
        </Link>
        <div>
          <span className="price">{priceRange(product.fromPrice, product.variantCount > 1 ? product.toPrice : null)}</span>
        </div>
        <div className="spread actions">
          <AvailabilityBadge value={product.availability} />
          <CompareToggle id={product.id} name={product.name} />
        </div>
      </div>
    </article>
  );
}
