'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { DrainResult } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

function summary({ claimed, published, failed }: DrainResult): string {
  if (claimed === 0) return 'Nothing was waiting.';
  return `Claimed ${claimed}: ${published} delivered, ${failed} failed.`;
}

/** Drains one batch now instead of waiting for the poller. */
export function DispatchButton() {
  const action = useAction();
  const [result, setResult] = useState<DrainResult | null>(null);

  return (
    <div className="stack">
      <div>
        <button
          type="button"
          disabled={action.pending}
          data-testid="outbox-dispatch"
          onClick={async () => {
            setResult(null);
            const outcome = await action.run(() =>
              bff<DrainResult>('/admin/outbox/dispatch', { method: 'POST', body: {} }),
            );
            if (outcome) setResult(outcome.data);
          }}
        >
          {action.pending ? 'Dispatching…' : 'Dispatch now'}
        </button>
      </div>
      <FormStatus error={action.error} message={result ? summary(result) : null} />
    </div>
  );
}
