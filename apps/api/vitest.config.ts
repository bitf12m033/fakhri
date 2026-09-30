import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * NestJS DI relies on design:type decorator metadata, which esbuild (vitest default)
 * does not emit. SWC emits it, so injectable classes resolve in tests.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
    // e2e specs contend on row locks and run argon2 hashes; 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    /*
     * One spec file at a time. These are integration tests against a single
     * Postgres and Redis: the oversell suite creates lock contention on purpose,
     * and specs assert on shared rate-limit state. Running them concurrently
     * produced timeouts and cross-file interference in specs that were not even
     * under test. Sequential costs a few seconds of wall clock and buys a suite
     * whose result means something.
     */
    fileParallelism: false,
    /*
     * Forks, not threads: each spec file boots a Nest app with its own database
     * pool, Redis client and timers. In a shared worker thread, teardown from one
     * file could still be settling while the next file ran, which showed up as
     * impossible results (a 404 from a route that exists). A process per file
     * makes teardown absolute.
     */
    pool: 'forks',
    poolOptions: { forks: { maxForks: 1, minForks: 1 } },
  },
});