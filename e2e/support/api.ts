import { ADMIN_PASSWORD, API_URL } from './env';

/**
 * Direct API calls for arranging state the journey under test is not about
 * (logging an admin in to approve a review, topping up stock). The journeys
 * themselves always drive the browser.
 */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${payload.error?.message}`);
  return payload.data as T;
}

export async function adminToken(email: string): Promise<string> {
  const pair = await api<{ accessToken: string }>('/admin/auth/login', { body: { email, password: ADMIN_PASSWORD } });
  return pair.accessToken;
}

/** A fresh Pakistani mobile number per call, so journeys never collide across runs. */
export function uniquePhone(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `03${digits}`;
}

export async function variantsOf(slug: string): Promise<{ id: string; sku: string; price: string | null }[]> {
  const product = await api<{ variants: { id: string; sku: string; price: string | null }[] }>(`/products/${slug}`);
  return product.variants;
}
