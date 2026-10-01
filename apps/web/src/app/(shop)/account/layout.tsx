import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

export const metadata = { title: { default: 'My account', template: '%s | My account' }, robots: { index: false } };

/** Middleware sends anonymous visitors to /login before anything here renders. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sidebar-layout">
      <nav className="panel" aria-label="Account">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
          <li>
            <Link href="/account">Profile</Link>
          </li>
          <li>
            <Link href="/account/orders">Orders</Link>
          </li>
          <li>
            <Link href="/account/addresses">Addresses</Link>
          </li>
          <li>
            <Link href="/account/wishlist">Wishlist</Link>
          </li>
          <li>
            <SignOutButton />
          </li>
        </ul>
      </nav>
      <div className="stack">{children}</div>
    </div>
  );
}
