import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    workspace: './vitest.jev-live.workspace.ts',
    include: ['packages/functions/src/__tests__/live/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['packages/functions/src/__tests__/supertest-loopback.setup.ts'],
    testTimeout: 180000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
  },
});
