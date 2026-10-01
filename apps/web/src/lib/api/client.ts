import { ApiError } from './errors';
import type { Envelope } from './types';

/**
 * Browser-side call through the BFF (`/bff/<api path>`). Cookies ride along
 * automatically; the `x-fakhri-bff` header is what the proxy's CSRF check wants.
 */
export async function bff<T, M = undefined>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Envelope<T, M>> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(`/bff${path}`, {
      method,
      headers: {
        'x-fakhri-bff': '1',
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline. Check your connection and try again.');
  }
  if (!response.ok) throw await ApiError.from(response);
  return (await response.json()) as Envelope<T, M>;
}

/** A fresh idempotency key for one checkout attempt (the API requires 8-200 chars). */
export function idempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}
