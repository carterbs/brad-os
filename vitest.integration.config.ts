import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['packages/functions/src/__tests__/integration/**/*.test.ts'],
    testTimeout: 30000, // Integration tests may be slower
    hookTimeout: 30000,
    // Run tests sequentially to avoid port conflicts
    // Use threads (not forks) — forks use Unix domain sockets for IPC,
    // which are blocked by Claude Code's macOS Seatbelt sandbox.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
