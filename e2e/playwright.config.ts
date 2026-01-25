import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Enable parallel execution with 8 workers
  // Each worker gets its own server instance and database via global-setup
  workers: 8,
  reporter: [['html'], ['json', { outputFile: 'test-results.json' }]],

  // Global setup starts 8 server instances on ports 3200-3270
  // Global teardown stops all servers and cleans up databases
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    // baseURL is set per-worker in fixtures.ts based on parallelIndex
    // Default here is just a fallback, actual URL comes from workerBaseUrl fixture
    baseURL: 'http://localhost:3200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Timeout settings
  timeout: 15000,
  expect: {
    timeout: 10000,
  },

  // Server startup is now handled by global-setup.ts for parallel execution
  // Each worker gets its own server on port 3200 + workerIndex with isolated database
});
