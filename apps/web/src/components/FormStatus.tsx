'use client';

/** Inline outcome of a form action; announced to screen readers. */
export function FormStatus({ error, message }: { error: string | null; message?: string | null }) {
  if (error) {
    return (
      <div className="notice error" role="alert">
        {error}
      </div>
    );
  }
  if (message) {
    return (
      <div className="notice ok" role="status">
        {message}
      </div>
    );
  }
  return null;
}
