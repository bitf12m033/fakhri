'use client';

import Link from 'next/link';
import { useSession } from './session-store';

export function HeaderLinks() {
  const session = useSession();
  return (
    <nav className="header-links" aria-label="Account">
      <Link href="/track">Track order</Link>
      {session.signedIn ? <Link href="/account">My account</Link> : <Link href="/login">Sign in</Link>}
      <Link href="/cart" data-testid="cart-link">
        Cart
        <span className="badge-count" aria-label={`${session.cartCount} items in cart`} data-testid="cart-count">
          {session.cartCount}
        </span>
      </Link>
    </nav>
  );
}
