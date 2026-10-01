/**
 * Session cookies (increment 3.8). The API hands out bearer tokens in response
 * bodies (3.4); the storefront keeps them in httpOnly cookies so page script can
 * never read them, and the BFF attaches them server-side.
 */

export type SessionKind = 'customer' | 'admin';

export const COOKIE = {
  customerAccess: 'fk_at',
  customerRefresh: 'fk_rt',
  adminAccess: 'fk_admin_at',
  adminRefresh: 'fk_admin_rt',
  /** Guest cart token (`X-Cart-Token`). */
  cart: 'fk_cart',
  /** Recent guest orders as `{ ref, phone }`, the proof a guest has for tracking and paying. */
  guestOrders: 'fk_orders',
} as const;

export function sessionCookies(kind: SessionKind): { access: string; refresh: string } {
  return kind === 'admin'
    ? { access: COOKIE.adminAccess, refresh: COOKIE.adminRefresh }
    : { access: COOKIE.customerAccess, refresh: COOKIE.customerRefresh };
}

export interface TokenPair {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** The subset of Next's cookie stores these helpers write through. */
export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge?: number;
  expires?: Date;
}

/**
 * Lax rather than Strict so a customer following a link from WhatsApp arrives
 * signed in. Cross-site POSTs are refused by the BFF's own origin check instead.
 */
export function cookieOptions(extra: { maxAge?: number; expires?: Date } = {}): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...extra,
  };
}

export function writeSession(store: CookieWriter, kind: SessionKind, pair: TokenPair): void {
  const names = sessionCookies(kind);
  store.set(names.access, pair.accessToken, cookieOptions({ maxAge: pair.expiresIn }));
  store.set(names.refresh, pair.refreshToken, cookieOptions({ expires: new Date(pair.refreshExpiresAt) }));
}

export function clearSession(store: CookieWriter, kind: SessionKind): void {
  const names = sessionCookies(kind);
  store.set(names.access, '', cookieOptions({ maxAge: 0 }));
  store.set(names.refresh, '', cookieOptions({ maxAge: 0 }));
}

export function isTokenPair(value: unknown): value is TokenPair {
  const pair = value as Partial<TokenPair> | null;
  return typeof pair?.accessToken === 'string' && typeof pair.refreshToken === 'string';
}

// ------------------------------------------------------------------ guest orders

export interface GuestOrder {
  ref: string;
  phone: string;
}

const GUEST_ORDER_LIMIT = 5;
const GUEST_ORDER_DAYS = 30;

export function readGuestOrders(raw: string | undefined): GuestOrder[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is GuestOrder => typeof entry?.ref === 'string' && typeof entry?.phone === 'string')
      .slice(0, GUEST_ORDER_LIMIT);
  } catch {
    return [];
  }
}

export function rememberGuestOrder(store: CookieWriter, raw: string | undefined, order: GuestOrder): void {
  const orders = [order, ...readGuestOrders(raw).filter((entry) => entry.ref !== order.ref)].slice(
    0,
    GUEST_ORDER_LIMIT,
  );
  store.set(COOKIE.guestOrders, JSON.stringify(orders), cookieOptions({ maxAge: GUEST_ORDER_DAYS * 86_400 }));
}
