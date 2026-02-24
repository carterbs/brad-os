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
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'src/__tests__/**',
          'src/types/**',
          'src/**/index.ts',
        ],
      },
    },
  },
]);
