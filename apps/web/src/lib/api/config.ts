/**
 * Where the storefront server reaches the API. The browser never calls the API
 * directly: everything session-bound goes through the /bff proxy, so tokens stay
 * in httpOnly cookies (increment 3.8).
 */
export const API_ORIGIN = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api/v1`;

/** Default ISR window for public reads; tag revalidation normally beats it. */
export const PUBLIC_REVALIDATE_SECONDS = 60;
