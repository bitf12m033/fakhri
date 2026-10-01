'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { setCartCount } from '@/components/shop/session-store';
import { EmptyState, Notice } from '@/components/ui';
import { bff } from '@/lib/api/client';
import { messageOf } from '@/lib/api/errors';
import type { Cart } from '@/lib/api/types';
import { pkr } from '@/lib/format';

/**
 * The cart is per visitor, so it renders client-side through the BFF; that keeps
 * every catalog page cacheable. Totals are the server's (REQ-18): nothing is
 * summed here.
 */
export function CartView() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const apply = useCallback((next: Cart) => {
    setCart(next);
    setCartCount(next.itemCount);
  }, []);

  const mutate = async (action: () => Promise<{ data: Cart }>) => {
    setBusy(true);
    setError(null);
    try {
      apply((await action()).data);
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    bff<Cart>('/cart')
      .then((result) => apply(result.data))
      .catch((caught) => setError(messageOf(caught)));
  }, [apply]);

  if (!cart) {
    return error ? <Notice tone="error">{error}</Notice> : <p className="muted">Loading your cart…</p>;
  }
  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty">
        <p>
          <Link href="/">Continue shopping</Link>
        </p>
      </EmptyState>
    );
  }

  const blocked = cart.hasUnavailableLines;
  return (
    <div className="two-col">
      <div className="stack">
        {cart.hasPriceChanges ? (
          <Notice tone="warn">
            Some prices changed since you added them. Checkout uses today&apos;s price, shown below each line.
          </Notice>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Price</th>
                <th className="num">Qty</th>
                <th className="num">Subtotal</th>
                <th>
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cart.lines.map((line) => (
                <tr key={line.itemId} data-testid="cart-line">
                  <td>
                    <Link href={`/product/${line.productSlug}`}>{line.productName}</Link>
                    {line.variantName ? <div className="small muted">{line.variantName}</div> : null}
                    {!line.inStock ? (
                      <div className="small" style={{ color: 'var(--danger)' }}>
                        {line.available === null
                          ? 'No longer sold'
                          : `Only ${line.available} left — reduce the quantity`}
                      </div>
                    ) : null}
                    {line.priceChanged ? (
                      <div className="small" style={{ color: 'var(--warn)' }}>
                        Now {pkr(line.currentPrice)}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{pkr(line.unitPrice)}</td>
                  <td className="num">
                    <label className="visually-hidden" htmlFor={`qty-${line.itemId}`}>
                      Quantity for {line.productName}
                    </label>
                    <select
                      id={`qty-${line.itemId}`}
                      value={line.quantity}
                      disabled={busy}
                      style={{ width: '5rem' }}
                      onChange={(event) =>
                        void mutate(() =>
                          bff<Cart>(`/cart/items/${line.itemId}`, {
                            method: 'PATCH',
                            body: { quantity: Number(event.target.value) },
                          }),
                        )
                      }
                    >
                      {Array.from({ length: Math.max(10, line.quantity) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{pkr(line.subtotal)}</td>
                  <td>
                    <button
                      type="button"
                      className="link small"
                      disabled={busy}
                      onClick={() => void mutate(() => bff<Cart>(`/cart/items/${line.itemId}`, { method: 'DELETE' }))}
                    >
                      Remove<span className="visually-hidden"> {line.productName}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="panel stack" aria-label="Order summary">
        <h2>Summary</h2>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!code.trim()) return;
            if (await mutate(() => bff<Cart>('/cart/coupon', { body: { code: code.trim() } }))) setCode('');
          }}
        >
          {cart.coupon ? (
            <div className="spread">
              <span>
                Coupon <strong data-testid="applied-coupon">{cart.coupon.code}</strong>
              </span>
              <button
                type="button"
                className="link small"
                disabled={busy}
                onClick={() => void mutate(() => bff<Cart>('/cart/coupon', { method: 'DELETE' }))}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="coupon">Coupon code</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="coupon" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
                <button type="submit" className="secondary" disabled={busy}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </form>
        {cart.couponIssue ? <Notice tone="warn">{cart.couponIssue}</Notice> : null}
        <FormStatus error={error} />
        <table className="totals">
          <tbody>
            <tr>
              <td>Items ({cart.itemCount})</td>
              <td className="num">{pkr(cart.itemsTotal)}</td>
            </tr>
            {cart.discountTotal !== '0.00' ? (
              <tr>
                <td>Discount</td>
                <td className="num" data-testid="cart-discount">
                  − {pkr(cart.discountTotal)}
                </td>
              </tr>
            ) : null}
            <tr>
              <td>Delivery</td>
              <td className="num">{cart.coupon?.freeShipping ? 'Free' : 'At checkout'}</td>
            </tr>
          </tbody>
        </table>
        {blocked ? <Notice tone="error">Fix the highlighted items before checking out.</Notice> : null}
        {blocked ? (
          <button type="button" disabled>
            Proceed to checkout
          </button>
        ) : (
          <Link href="/checkout" className="button">
            Proceed to checkout
          </Link>
        )}
      </aside>
    </div>
  );
}
