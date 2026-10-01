/**
 * The Playwright stack (increment 3.8): its own API and storefront ports, so a
 * developer's `npm run dev:*` servers keep running alongside. It shares the dev
 * database, like the API e2e suite, until testcontainers arrive in 3.9.
 */
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3101);
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** Test-only secrets, shared by the two servers so signatures verify. */
export const REVALIDATE_SECRET = 'e2e-revalidate-secret-0123456789abcdef';
export const PAYMENT_MOCK_SECRET = 'e2e-mock-gateway-secret-0000';

/** Seeded by apps/api/src/scripts/seed.ts. */
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Fakhri-dev-passw0rd';
export const ADMINS = {
  super: 'super@fakhri.test',
  catalog: 'catalog@fakhri.test',
  orders: 'orders@fakhri.test',
  marketing: 'marketing@fakhri.test',
} as const;

/** Seeded products the journeys buy. Their stock is topped up in global setup. */
export const PRODUCTS = {
  tv: 'orient-32-hd-led-tv',
  samsung: 'samsung-crystal-uhd-tv',
  ac: 'haier-hsu-18hfpaa-inverter-ac',
  gree: 'gree-gs-12pith-inverter-ac',
} as const;
