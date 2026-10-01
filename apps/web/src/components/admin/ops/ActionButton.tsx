'use client';

import { useRouter } from 'next/navigation';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/**
 * One-click BFF mutation (toggle, publish, delete, dispatch…) with an optional
 * confirm() and its own inline outcome, so a row of these can sit in a table.
 */
export function ActionButton({
  label,
  path,
  method = 'POST',
  body,
  confirm,
  success,
  redirectTo,
  variant,
  testId,
}: {
  label: string;
  path: string;
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  confirm?: string;
  success?: string;
  /** Where to go once it worked, e.g. back to the list after deleting from an edit page. */
  redirectTo?: string;
  variant?: 'secondary' | 'danger';
  testId?: string;
}) {
  const router = useRouter();
  const action = useAction();
  const className = ['small', variant].filter(Boolean).join(' ');

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem' }}>
      <button
        type="button"
        className={className}
        disabled={action.pending}
        data-testid={testId}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const result = await action.run(() => bff(path, { method, body: body ?? (method === 'DELETE' ? undefined : {}) }), {
            success,
            refresh: !redirectTo,
          });
          if (result !== undefined && redirectTo) {
            router.push(redirectTo);
            router.refresh();
          }
        }}
      >
        {action.pending ? 'Working…' : label}
      </button>
      {action.error ? <FormStatus error={action.error} /> : null}
      {action.message ? <FormStatus error={null} message={action.message} /> : null}
    </span>
  );
}
