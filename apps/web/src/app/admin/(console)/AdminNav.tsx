'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { bff } from '@/lib/api/client';

export function AdminNav({ links, role }: { links: { href: string; label: string }[]; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className="admin-nav" aria-label="Admin">
      <Link href="/admin" className="logo">
        Fakhri admin
      </Link>
      <p className="small" style={{ margin: '0.25rem 0 0', color: '#aeb8c2' }}>
        Signed in as {role.replaceAll('_', ' ').toLowerCase()}
      </p>
      <ul>
        <li>
          <Link href="/admin" aria-current={pathname === '/admin' ? 'page' : undefined}>
            Dashboard
          </Link>
        </li>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={pathname.startsWith(link.href) ? 'page' : undefined}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="secondary small"
        onClick={async () => {
          await bff('/admin/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
          router.replace('/admin/login');
          router.refresh();
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
