import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'functions',
      root: './packages/functions',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/__tests__/integration/**'],
      setupFiles: ['./src/__tests__/vitest.setup.ts'],
      globals: true,
      pool: 'threads',
      maxWorkers: 12,
    },
  },
  {
    test: {
      name: 'scripts',
      root: '.',
      environment: 'node',
      include: ['scripts/**/*.test.ts'],
      globals: true,
      pool: 'threads',
      maxWorkers: 12,
    },
  },
]);
