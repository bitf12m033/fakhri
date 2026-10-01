'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** Guest order lookup by reference + phone. The BFF remembers a match so the order page can load it. */
export function TrackForm({ initialRef = '' }: { initialRef?: string }) {
  const router = useRouter();
  const action = useAction();
  const [ref, setRef] = useState(initialRef);
  const [phone, setPhone] = useState('');

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const refNumber = ref.trim().toUpperCase();
        const found = await action.run(() => bff('/orders/lookup', { body: { refNumber, phone: phone.trim() } }), {
          refresh: false,
        });
        if (!found) return;
        router.push(`/orders/${encodeURIComponent(refNumber)}`);
        router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="track-ref">Order reference</label>
        <input
          id="track-ref"
          required
          placeholder="FK-260101-ABC123"
          value={ref}
          onChange={(event) => setRef(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="track-phone">Mobile number used for the order</label>
        <input
          id="track-phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="0300 1234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <FormStatus
        error={action.error === 'Order not found' ? 'We could not find an order with that reference and number.' : action.error}
      />
      <button type="submit" disabled={action.pending}>
        Track order
      </button>
    </form>
  );
}
