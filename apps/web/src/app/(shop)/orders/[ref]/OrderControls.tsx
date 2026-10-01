'use client';

import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { PaymentSession } from '@/lib/api/types';

/** Retry an unpaid online payment, or cancel an order that is still only placed (REQ-21/24). */
export function OrderControls({
  refNumber,
  paymentId,
  canCancel,
}: {
  refNumber: string;
  paymentId: string | null;
  canCancel: boolean;
}) {
  const action = useAction();
  if (!paymentId && !canCancel) return null;
  return (
    <div className="stack">
      <div className="row">
        {paymentId ? (
          <button
            type="button"
            disabled={action.pending}
            onClick={async () => {
              const session = await action.run(
                () => bff<PaymentSession>(`/payments/${paymentId}/initiate`, { body: { refNumber } }),
                { refresh: false },
              );
              if (session) window.location.assign(session.data.redirectUrl);
            }}
          >
            Pay now
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className="danger"
            disabled={action.pending}
            onClick={() => {
              if (!window.confirm(`Cancel order ${refNumber}?`)) return;
              void action.run(
                () => bff(`/customers/me/orders/${encodeURIComponent(refNumber)}/cancel`, { body: {} }),
                { success: 'Your order has been cancelled.' },
              );
            }}
          >
            Cancel order
          </button>
        ) : null}
      </div>
      <FormStatus error={action.error} message={action.message} />
    </div>
  );
}
