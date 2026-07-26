import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'integration',
      root: '.',
      environment: 'node',
      include: ['packages/functions/src/__tests__/integration/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      pool: 'threads',
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
    },
  },
]);
