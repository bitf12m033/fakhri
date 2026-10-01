'use client';

import Link from 'next/link';

/** A failed admin read: usually a 403 for the role, or a session that just expired. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="stack">
      <h1>Something went wrong</h1>
      <div className="notice error" role="alert">
        {error.message || 'This page could not be loaded.'}
      </div>
      <div className="row">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/admin/login">
          Sign in again
        </Link>
      </div>
    </div>
  );
}
