import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    environment: 'node',
    include: ['scripts/ralph/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'scripts/ralph/index.ts',
        'scripts/ralph/agent.ts',
        'scripts/ralph/backlog.ts',
        'scripts/ralph/config.ts',
        'scripts/ralph/git.ts',
        'scripts/ralph/log.ts',
        'scripts/ralph/merge-queue.ts',
        'scripts/ralph/prompts.ts',
        'scripts/ralph/sync-backlog.ts',
      ],
    },
  },
});
