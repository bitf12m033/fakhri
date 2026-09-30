/**
 * Shared test environment (increment 3.5).
 *
 * Each spec file boots its own Nest app, so each gets its own Prisma pool. The
 * default pool is cpus*2+1, which across parallel files exceeds Postgres's
 * max_connections and shows up as unrelated 5s timeouts. Capping the pool here,
 * together with the thread cap in vitest.config.ts, keeps the total well under it.
 */
process.env.NODE_ENV ??= 'test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.DATABASE_URL ??=
  'postgresql://fakhri:fakhri_dev@localhost:5432/fakhri?connection_limit=5&pool_timeout=20';
