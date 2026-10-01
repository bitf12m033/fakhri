'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageOf } from '@/lib/api/errors';

/**
 * Runs a BFF mutation with pending/error/success state, then re-renders the
 * server components on the page so they show the new state. The one pattern
 * every form in the storefront and admin uses.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run<T>(
    action: () => Promise<T>,
    options: { success?: string; refresh?: boolean } = {},
  ): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (options.success) setMessage(options.success);
      if (options.refresh !== false) router.refresh();
      return result;
    } catch (caught) {
      setError(messageOf(caught));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error, message, setError };
}
