/**
 * Shared test environment (increment 3.5, retuned in 3.6).
 *
 * Every spec file boots its own Nest app, so each gets its own Prisma pool. The
 * balance that matters: enough connections per file for the oversell suite, which
 * fires a dozen concurrent checkouts, while the total across files stays inside
 * Postgres's max_connections (100 here). Paired with the thread cap in
 * vitest.config.ts: 2 files x 10 connections.
 */
process.env.NODE_ENV ??= 'test';
// Specs drain the outbox on demand; a background poller would race their assertions.
process.env.OUTBOX_POLL_MS ??= '0';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.DATABASE_URL ??=
  'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri?connection_limit=10&pool_timeout=30';
