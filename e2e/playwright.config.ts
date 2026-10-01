import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, PAYMENT_MOCK_SECRET, REVALIDATE_SECRET, WEB_PORT, WEB_URL } from './support/env';

const root = path.resolve(__dirname, '..');

/**
 * Critical journeys against a live API + production storefront build
 * (docs/aidlc/05-testing-cicd.md §1, REQ-42). Run with `npm run e2e`.
 *
 * Serial on purpose: the journeys share one database and real stock levels.
 */
export default defineConfig({
  testDir: './journeys',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-PK',
    timezoneId: 'Asia/Karachi',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      // Seed first so the catalog exists before the storefront prerenders it.
      command:
        'npm run build -w apps/api && cd apps/api && node --env-file-if-exists=.env dist/scripts/seed.js && node --env-file-if-exists=.env dist/main.js',
      cwd: root,
      url: `${API_URL}/health`,
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        TRUST_PROXY: 'loopback',
        CORS_ORIGIN: WEB_URL,
        OUTBOX_POLL_MS: '500',
        PAYMENT_MOCK_SECRET,
        PAYMENT_RETURN_URL: `${WEB_URL}/checkout/return`,
        WEB_REVALIDATE_URL: `${WEB_URL}/internal/revalidate`,
        WEB_REVALIDATE_SECRET: REVALIDATE_SECRET,
        SEED_MEDIA_BASE_URL: `${WEB_URL}/media`,
      },
    },
    {
      command: `node e2e/support/wait-for.mjs ${API_URL}/health && npm run build -w apps/web && npm run start -w apps/web -- -p ${WEB_PORT}`,
      cwd: root,
      url: `${WEB_URL}/robots.txt`,
      timeout: 420_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_DIST_DIR: '.next-e2e',
        API_URL,
        SITE_URL: WEB_URL,
        REVALIDATE_SECRET,
        PAYMENT_MOCK_SECRET,
      },
    },
  ],
});
