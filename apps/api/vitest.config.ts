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
  },
});