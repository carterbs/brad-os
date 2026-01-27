/**
 * Integration Tests for Health API
 *
 * Basic smoke test to verify the emulator is running correctly.
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:5000/api/dev';

interface HealthResponse {
  success: boolean;
  data: {
    status: string;
    timestamp: string;
    environment: string;
  };
}

describe('Health API (Integration)', () => {
  it('should return healthy status', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as HealthResponse;
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('healthy');
    expect(result.data.environment).toBe('dev');
    expect(result.data.timestamp).toBeDefined();
  });
});
