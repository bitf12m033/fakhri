import Link from 'next/link';
import { AvailabilityBadge, EmptyState } from '@/components/ui';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta, WishlistItem } from '@/lib/api/types';
import { pkr } from '@/lib/format';
import { RemoveFromWishlist } from './RemoveFromWishlist';

export const metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  const { data: items } = await sessionApi<WishlistItem[], PaginationMeta>('/customers/me/wishlist?pageSize=100', {
    session: 'customer',
  });
  return (
    <>
      <h1>Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState title="Nothing saved yet">
          <p>Use “Save” on a product page to keep it here.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <tbody>
              {items.map((item) => (
                <tr key={item.variantId} data-testid="wishlist-item">
                  <td>
                    {item.product ? (
                      <Link href={`/product/${item.product.slug}`}>{item.product.name}</Link>
                    ) : (
                      <span className="muted">No longer available</span>
                    )}
                    <div className="small muted">SKU {item.sku}</div>
                  </td>
                  <td className="num">{pkr(item.price)}</td>
                  <td>{item.product ? <AvailabilityBadge value={item.product.availability} /> : null}</td>
                  <td>
                    <RemoveFromWishlist variantId={item.variantId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
