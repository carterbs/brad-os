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
  },
});
