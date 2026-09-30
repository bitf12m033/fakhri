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
    testTimeout: 20_000,
    hookTimeout: 120_000,
    // Four files at a time keeps total database connections inside max_connections.
    poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
  },
});