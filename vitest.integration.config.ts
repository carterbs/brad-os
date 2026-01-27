import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/functions/src/__tests__/integration/**/*.test.ts'],
    testTimeout: 30000, // Integration tests may be slower
    hookTimeout: 30000,
    // Run tests sequentially to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
