import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api/config';
import {
  clearSession,
  COOKIE,
  cookieOptions,
  isTokenPair,
  readGuestOrders,
  rememberGuestOrder,
  SessionKind,
  sessionCookies,
  writeSession,
} from '@/lib/session/cookies';

/**
 * Backend-for-frontend proxy (increment 3.8). Browser code calls `/bff/<api path>`
 * and this handler forwards to `/api/v1/<api path>`, attaching the bearer token
 * and cart token from httpOnly cookies. Token-bearing responses are turned into
 * cookies here, so no token ever reaches page script.
 *
 * CSRF: session cookies are SameSite=Lax, and every non-GET must carry the
 * `x-fakhri-bff` header (which a cross-site form cannot set, and a cross-site
 * fetch cannot set without a preflight this route never answers) and, when the
 * browser sends one, an Origin matching this host.
 */
export const dynamic = 'force-dynamic';

const BFF_HEADER = 'x-fakhri-bff';

/** API routes that answer with a token pair, and whose session they start. */
const ISSUES_TOKENS: Record<string, SessionKind> = {
  'auth/customer/login': 'customer',
  'auth/customer/register': 'customer',
  'auth/customer/otp/verify': 'customer',
  'customers/me/password': 'customer',
  'admin/auth/login': 'admin',
};

const LOGOUT: Record<string, SessionKind> = {
  'auth/customer/logout': 'customer',
  'admin/auth/logout': 'admin',
};

/** Rotation happens in middleware only; letting page script do it would race it. */
const BLOCKED = new Set(['auth/customer/refresh', 'admin/auth/refresh']);

/** Request headers worth passing on. Everything else (cookies above all) stays here. */
const FORWARDED_HEADERS = ['content-type', 'accept', 'idempotency-key', 'user-agent', 'x-request-id'];

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  const segments = (await context.params).path;
  // A decoded `..` would let the URL resolve outside /api/v1.
  if (segments.some((segment) => segment === '.' || segment === '..')) return error(404, 'NOT_FOUND', 'Not found');
  const path = segments.map(encodeURIComponent).join('/');
  const method = request.method.toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    const refusal = csrfRefusal(request);
    if (refusal) return refusal;
  }
  if (BLOCKED.has(path)) return error(404, 'NOT_FOUND', 'Not found');

  const jar = await cookies();
  const kind: SessionKind = path.startsWith('admin/') ? 'admin' : 'customer';
  const names = sessionCookies(kind);
  const accessToken = jar.get(names.access)?.value;
  const customerSignedIn = Boolean(jar.get(COOKIE.customerAccess)?.value);

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const cartToken = jar.get(COOKIE.cart)?.value;
  if (cartToken && kind === 'customer') headers.set('x-cart-token', cartToken);

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text();
    body = rewriteBody(path, body, jar.get(COOKIE.guestOrders)?.value, customerSignedIn);
    if (LOGOUT[path]) {
      body = JSON.stringify({ refreshToken: jar.get(sessionCookies(LOGOUT[path]).refresh)?.value ?? '' });
      headers.set('content-type', 'application/json');
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/${path}${request.nextUrl.search}`, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return error(502, 'INTERNAL', 'The shop is temporarily unreachable. Please try again.');
  }

  const logoutKind = LOGOUT[path];
  if (logoutKind) {
    // Signed out locally whatever the API said: the user asked to leave.
    const response = NextResponse.json({ data: { ok: true } });
    clearSession(response.cookies, logoutKind);
    if (logoutKind === 'customer') response.cookies.set(COOKIE.cart, '', cookieOptions({ maxAge: 0 }));
    return response;
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // CSV exports and the like: stream through with their download headers.
    const passthrough = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'content-disposition']) {
      const value = upstream.headers.get(name);
      if (value) passthrough.headers.set(name, value);
    }
    return passthrough;
  }

  const payload = (await upstream.json().catch(() => ({}))) as { data?: unknown; meta?: unknown };
  if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });

  const issued = ISSUES_TOKENS[path];
  if (issued && isTokenPair(payload.data)) {
    const response = NextResponse.json({ data: { signedIn: true } }, { status: upstream.status });
    writeSession(response.cookies, issued, payload.data);
    return response;
  }

  // Read the cart token before it is stripped: page script must never see it.
  const cartTokenIssued = isCartPath(path) ? takeCartToken(payload) : undefined;
  const response = NextResponse.json(payload, { status: upstream.status });
  afterSuccess(path, method, payload, body, response, {
    guestOrdersRaw: jar.get(COOKIE.guestOrders)?.value,
    customerSignedIn,
    cartTokenIssued,
  });
  return response;
}

/** Cookie side effects of successful calls. */
function afterSuccess(
  path: string,
  method: string,
  payload: { data?: unknown },
  requestBody: string | undefined,
  response: NextResponse,
  context: { guestOrdersRaw: string | undefined; customerSignedIn: boolean; cartTokenIssued: string | null | undefined },
): void {
  const { guestOrdersRaw, customerSignedIn } = context;
  if (isCartPath(path)) {
    if (context.cartTokenIssued) {
      response.cookies.set(COOKIE.cart, context.cartTokenIssued, cookieOptions({ maxAge: 30 * 86_400 }));
    } else if (customerSignedIn) {
      // The guest cart was adopted into the customer's: the token is spent.
      response.cookies.set(COOKIE.cart, '', cookieOptions({ maxAge: 0 }));
    }
    return;
  }

  if (path === 'checkout' && method === 'POST') {
    response.cookies.set(COOKIE.cart, '', cookieOptions({ maxAge: 0 }));
    const order = payload.data as { refNumber?: string } | undefined;
    const phone = parse(requestBody)?.guestPhone;
    if (!customerSignedIn && order?.refNumber && typeof phone === 'string') {
      rememberGuestOrder(response.cookies, guestOrdersRaw, { ref: order.refNumber, phone });
    }
    return;
  }

  if (path === 'orders/lookup') {
    const lookup = parse(requestBody);
    if (typeof lookup?.refNumber === 'string' && typeof lookup.phone === 'string') {
      rememberGuestOrder(response.cookies, guestOrdersRaw, { ref: lookup.refNumber.trim(), phone: lookup.phone });
    }
  }
}

function isCartPath(path: string): boolean {
  return path === 'cart' || path.startsWith('cart/');
}

/** Removes the cart token from a cart response and returns it. */
function takeCartToken(payload: { data?: unknown }): string | null {
  const cart = payload.data as { token?: string | null } | undefined;
  if (!cart || !('token' in cart)) return null;
  const token = cart.token ?? null;
  delete cart.token;
  return token;
}

/**
 * A guest proves ownership of an order with its reference plus phone. The phone
 * sits in an httpOnly cookie, so the BFF fills it in rather than page script.
 */
function rewriteBody(path: string, body: string, guestOrdersRaw: string | undefined, customerSignedIn: boolean): string {
  if (customerSignedIn || !/^payments\/[^/]+\/initiate$/.test(path)) return body;
  const parsed = parse(body) ?? {};
  const ref = typeof parsed.refNumber === 'string' ? parsed.refNumber : undefined;
  const known = readGuestOrders(guestOrdersRaw).find((entry) => entry.ref === ref);
  if (!known || typeof parsed.guestPhone === 'string') return body;
  return JSON.stringify({ ...parsed, guestPhone: known.phone });
}

function csrfRefusal(request: NextRequest): NextResponse | null {
  if (request.headers.get(BFF_HEADER) !== '1') {
    return error(403, 'FORBIDDEN', 'Missing request header');
  }
  const origin = request.headers.get('origin');
  if (origin) {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) return error(403, 'FORBIDDEN', 'Cross-site request refused');
  }
  return null;
}

function parse(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const value = JSON.parse(body) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function error(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
