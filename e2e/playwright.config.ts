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
    // E2E tests use port 3100 to avoid conflicts with dev server (port 3000)
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3100',
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
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  // Start server with NODE_ENV=test on port 3100 to use isolated test database
  // IMPORTANT: Never reuse existing server - always start fresh to ensure test isolation
  webServer: {
    command: 'NODE_ENV=test PORT=3100 npm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    cwd: '..',
    env: {
      NODE_ENV: 'test',
      PORT: '3100',
    },
  },
});
