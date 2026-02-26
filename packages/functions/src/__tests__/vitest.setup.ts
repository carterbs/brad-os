import { beforeEach, vi } from 'vitest';

// Silence firebase logger output during tests to reduce noisy I/O overhead.
vi.mock('firebase-functions/logger', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
