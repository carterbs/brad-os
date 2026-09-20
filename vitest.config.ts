import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/functions/src/**/*.test.ts',
    ],
    exclude: ['packages/functions/src/__tests__/integration/**', 'packages/functions/src/__tests__/live/**'],
    setupFiles: ['./packages/functions/src/__tests__/vitest.setup.ts'],
    globals: true,
  },
});
