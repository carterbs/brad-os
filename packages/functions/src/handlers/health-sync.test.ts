import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { type ApiResponse } from '../__tests__/utils/index.js';

// Mock the recovery service
const mockRecoveryService = vi.hoisted(() => ({
  upsertRecoverySnapshot: vi.fn(),
  upsertRecoveryBaseline: vi.fn(),
  addWeightEntry: vi.fn(),
  addWeightEntries: vi.fn(),
  getRecoverySnapshot: vi.fn(),
  getLatestRecoverySnapshot: vi.fn(),
  getRecoveryHistory: vi.fn(),
  getRecoveryBaseline: vi.fn(),
  getWeightHistory: vi.fn(),
  getLatestWeight: vi.fn(),
}));

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));

vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);

import { healthSyncApp } from './health-sync.js';

describe('Health Sync Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ POST /weight/bulk ============

  describe('POST /weight/bulk', () => {
    it('should bulk sync weight entries', async () => {
      mockRecoveryService.addWeightEntries.mockResolvedValue(3);

      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({
          weights: [
            { weightLbs: 180.5, date: '2026-02-07' },
            { weightLbs: 180.2, date: '2026-02-08' },
            { weightLbs: 179.8, date: '2026-02-09' },
          ],
        });

      const body = response.body as ApiResponse<{ added: number }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.added).toBe(3);
      expect(mockRecoveryService.addWeightEntries).toHaveBeenCalledWith(
        'default-user',
        [
          { weightLbs: 180.5, date: '2026-02-07' },
          { weightLbs: 180.2, date: '2026-02-08' },
          { weightLbs: 179.8, date: '2026-02-09' },
        ]
      );
    });

    it('should accept weight entries with source', async () => {
      mockRecoveryService.addWeightEntries.mockResolvedValue(1);

      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({
          weights: [
            { weightLbs: 180.5, date: '2026-02-07', source: 'manual' },
          ],
        });

      const body = response.body as ApiResponse<{ added: number }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.added).toBe(1);
    });

    it('should reject empty weights array', async () => {
      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({ weights: [] });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing weights field', async () => {
      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({});

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject invalid date format', async () => {
      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({
          weights: [{ weightLbs: 180, date: '02/07/2026' }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject negative weight', async () => {
      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({
          weights: [{ weightLbs: -5, date: '2026-02-07' }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should use x-user-id header for user identification', async () => {
      mockRecoveryService.addWeightEntries.mockResolvedValue(1);

      await request(healthSyncApp)
        .post('/weight/bulk')
        .set('x-user-id', 'user-123')
        .send({
          weights: [{ weightLbs: 180, date: '2026-02-07' }],
        });

      expect(mockRecoveryService.addWeightEntries).toHaveBeenCalledWith(
        'user-123',
        expect.anything()
      );
    });
  });

  // ============ GET /weight ============

  describe('GET /weight', () => {
    it('should return latest weight when no days param', async () => {
      mockRecoveryService.getLatestWeight.mockResolvedValue({
        id: '2026-02-09',
        date: '2026-02-09',
        weightLbs: 180.5,
        source: 'healthkit',
        syncedAt: '2026-02-09T12:00:00.000Z',
      });

      const response = await request(healthSyncApp).get('/weight');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        id: '2026-02-09',
        date: '2026-02-09',
        weightLbs: 180.5,
        source: 'healthkit',
        syncedAt: '2026-02-09T12:00:00.000Z',
      });
    });

    it('should return weight history when days param provided', async () => {
      mockRecoveryService.getWeightHistory.mockResolvedValue([
        { id: '2026-02-09', date: '2026-02-09', weightLbs: 180.5, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' },
        { id: '2026-02-08', date: '2026-02-08', weightLbs: 181.0, source: 'healthkit', syncedAt: '2026-02-08T12:00:00.000Z' },
      ]);

      const response = await request(healthSyncApp).get('/weight?days=7');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 404 when no weight data exists', async () => {
      mockRecoveryService.getLatestWeight.mockResolvedValue(null);

      const response = await request(healthSyncApp).get('/weight');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  // ============ POST /sync ============

  describe('POST /sync', () => {
    const validRecovery = {
      date: '2026-02-09',
      hrvMs: 42,
      hrvVsBaseline: 16.7,
      rhrBpm: 52,
      rhrVsBaseline: -3,
      sleepHours: 7.8,
      sleepEfficiency: 92,
      deepSleepPercent: 18,
      score: 78,
      state: 'ready',
      source: 'healthkit',
    };

    it('should sync recovery data with weight', async () => {
      mockRecoveryService.upsertRecoverySnapshot.mockResolvedValue(validRecovery);
      mockRecoveryService.addWeightEntry.mockResolvedValue({
        id: '2026-02-09',
        date: '2026-02-09',
        weightLbs: 180,
        source: 'healthkit',
        syncedAt: '2026-02-09T12:00:00.000Z',
      });

      const response = await request(healthSyncApp)
        .post('/sync')
        .send({
          recovery: validRecovery,
          weight: { weightLbs: 180, date: '2026-02-09' },
        });

      const body = response.body as ApiResponse<{ synced: boolean; weightAdded: boolean }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.synced).toBe(true);
      expect(body.data?.weightAdded).toBe(true);
    });

    it('should sync recovery data without weight', async () => {
      mockRecoveryService.upsertRecoverySnapshot.mockResolvedValue(validRecovery);

      const response = await request(healthSyncApp)
        .post('/sync')
        .send({ recovery: validRecovery });

      const body = response.body as ApiResponse<{ synced: boolean; weightAdded: boolean }>;
      expect(response.status).toBe(200);
      expect(body.data?.weightAdded).toBe(false);
    });
  });

  // ============ GET /recovery ============

  describe('GET /recovery', () => {
    it('should return latest recovery snapshot', async () => {
      const snapshot = {
        date: '2026-02-09',
        hrvMs: 42,
        hrvVsBaseline: 16.7,
        rhrBpm: 52,
        rhrVsBaseline: -3,
        sleepHours: 7.8,
        sleepEfficiency: 92,
        deepSleepPercent: 18,
        score: 78,
        state: 'ready',
        source: 'healthkit',
        syncedAt: '2026-02-09T12:00:00.000Z',
      };
      mockRecoveryService.getLatestRecoverySnapshot.mockResolvedValue(snapshot);

      const response = await request(healthSyncApp).get('/recovery');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(snapshot);
    });

    it('should return recovery by date', async () => {
      const snapshot = {
        date: '2026-02-08',
        hrvMs: 40,
        hrvVsBaseline: 10,
        rhrBpm: 54,
        rhrVsBaseline: -1,
        sleepHours: 7.0,
        sleepEfficiency: 88,
        deepSleepPercent: 15,
        score: 72,
        state: 'ready',
        source: 'healthkit',
        syncedAt: '2026-02-08T12:00:00.000Z',
      };
      mockRecoveryService.getRecoverySnapshot.mockResolvedValue(snapshot);

      const response = await request(healthSyncApp).get('/recovery?date=2026-02-08');

      expect(response.status).toBe(200);
      expect(mockRecoveryService.getRecoverySnapshot).toHaveBeenCalledWith('default-user', '2026-02-08');
    });

    it('should return 404 when no recovery data', async () => {
      mockRecoveryService.getLatestRecoverySnapshot.mockResolvedValue(null);

      const response = await request(healthSyncApp).get('/recovery');

      expect(response.status).toBe(404);
    });
  });
});
