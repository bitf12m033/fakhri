/** Public origin of the storefront, for canonical URLs, the sitemap and JSON-LD (REQ-10). */
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export const SITE_NAME = 'Fakhri';

export function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
