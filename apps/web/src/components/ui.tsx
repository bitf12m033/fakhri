import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Availability as AvailabilityValue } from '@/lib/api/types';
import { AVAILABILITY, pkr, statusTone } from '@/lib/format';

/** Small presentational pieces shared by storefront and admin. Server-safe. */

export function Notice({
  tone = 'info',
  children,
  role,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'error';
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div className={`notice ${tone}`} role={role ?? (tone === 'error' ? 'alert' : undefined)}>
      {children}
    </div>
  );
}

export function AvailabilityBadge({ value }: { value: AvailabilityValue }) {
  const entry = AVAILABILITY[value];
  return <span className={`pill ${entry.tone}`}>{entry.label}</span>;
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`pill ${statusTone(status)}`}>{label ?? status.replaceAll('_', ' ').toLowerCase()}</span>;
}

export function Price({ value, was, large }: { value: string | null; was?: string | null; large?: boolean }) {
  return (
    <span>
      <span className={`price${large ? ' price-lg' : ''}`}>{pkr(value)}</span>
      {was && value && was !== value ? (
        <span className="price-was">
          <span className="visually-hidden">was </span>
          {pkr(was)}
        </span>
      ) : null}
    </span>
  );
}

export function Stars({ average, count }: { average: string | null; count: number }) {
  if (!average || count === 0) return <span className="muted small">No reviews yet</span>;
  const rounded = Math.round(Number(average));
  return (
    <span className="small">
      <span className="stars" aria-hidden="true">
        {'★'.repeat(rounded)}
        {'☆'.repeat(5 - rounded)}
      </span>{' '}
      <span>
        {average} out of 5 ({count} {count === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1 ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page links that keep the rest of the query string. */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = new Set([1, page - 1, page, page + 1, totalPages].filter((p) => p >= 1 && p <= totalPages));
  const ordered = [...pages].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Pages">
      {page > 1 ? <Link href={hrefFor(page - 1)}>Previous</Link> : null}
      {ordered.map((p, index) => (
        <span key={p} style={{ display: 'contents' }}>
          {index > 0 && p - ordered[index - 1]! > 1 ? <span aria-hidden="true">…</span> : null}
          {p === page ? (
            <span aria-current="page">{p}</span>
          ) : (
            <Link href={hrefFor(p)}>{p}</Link>
          )}
        </span>
      ))}
      {page < totalPages ? <Link href={hrefFor(page + 1)}>Next</Link> : null}
    </nav>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
