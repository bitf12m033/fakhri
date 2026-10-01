'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { setCartCount, useSession } from '@/components/shop/session-store';
import { EmptyState, Notice } from '@/components/ui';
import { bff, idempotencyKey } from '@/lib/api/client';
import { ApiError, messageOf } from '@/lib/api/errors';
import type { Address, Cart, DeliveryType, Order, PaymentMethod, PaymentSession } from '@/lib/api/types';
import { PAYMENT_METHOD, pkr, PROVINCES } from '@/lib/format';

interface Quote {
  itemsTotal: string;
  discountTotal: string;
  deliveryFee: string;
  taxTotal: string;
  grandTotal: string;
  freeShipping: boolean;
}

const METHODS: PaymentMethod[] = ['COD', 'JAZZCASH', 'EASYPAISA', 'CARD'];

const EMPTY_ADDRESS = {
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  area: '',
  addressLine: '',
  landmark: '',
};

/**
 * Guest and customer checkout (REQ-19/20/21). The total shown comes from the
 * API's quote, which prices the cart exactly as order placement will.
 */
export function CheckoutForm() {
  const router = useRouter();
  const session = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('HOME_DELIVERY');
  const [addressId, setAddressId] = useState<string>('new');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  /** One key per attempt: a retry after a dropped connection must not place a second order. */
  const attemptKey = useRef<string | null>(null);

  useEffect(() => {
    bff<Cart>('/cart')
      .then((result) => setCart(result.data))
      .catch((caught) => setError(messageOf(caught)));
  }, []);

  useEffect(() => {
    if (!session.signedIn) return;
    bff<Address[]>('/customers/me/addresses')
      .then((result) => {
        setAddresses(result.data);
        const preferred = result.data.find((entry) => entry.isDefault) ?? result.data[0];
        if (preferred) setAddressId(preferred.id);
      })
      .catch(() => undefined);
  }, [session.signedIn]);

  const saved = addresses.find((entry) => entry.id === addressId);
  const province = deliveryType === 'STORE_PICKUP' ? undefined : saved ? saved.province : address.province;

  useEffect(() => {
    if (!cart || cart.lines.length === 0) return;
    if (deliveryType === 'HOME_DELIVERY' && !province) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    bff<Quote>('/checkout/quote', {
      body: { deliveryType, ...(saved ? { addressId: saved.id } : province ? { province } : {}) },
    })
      .then((result) => {
        if (cancelled) return;
        setQuote(result.data);
        setQuoteError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(messageOf(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [cart, deliveryType, province, saved]);

  if (!cart) return error ? <Notice tone="error">{error}</Notice> : <p className="muted">Loading…</p>;
  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty">
        <p>
          <Link href="/">Continue shopping</Link>
        </p>
      </EmptyState>
    );
  }

  const field = (key: keyof typeof EMPTY_ADDRESS) => ({
    id: `address-${key}`,
    value: address[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setAddress({ ...address, [key]: event.target.value }),
  });

  async function place(event: React.FormEvent) {
    event.preventDefault();
    setPlacing(true);
    setError(null);
    attemptKey.current ??= idempotencyKey();
    const optional = (value: string) => (value.trim() ? value.trim() : undefined);
    const body = {
      deliveryType,
      paymentMethod,
      ...(deliveryType === 'HOME_DELIVERY'
        ? saved
          ? { addressId: saved.id }
          : {
              address: {
                recipientName: address.recipientName.trim(),
                phone: address.phone.trim(),
                province: address.province,
                city: address.city.trim(),
                area: optional(address.area),
                addressLine: address.addressLine.trim(),
                landmark: optional(address.landmark),
              },
            }
        : {}),
      ...(!session.signedIn ? { guestPhone: guestPhone.trim(), guestEmail: optional(guestEmail) } : {}),
      customerNote: optional(note),
    };

    let order: Order;
    try {
      order = (await bff<Order>('/checkout', { body, headers: { 'Idempotency-Key': attemptKey.current } })).data;
    } catch (caught) {
      // A refusal means the next attempt is a different request; a dropped connection does not.
      if (caught instanceof ApiError && caught.status > 0) attemptKey.current = null;
      setError(messageOf(caught));
      setPlacing(false);
      return;
    }
    setCartCount(0);

    if (order.payment && order.payment.method !== 'COD') {
      try {
        const payment = await bff<PaymentSession>(`/payments/${order.payment.id}/initiate`, {
          body: { refNumber: order.refNumber },
        });
        window.location.assign(payment.data.redirectUrl);
        return;
      } catch {
        // The order exists; the order page offers to retry the payment.
      }
    }
    router.push(`/orders/${encodeURIComponent(order.refNumber)}?placed=1`);
  }

  return (
    <form className="two-col" onSubmit={place} data-testid="checkout-form">
      <div className="stack">
        {!session.signedIn ? (
          <fieldset className="stack">
            <legend>Contact</legend>
            <p className="small muted" style={{ margin: 0 }}>
              Checking out as a guest. <Link href="/login?next=/checkout">Sign in</Link> to use saved addresses.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="guest-phone">Mobile number</label>
                <input
                  id="guest-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="0300 1234567"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
                <span className="hint">We call to confirm cash-on-delivery orders.</span>
              </div>
              <div className="field">
                <label htmlFor="guest-email">Email (optional)</label>
                <input
                  id="guest-email"
                  type="email"
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                />
              </div>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="stack">
          <legend>Delivery</legend>
          <div className="row">
            <label className="check">
              <input
                type="radio"
                name="delivery"
                checked={deliveryType === 'HOME_DELIVERY'}
                onChange={() => setDeliveryType('HOME_DELIVERY')}
              />
              Home delivery
            </label>
            <label className="check">
              <input
                type="radio"
                name="delivery"
                checked={deliveryType === 'STORE_PICKUP'}
                onChange={() => setDeliveryType('STORE_PICKUP')}
              />
              Store pickup, Lahore (free)
            </label>
          </div>

          {deliveryType === 'HOME_DELIVERY' ? (
            <>
              {addresses.length > 0 ? (
                <div className="field">
                  <label htmlFor="saved-address">Deliver to</label>
                  <select id="saved-address" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                    {addresses.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label ? `${entry.label}: ` : ''}
                        {entry.recipientName}, {entry.addressLine}, {entry.city}
                      </option>
                    ))}
                    <option value="new">A new address…</option>
                  </select>
                </div>
              ) : null}
              {!saved ? (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="address-recipientName">Recipient name</label>
                    <input {...field('recipientName')} autoComplete="name" required minLength={2} />
                  </div>
                  <div className="field">
                    <label htmlFor="address-phone">Recipient mobile</label>
                    <input {...field('phone')} type="tel" autoComplete="tel" required placeholder="0300 1234567" />
                  </div>
                  <div className="field">
                    <label htmlFor="address-province">Province</label>
                    <select {...field('province')} required>
                      <option value="">Choose…</option>
                      {PROVINCES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="address-city">City</label>
                    <input {...field('city')} autoComplete="address-level2" required minLength={2} />
                  </div>
                  <div className="field">
                    <label htmlFor="address-area">Area (optional)</label>
                    <input {...field('area')} autoComplete="address-level3" />
                  </div>
                  <div className="field wide">
                    <label htmlFor="address-addressLine">House, street and block</label>
                    <input {...field('addressLine')} autoComplete="street-address" required minLength={5} />
                  </div>
                  <div className="field wide">
                    <label htmlFor="address-landmark">Nearby landmark (optional)</label>
                    <input {...field('landmark')} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Collect from our Lahore warehouse once we call to say your order is packed.
            </p>
          )}
        </fieldset>

        <fieldset className="stack">
          <legend>Payment</legend>
          {METHODS.map((method) => (
            <label key={method} className="check">
              <input
                type="radio"
                name="payment"
                value={method}
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
              />
              {PAYMENT_METHOD[method]}
            </label>
          ))}
          {paymentMethod !== 'COD' ? (
            <p className="small muted" style={{ margin: 0 }}>
              You will be taken to the payment page after placing the order.
            </p>
          ) : null}
        </fieldset>

        <div className="field">
          <label htmlFor="note">Note for the delivery team (optional)</label>
          <textarea id="note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>

      <aside className="panel stack" aria-label="Order summary">
        <h2>Order summary</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="small">
          {cart.lines.map((line) => (
            <li key={line.itemId} className="spread">
              <span>
                {line.quantity} × {line.productName}
                {line.variantName ? ` (${line.variantName})` : ''}
              </span>
              <span>{pkr(line.subtotal)}</span>
            </li>
          ))}
        </ul>
        <table className="totals">
          <tbody>
            <tr>
              <td>Items</td>
              <td className="num">{pkr(quote?.itemsTotal ?? cart.itemsTotal)}</td>
            </tr>
            {(quote?.discountTotal ?? cart.discountTotal) !== '0.00' ? (
              <tr>
                <td>Discount{cart.coupon ? ` (${cart.coupon.code})` : ''}</td>
                <td className="num">− {pkr(quote?.discountTotal ?? cart.discountTotal)}</td>
              </tr>
            ) : null}
            <tr>
              <td>Delivery</td>
              <td className="num" data-testid="delivery-fee">
                {quote ? (quote.deliveryFee === '0.00' ? 'Free' : pkr(quote.deliveryFee)) : 'Choose a province'}
              </td>
            </tr>
            {quote && quote.taxTotal !== '0.00' ? (
              <tr>
                <td>Sales tax</td>
                <td className="num">{pkr(quote.taxTotal)}</td>
              </tr>
            ) : null}
            <tr className="grand">
              <td>Total</td>
              <td className="num" data-testid="checkout-total">
                {quote ? pkr(quote.grandTotal) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
        {quoteError ? <Notice tone="warn">{quoteError}</Notice> : null}
        <FormStatus error={error} />
        <button type="submit" disabled={placing || !quote}>
          {placing ? 'Placing order…' : paymentMethod === 'COD' ? 'Place order' : 'Place order and pay'}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          <Link href="/cart">Back to cart</Link>
        </p>
      </aside>
    </form>
  );
}
