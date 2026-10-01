'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SortKey } from '@/lib/api/types';

export function SortSelect({ value, options }: { value: SortKey; options: { value: SortKey; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="row">
      <label htmlFor="sort">Sort by</label>
      <select
        id="sort"
        value={value}
        style={{ width: 'auto' }}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          next.set('sort', event.target.value);
          next.delete('page');
          router.push(`${pathname}?${next}`);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
