import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import { type ApiResponse } from '../__tests__/utils/index.js';

// Type for health response data
interface HealthData {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
}

// Import the handler - no mocks needed for health endpoint
import { healthApp } from './health.js';

describe('Health Handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const mockDate = new Date('2024-01-15T10:30:00.000Z');
      vi.setSystemTime(mockDate);

      const response = await request(healthApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'healthy',
          timestamp: '2024-01-15T10:30:00.000Z',
          version: '1.0.0',
          environment: 'cloud-functions',
        },
      });
    });

    it('should return success: true', async () => {
      const response: Response = await request(healthApp).get('/');
      const body = response.body as ApiResponse<HealthData>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return status as healthy', async () => {
      const response: Response = await request(healthApp).get('/');
      const body = response.body as ApiResponse<HealthData>;

      expect(response.status).toBe(200);
      expect(body.data?.status).toBe('healthy');
    });

    it('should return version as 1.0.0', async () => {
      const response: Response = await request(healthApp).get('/');
      const body = response.body as ApiResponse<HealthData>;

      expect(response.status).toBe(200);
      expect(body.data?.version).toBe('1.0.0');
    });

    it('should return environment as cloud-functions', async () => {
      const response: Response = await request(healthApp).get('/');
      const body = response.body as ApiResponse<HealthData>;

      expect(response.status).toBe(200);
      expect(body.data?.environment).toBe('cloud-functions');
    });

    it('should return valid ISO 8601 timestamp', async () => {
      const response: Response = await request(healthApp).get('/');
      const body = response.body as ApiResponse<HealthData>;

      expect(response.status).toBe(200);
      const timestamp = body.data?.timestamp ?? '';
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // Verify it parses as a valid date
      const parsed = new Date(timestamp);
      expect(parsed.toISOString()).toBe(timestamp);
    });

    it('should update timestamp on each request', async () => {
      const firstDate = new Date('2024-01-15T10:30:00.000Z');
      vi.setSystemTime(firstDate);

      const response1: Response = await request(healthApp).get('/');
      const body1 = response1.body as ApiResponse<HealthData>;
      const timestamp1 = body1.data?.timestamp;

      // Advance time by 1 second
      vi.setSystemTime(new Date('2024-01-15T10:30:01.000Z'));

      const response2: Response = await request(healthApp).get('/');
      const body2 = response2.body as ApiResponse<HealthData>;
      const timestamp2 = body2.data?.timestamp;

      expect(timestamp1).not.toBe(timestamp2);
      expect(timestamp1).toBe('2024-01-15T10:30:00.000Z');
      expect(timestamp2).toBe('2024-01-15T10:30:01.000Z');
    });
  });
});
