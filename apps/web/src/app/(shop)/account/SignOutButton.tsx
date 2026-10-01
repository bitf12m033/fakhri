'use client';

import { useRouter } from 'next/navigation';
import { reloadSession } from '@/components/shop/session-store';
import { bff } from '@/lib/api/client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link"
      onClick={async () => {
        await bff('/auth/customer/logout', { body: {} }).catch(() => undefined);
        await reloadSession();
        router.replace('/');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
