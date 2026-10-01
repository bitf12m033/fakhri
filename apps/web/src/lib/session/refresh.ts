import { createHash } from 'node:crypto';
import { API_BASE } from '../api/config';
import { isTokenPair, SessionKind, TokenPair } from './cookies';

export type RefreshOutcome =
  | { ok: true; pair: TokenPair }
  /** The API refused the token: the session is over, clear it. */
  | { ok: false; reason: 'invalid' }
  /** The API could not be reached: keep the cookies and try again next request. */
  | { ok: false; reason: 'unavailable' };

/**
 * How long a settled rotation is shared with late arrivals. A page load fires
 * several requests at once, each carrying the same refresh cookie, and the API
 * treats a second use of a rotated token as theft and revokes the whole family
 * (3.4). So one rotation per token, and everyone presenting it gets its result.
 */
const SHARE_WINDOW_MS = 30_000;

const rotations = new Map<string, { outcome: Promise<RefreshOutcome>; settledAt?: number }>();

/**
 * Single-flight per process. The deployment is one storefront instance (DEC-09);
 * scaling out needs this in Redis, or sticky sessions.
 */
export function refreshOnce(
  kind: SessionKind,
  refreshToken: string,
  forwardedFor: string | null,
): Promise<RefreshOutcome> {
  const now = Date.now();
  for (const [key, entry] of rotations) {
    if (entry.settledAt !== undefined && now - entry.settledAt > SHARE_WINDOW_MS) rotations.delete(key);
  }

  const key = `${kind}:${createHash('sha256').update(refreshToken).digest('hex')}`;
  const existing = rotations.get(key);
  if (existing) return existing.outcome;

  const entry: { outcome: Promise<RefreshOutcome>; settledAt?: number } = {
    outcome: rotate(kind, refreshToken, forwardedFor).then((outcome) => {
      entry.settledAt = Date.now();
      // Only share successes and definite refusals; a network blip should retry.
      if (!outcome.ok && outcome.reason === 'unavailable') rotations.delete(key);
      return outcome;
    }),
  };
  rotations.set(key, entry);
  return entry.outcome;
}

async function rotate(kind: SessionKind, refreshToken: string, forwardedFor: string | null): Promise<RefreshOutcome> {
  const path = kind === 'admin' ? '/admin/auth/refresh' : '/auth/customer/refresh';
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 400) return { ok: false, reason: 'invalid' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const body = (await response.json()) as { data?: unknown };
    return isTokenPair(body.data) ? { ok: true, pair: body.data } : { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
