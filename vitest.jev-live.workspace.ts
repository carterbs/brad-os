import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([{
  test: {
    name: 'jev-live',
    root: '.',
    include: ['packages/functions/src/__tests__/live/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['packages/functions/src/__tests__/supertest-loopback.setup.ts'],
    testTimeout: 180000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
}]);
