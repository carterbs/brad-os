import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './packages/functions',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**'],
    setupFiles: ['./src/__tests__/vitest.setup.ts'],
    globals: true,
  },
});
