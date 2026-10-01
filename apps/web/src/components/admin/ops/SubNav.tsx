import Link from 'next/link';

/** Links between the screens of one admin section (e.g. stock / ledger / warehouses). */
export function SubNav({ links, current }: { links: { href: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Section" className="row small">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`button small${link.href === current ? '' : ' secondary'}`}
          aria-current={link.href === current ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
