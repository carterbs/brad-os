import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1, // Run serially to avoid database conflicts
  reporter: 'html',

  use: {
    // E2E tests use port 3200 to avoid conflicts with dev server (port 3000) and other tests
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3200',
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
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Start server with NODE_ENV=test on port 3200 to use isolated test database
  // IMPORTANT: Never reuse existing server - always start fresh to ensure test isolation
  webServer: {
    command: 'NODE_ENV=test PORT=3200 npm run dev',
    url: 'http://localhost:3200',
    reuseExistingServer: false,
    cwd: '..',
    env: {
      NODE_ENV: 'test',
      PORT: '3200',
    },
  },
});
