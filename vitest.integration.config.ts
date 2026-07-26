import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    workspace: './vitest.integration.workspace.ts',
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
