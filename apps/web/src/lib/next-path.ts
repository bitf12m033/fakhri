/** A post-sign-in destination from the query string. Same-site paths only: `next` is user input. */
export function safeNext(next: string | undefined, fallback = '/account'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/admin')) return fallback;
  return next;
}
