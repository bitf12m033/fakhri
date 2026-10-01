import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api/config';
import { COOKIE, cookieOptions } from '@/lib/session/cookies';
import { isFresh } from '@/lib/session/jwt';

/**
 * Who is here and what is in their cart, for the header (increment 3.8).
 * Fetched from the browser so that public pages never read cookies while
 * rendering and stay cacheable (REQ-10).
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const jar = await cookies();
  const access = jar.get(COOKIE.customerAccess)?.value;
  const cartToken = jar.get(COOKIE.cart)?.value;
  const signedIn = isFresh(access, 0);

  let cartCount = 0;
  let spentCartToken = false;
  if (signedIn || cartToken) {
    const forwardedFor = (await headers()).get('x-forwarded-for');
    try {
      const response = await fetch(`${API_BASE}/cart`, {
        cache: 'no-store',
        headers: {
          ...(signedIn && access ? { authorization: `Bearer ${access}` } : {}),
          ...(cartToken ? { 'x-cart-token': cartToken } : {}),
          ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        },
      });
      if (response.ok) {
        const body = (await response.json()) as { data: { itemCount: number; token: string | null } };
        cartCount = body.data.itemCount;
        spentCartToken = signedIn && Boolean(cartToken) && !body.data.token;
      }
    } catch {
      // The badge is decorative; an unreachable API shows an empty cart.
    }
  }

  const response = NextResponse.json({ data: { signedIn, cartCount } });
  response.headers.set('cache-control', 'no-store');
  if (spentCartToken) response.cookies.set(COOKIE.cart, '', cookieOptions({ maxAge: 0 }));
  return response;
}
