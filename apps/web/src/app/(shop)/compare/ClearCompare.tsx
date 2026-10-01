'use client';

import { useRouter } from 'next/navigation';
import { useCompare } from '@/components/shop/compare-store';

export function ClearCompare() {
  const compare = useCompare();
  const router = useRouter();
  return (
    <button
      type="button"
      className="secondary small"
      onClick={() => {
        compare.clear();
        router.push('/');
      }}
    >
      Clear comparison
    </button>
  );
}
