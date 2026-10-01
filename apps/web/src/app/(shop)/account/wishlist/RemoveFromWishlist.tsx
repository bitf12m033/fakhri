'use client';

import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

export function RemoveFromWishlist({ variantId }: { variantId: string }) {
  const action = useAction();
  return (
    <button
      type="button"
      className="link small"
      disabled={action.pending}
      onClick={() => void action.run(() => bff(`/customers/me/wishlist/${variantId}`, { method: 'DELETE' }))}
    >
      Remove
    </button>
  );
}
