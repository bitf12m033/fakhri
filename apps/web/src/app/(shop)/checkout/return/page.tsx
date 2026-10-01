import { createHmac } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice } from '@/components/ui';
import { API_BASE } from '@/lib/api/config';
import { pkr } from '@/lib/format';

export const metadata = { title: 'Payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Search = { ref?: string; order?: string; amount?: string };

/**
 * Where the mock gateway sends the buyer (PAYMENT_RETURN_URL, increment 3.6).
 *
 * A real provider hosts its own payment page and calls our webhook itself. The
 * mock has neither, so in development this page stands in for both: it shows a
 * pay/decline choice and posts the signed callback a provider would. It exists
 * only while PAYMENT_MOCK_SECRET is configured for the storefront; production
 * must not set it.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ref, order, amount } = await searchParams;
  const mockEnabled = Boolean(process.env.PAYMENT_MOCK_SECRET);

  if (!ref || !order || !amount) {
    return <Notice tone="error">This payment link is incomplete.</Notice>;
  }
  if (!mockEnabled) {
    return (
      <div className="stack">
        <h1>Payment received?</h1>
        <p>
          Your payment is being confirmed. <Link href={`/orders/${encodeURIComponent(order)}`}>View your order</Link>.
        </p>
      </div>
    );
  }

  async function settle(formData: FormData) {
    'use server';
    const outcome = formData.get('outcome') === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
    const secret = process.env.PAYMENT_MOCK_SECRET;
    if (!secret || !ref || !amount || !order) return;
    const body = JSON.stringify({ ref, status: outcome, amount });
    await fetch(`${API_BASE}/payments/webhook/mock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': createHmac('sha256', secret).update(body).digest('hex'),
      },
      body,
      cache: 'no-store',
    });
    redirect(`/orders/${encodeURIComponent(order)}?payment=${outcome.toLowerCase()}`);
  }

  return (
    <div className="panel stack" style={{ maxWidth: 480, margin: '0 auto' }}>
      <p className="pill warn" style={{ alignSelf: 'start' }}>
        Test payment gateway
      </p>
      <h1>Pay {pkr(amount)}</h1>
      <p style={{ margin: 0 }}>
        Order <strong>{order}</strong> · reference {ref}
      </p>
      <form action={settle} className="row">
        <button type="submit" name="outcome" value="SUCCEEDED">
          Pay now
        </button>
        <button type="submit" name="outcome" value="FAILED" className="danger">
          Decline
        </button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>
        No money moves: this page signs the callback a real provider would send.
      </p>
    </div>
  );
}
