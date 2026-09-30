import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/generated/**',
      '**/.next/**',
      '**/coverage/**',
      '*.config.{js,mjs,cjs}',
      '.github/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // NestJS/nodes may log; structured logging is handled in api
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
    },
  },
);