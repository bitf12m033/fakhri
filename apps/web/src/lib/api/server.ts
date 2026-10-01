import { cookies, headers } from 'next/headers';
import { API_BASE, PUBLIC_REVALIDATE_SECONDS } from './config';
import { ApiError } from './errors';
import type { Envelope } from './types';
import { COOKIE, SessionKind, sessionCookies } from '../session/cookies';

interface PublicOptions {
  /** Cache tags for on-demand revalidation (see ./tags.ts). */
  tags?: string[];
  revalidate?: number;
}

interface SessionOptions {
  session: SessionKind;
  method?: string;
  body?: unknown;
}

/**
 * Cached public read for server components (REQ-10: ISR). Never touches cookies,
 * so pages built only from these stay statically renderable.
 */
export async function publicApi<T, M = undefined>(path: string, options: PublicOptions = {}): Promise<Envelope<T, M>> {
  return request<T, M>(path, {
    next: { revalidate: options.revalidate ?? PUBLIC_REVALIDATE_SECONDS, tags: options.tags },
  });
}

/** Like publicApi, but a 404 is `null` so the page can call notFound(). */
export async function publicApiOrNull<T, M = undefined>(
  path: string,
  options: PublicOptions = {},
): Promise<Envelope<T, M> | null> {
  try {
    return await publicApi<T, M>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Per-user read for server components. Reads cookies, so the page renders
 * dynamically. Middleware has already refreshed the token when it was stale.
 */
export async function sessionApi<T, M = undefined>(path: string, options: SessionOptions): Promise<Envelope<T, M>> {
  const jar = await cookies();
  const incoming = await headers();
  const token = jar.get(sessionCookies(options.session).access)?.value;
  const cartToken = options.session === 'customer' ? jar.get(COOKIE.cart)?.value : undefined;
  const forwardedFor = incoming.get('x-forwarded-for');
  return request<T, M>(path, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cartToken ? { 'x-cart-token': cartToken } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function sessionApiOrNull<T, M = undefined>(
  path: string,
  options: SessionOptions,
): Promise<Envelope<T, M> | null> {
  try {
    return await sessionApi<T, M>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function request<T, M>(path: string, init: RequestInit): Promise<Envelope<T, M>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(503, 'NETWORK', 'The shop is temporarily unreachable.');
  }
  if (!response.ok) throw await ApiError.from(response);
  return (await response.json()) as Envelope<T, M>;
}
