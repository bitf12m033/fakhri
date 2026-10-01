'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { setCartCount, useSession } from '@/components/shop/session-store';
import { AvailabilityBadge, Price } from '@/components/ui';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { Cart, ProductDetail } from '@/lib/api/types';

const MAX_QUANTITY = 50;

/** Variant choice, price, availability, add to cart and wishlist (REQ-05/06/15/18). */
export function BuyBox({ product }: { product: ProductDetail }) {
  const firstSellable = product.variants.find((variant) => variant.availability !== 'OUT_OF_STOCK');
  const [variantId, setVariantId] = useState((firstSellable ?? product.variants[0])?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cart = useAction();
  const wishlist = useAction();
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const session = useSession();

  const variant = product.variants.find((entry) => entry.id === variantId) ?? product.variants[0];
  if (!variant) return <p className="muted">Currently unavailable.</p>;
  const soldOut = variant.availability === 'OUT_OF_STOCK';

  return (
    <div className="panel stack" data-testid="buy-box">
      <Price value={variant.price} was={variant.compareAtPrice} large />
      <div className="row">
        <AvailabilityBadge value={variant.availability} />
        <span className="muted small">SKU {variant.sku}</span>
      </div>
      {variant.availability === 'AVAILABLE_ON_ORDER' ? (
        <p className="small" style={{ margin: 0 }}>
          Ordered from the supplier when you buy; we confirm the dispatch date by phone.
        </p>
      ) : null}

      {product.variants.length > 1 ? (
        <fieldset>
          <legend>Choose an option</legend>
          <div className="variant-options">
            {product.variants.map((entry) => (
              <label key={entry.id}>
                <input
                  type="radio"
                  name="variant"
                  value={entry.id}
                  checked={entry.id === variantId}
                  onChange={() => {
                    setVariantId(entry.id);
                    setAdded(false);
                  }}
                />
                <span>{entry.name ?? entry.sku}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <form
        className="row"
        onSubmit={async (event) => {
          event.preventDefault();
          setAdded(false);
          const result = await cart.run(() => bff<Cart>('/cart/items', { body: { variantId: variant.id, quantity } }), {
            refresh: false,
          });
          if (result) {
            setCartCount(result.data.itemCount);
            setAdded(true);
          }
        }}
      >
        <label htmlFor="quantity" className="visually-hidden">
          Quantity
        </label>
        <input
          id="quantity"
          className="qty"
          type="number"
          min={1}
          max={MAX_QUANTITY}
          value={quantity}
          onChange={(event) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(event.target.value) || 1)))}
        />
        <button type="submit" disabled={soldOut || cart.pending}>
          {soldOut ? 'Out of stock' : cart.pending ? 'Adding…' : 'Add to cart'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={wishlist.pending}
          onClick={() => {
            if (!session.signedIn) {
              setNeedsSignIn(true);
              return;
            }
            void wishlist.run(() => bff('/customers/me/wishlist', { body: { variantId: variant.id } }), {
              success: 'Saved to your wishlist.',
              refresh: false,
            });
          }}
        >
          ♡ Save
        </button>
      </form>

      <FormStatus error={cart.error} />
      {added ? (
        <div className="notice ok" role="status">
          Added to your cart. <Link href="/cart">View cart and check out</Link>
        </div>
      ) : null}
      <FormStatus error={wishlist.error} message={wishlist.message} />
      {needsSignIn ? (
        <div className="notice info" role="status">
          <Link href={`/login?next=/product/${product.slug}`}>Sign in</Link> to save items to a wishlist.
        </div>
      ) : null}
    </div>
  );
}
