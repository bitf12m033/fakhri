import { NextRequest, NextResponse } from 'next/server';
import { clearSession, SessionKind, sessionCookies, writeSession } from './lib/session/cookies';
import { isFresh } from './lib/session/jwt';
import { refreshOnce } from './lib/session/refresh';

/**
 * Keeps sessions alive and gates signed-in areas (increment 3.8).
 *
 * Server components cannot set cookies, so token rotation has to happen here,
 * before rendering: a stale access token is exchanged for a fresh pair, the new
 * cookies go to the browser, and the same values are written into this request
 * so the page and the BFF see them immediately.
 *
 * Node runtime, not edge: the single-flight rotation map lives in process memory.
 */
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|media/|favicon.ico|robots.txt|sitemap.xml|internal/).*)'],
};

const KINDS: SessionKind[] = ['customer', 'admin'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const writes: { kind: SessionKind; apply: (response: NextResponse) => void }[] = [];

  for (const kind of KINDS) {
    const names = sessionCookies(kind);
    const access = request.cookies.get(names.access)?.value;
    const refresh = request.cookies.get(names.refresh)?.value;
    if (!refresh || isFresh(access)) continue;

    const outcome = await refreshOnce(kind, refresh, forwardedFor);
    if (outcome.ok) {
      request.cookies.set(names.access, outcome.pair.accessToken);
      request.cookies.set(names.refresh, outcome.pair.refreshToken);
      writes.push({ kind, apply: (response) => writeSession(response.cookies, kind, outcome.pair) });
    } else if (outcome.reason === 'invalid') {
      request.cookies.delete(names.access);
      request.cookies.delete(names.refresh);
      writes.push({ kind, apply: (response) => clearSession(response.cookies, kind) });
    }
  }

  const redirect = gate(request);
  const response = redirect ?? NextResponse.next({ request: { headers: request.headers } });
  for (const write of writes) write.apply(response);
  return response;
}

function gate(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const signedIn = (kind: SessionKind) => isFresh(request.cookies.get(sessionCookies(kind).access)?.value, 0);

  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !signedIn('admin')) {
    return redirectTo(request, '/admin/login', pathname + search);
  }
  if (pathname.startsWith('/account') && !signedIn('customer')) {
    return redirectTo(request, '/login', pathname + search);
  }
  return null;
}

function redirectTo(request: NextRequest, path: string, next: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}
