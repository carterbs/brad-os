import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/functions/src/**/*.test.ts',
      'scripts/ralph/**/*.test.ts',
    ],
    exclude: ['packages/functions/src/__tests__/integration/**'],
    setupFiles: ['./packages/functions/src/__tests__/vitest.setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './packages/functions/coverage',
      include: ['packages/functions/src/**/*.ts'],
      exclude: [
        'packages/functions/src/**/*.test.ts',
        'packages/functions/src/**/*.spec.ts',
        'packages/functions/src/__tests__/**',
        'packages/functions/src/types/**',
        'packages/functions/src/**/index.ts',
      ],
    },
  },
});
