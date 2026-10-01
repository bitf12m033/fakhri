'use client';

import { useRouter } from 'next/navigation';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** Confirmed DELETE through the BFF; goes to `redirectTo` afterwards, or refreshes in place. */
export function DeleteButton({
  path,
  confirmText,
  label = 'Delete',
  redirectTo,
  small,
}: {
  path: string;
  confirmText: string;
  label?: string;
  redirectTo?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const action = useAction();

  const remove = async () => {
    if (!window.confirm(confirmText)) return;
    const done = await action.run(() => bff(path, { method: 'DELETE' }), { refresh: !redirectTo });
    if (done && redirectTo) {
      router.push(redirectTo);
      router.refresh();
    }
  };

  return (
    <div className="stack">
      <FormStatus error={action.error} />
      <div>
        <button
          type="button"
          className={small ? 'danger small' : 'danger'}
          disabled={action.pending}
          onClick={() => void remove()}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
