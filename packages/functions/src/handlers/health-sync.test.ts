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
  addHRVEntries: vi.fn(),
  getHRVHistory: vi.fn(),
  addRHREntries: vi.fn(),
  getRHRHistory: vi.fn(),
  addSleepEntries: vi.fn(),
  getSleepHistory: vi.fn(),
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

    it('should clamp oversized days to 365 for weight', async () => {
      mockRecoveryService.getWeightHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/weight?days=500');
      expect(mockRecoveryService.getWeightHistory).toHaveBeenCalledWith('default-user', 365);
    });

    it('should fall back to latest for non-numeric days', async () => {
      mockRecoveryService.getLatestWeight.mockResolvedValue({
        id: '2026-02-09',
        date: '2026-02-09',
        weightLbs: 180.5,
        source: 'healthkit',
        syncedAt: '2026-02-09T12:00:00.000Z',
      });

      await request(healthSyncApp).get('/weight?days=abc');
      expect(mockRecoveryService.getLatestWeight).toHaveBeenCalled();
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

    it('should reject missing recovery object with 400 + VALIDATION_ERROR', async () => {
      const response = await request(healthSyncApp).post('/sync').send({});

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed recovery payload (invalid state)', async () => {
      const response = await request(healthSyncApp)
        .post('/sync')
        .send({
          recovery: {
            date: '2026-02-09',
            hrvMs: 42,
            hrvVsBaseline: 16.7,
            rhrBpm: 52,
            rhrVsBaseline: -3,
            sleepHours: 7.8,
            sleepEfficiency: 92,
            deepSleepPercent: 18,
            score: 78,
            state: 'invalid-state', // Invalid state value
            source: 'healthkit',
          },
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject malformed recovery payload (invalid date)', async () => {
      const response = await request(healthSyncApp)
        .post('/sync')
        .send({
          recovery: {
            date: '02/09/2026', // Invalid date format
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
          },
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should use default user id when x-user-id is empty string', async () => {
      mockRecoveryService.upsertRecoverySnapshot.mockResolvedValue(validRecovery);

      await request(healthSyncApp)
        .post('/sync')
        .set('x-user-id', '')
        .send({ recovery: validRecovery });

      expect(mockRecoveryService.upsertRecoverySnapshot).toHaveBeenCalledWith(
        'default-user',
        expect.anything()
      );
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

    it('should reject malformed date query with 400', async () => {
      const response = await request(healthSyncApp).get('/recovery?date=02/09/2026');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      // Verify service was not called for malformed date
      expect(mockRecoveryService.getRecoverySnapshot).not.toHaveBeenCalled();
    });

    it('should return date-specific 404 message when no recovery data for date', async () => {
      mockRecoveryService.getRecoverySnapshot.mockResolvedValue(null);

      const response = await request(healthSyncApp).get('/recovery?date=2026-01-01');

      const body = response.body as ApiResponse;
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.message).toContain('No recovery data for date: 2026-01-01');
    });
  });

  // ============ GET /recovery/history ============

  describe('GET /recovery/history', () => {
    it('should return recovery history with default days', async () => {
      const history = [
        { date: '2026-02-09', hrvMs: 42, hrvVsBaseline: 16.7, rhrBpm: 52, rhrVsBaseline: -3, sleepHours: 7.8, sleepEfficiency: 92, deepSleepPercent: 18, score: 78, state: 'ready', source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' },
        { date: '2026-02-08', hrvMs: 40, hrvVsBaseline: 10, rhrBpm: 54, rhrVsBaseline: -1, sleepHours: 7.0, sleepEfficiency: 88, deepSleepPercent: 15, score: 72, state: 'ready', source: 'healthkit', syncedAt: '2026-02-08T12:00:00.000Z' },
      ];
      mockRecoveryService.getRecoveryHistory.mockResolvedValue(history);

      const response = await request(healthSyncApp).get('/recovery/history');
      const body = response.body as ApiResponse<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 7);
    });

    it('should accept explicit days parameter', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/recovery/history?days=30');
      const body = response.body as ApiResponse<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 30);
    });

    it('should clamp days to range 1-90', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/recovery/history?days=200');
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 90);
    });

    it('should clamp days=0 to 1', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/recovery/history?days=0');
      const body = response.body as ApiResponse<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 1);
    });

    it('should fall back to default days when days query is empty', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/recovery/history?days=');
      const body = response.body as ApiResponse<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 7);
    });

    it('should clamp negative days to 1', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/recovery/history?days=-5');
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 1);
    });

    it('should fall back to default days for non-numeric input', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/recovery/history?days=abc');
      expect(mockRecoveryService.getRecoveryHistory).toHaveBeenCalledWith('default-user', 7);
    });

    it('should return 200 with empty array when no history available', async () => {
      mockRecoveryService.getRecoveryHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/recovery/history?days=7');
      const body = response.body as ApiResponse<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  // ============ GET /baseline ============

  describe('GET /baseline', () => {
    it('should return baseline when it exists', async () => {
      const baseline = { hrvMedian: 45, hrvStdDev: 8.2, rhrMedian: 54, calculatedAt: '2026-02-01T00:00:00.000Z', sampleCount: 30 };
      mockRecoveryService.getRecoveryBaseline.mockResolvedValue(baseline);

      const response = await request(healthSyncApp).get('/baseline');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(baseline);
    });

    it('should return 404 when no baseline exists', async () => {
      mockRecoveryService.getRecoveryBaseline.mockResolvedValue(null);

      const response = await request(healthSyncApp).get('/baseline');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });

  // ============ POST /sync with baseline ============

  describe('POST /sync with baseline', () => {
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

    it('should sync with baseline when provided', async () => {
      mockRecoveryService.upsertRecoverySnapshot.mockResolvedValue(validRecovery);
      mockRecoveryService.upsertRecoveryBaseline.mockResolvedValue({});

      const response = await request(healthSyncApp).post('/sync').send({
        recovery: validRecovery,
        baseline: { hrvMedian: 45, hrvStdDev: 8.2, rhrMedian: 54, sampleCount: 30 },
      });

      const body = response.body as ApiResponse<{ baselineUpdated: boolean }>;
      expect(response.status).toBe(200);
      expect(body.data?.baselineUpdated).toBe(true);
      expect(mockRecoveryService.upsertRecoveryBaseline).toHaveBeenCalled();
    });
  });

  // ============ POST /hrv/bulk ============

  describe('POST /hrv/bulk', () => {
    it('should bulk sync HRV entries', async () => {
      mockRecoveryService.addHRVEntries.mockResolvedValue(2);

      const response = await request(healthSyncApp).post('/hrv/bulk').send({
        entries: [
          { date: '2026-02-07', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
          { date: '2026-02-08', avgMs: 45, minMs: 32, maxMs: 58, sampleCount: 15 },
        ],
      });

      const body = response.body as ApiResponse<{ added: number }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.added).toBe(2);
      expect(mockRecoveryService.addHRVEntries).toHaveBeenCalledWith('default-user', expect.any(Array));
    });

    it('should reject empty entries array', async () => {
      const response = await request(healthSyncApp).post('/hrv/bulk').send({ entries: [] });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid date format', async () => {
      const response = await request(healthSyncApp).post('/hrv/bulk').send({
        entries: [{ date: '02/07/2026', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject out-of-range avgMs', async () => {
      const response = await request(healthSyncApp).post('/hrv/bulk').send({
        entries: [{ date: '2026-02-07', avgMs: 500, minMs: 30, maxMs: 55, sampleCount: 12 }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  // ============ GET /hrv ============

  describe('GET /hrv', () => {
    it('should return HRV history when days param provided', async () => {
      mockRecoveryService.getHRVHistory.mockResolvedValue([
        { id: '2026-02-09', date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' },
      ]);

      const response = await request(healthSyncApp).get('/hrv?days=7');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return latest HRV when no days param', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getHRVHistory.mockResolvedValue([entry]);

      const response = await request(healthSyncApp).get('/hrv');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(entry);
    });

    it('should return 404 when no HRV data', async () => {
      mockRecoveryService.getHRVHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/hrv');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should clamp oversized days to 3650 for HRV', async () => {
      mockRecoveryService.getHRVHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/hrv?days=5000');
      expect(mockRecoveryService.getHRVHistory).toHaveBeenCalledWith('default-user', 3650);
    });

    it('should fall back to latest for non-numeric days', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getHRVHistory.mockResolvedValue([entry]);

      await request(healthSyncApp).get('/hrv?days=abc');
      expect(mockRecoveryService.getHRVHistory).toHaveBeenCalledWith('default-user', 1);
    });
  });

  // ============ POST /rhr/bulk ============

  describe('POST /rhr/bulk', () => {
    it('should bulk sync RHR entries', async () => {
      mockRecoveryService.addRHREntries.mockResolvedValue(2);

      const response = await request(healthSyncApp).post('/rhr/bulk').send({
        entries: [
          { date: '2026-02-07', avgBpm: 52, sampleCount: 24 },
          { date: '2026-02-08', avgBpm: 54, sampleCount: 20 },
        ],
      });

      const body = response.body as ApiResponse<{ added: number }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.added).toBe(2);
      expect(mockRecoveryService.addRHREntries).toHaveBeenCalledWith('default-user', expect.any(Array));
    });

    it('should reject empty entries array', async () => {
      const response = await request(healthSyncApp).post('/rhr/bulk').send({ entries: [] });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid date format', async () => {
      const response = await request(healthSyncApp).post('/rhr/bulk').send({
        entries: [{ date: '02/07/2026', avgBpm: 52, sampleCount: 24 }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject out-of-range avgBpm', async () => {
      const response = await request(healthSyncApp).post('/rhr/bulk').send({
        entries: [{ date: '2026-02-07', avgBpm: 250, sampleCount: 24 }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  // ============ GET /rhr ============

  describe('GET /rhr', () => {
    it('should return RHR history when days param provided', async () => {
      mockRecoveryService.getRHRHistory.mockResolvedValue([
        { id: '2026-02-09', date: '2026-02-09', avgBpm: 52, sampleCount: 24, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' },
      ]);

      const response = await request(healthSyncApp).get('/rhr?days=7');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return latest RHR when no days param', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', avgBpm: 52, sampleCount: 24, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getRHRHistory.mockResolvedValue([entry]);

      const response = await request(healthSyncApp).get('/rhr');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(entry);
    });

    it('should return 404 when no RHR data', async () => {
      mockRecoveryService.getRHRHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/rhr');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should clamp oversized days to 3650 for RHR', async () => {
      mockRecoveryService.getRHRHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/rhr?days=5000');
      expect(mockRecoveryService.getRHRHistory).toHaveBeenCalledWith('default-user', 3650);
    });

    it('should fall back to latest for non-numeric days', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', avgBpm: 52, sampleCount: 24, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getRHRHistory.mockResolvedValue([entry]);

      await request(healthSyncApp).get('/rhr?days=abc');
      expect(mockRecoveryService.getRHRHistory).toHaveBeenCalledWith('default-user', 1);
    });
  });

  // ============ POST /sleep/bulk ============

  describe('POST /sleep/bulk', () => {
    it('should bulk sync sleep entries', async () => {
      mockRecoveryService.addSleepEntries.mockResolvedValue(1);

      const response = await request(healthSyncApp).post('/sleep/bulk').send({
        entries: [{
          date: '2026-02-09',
          totalSleepMinutes: 420,
          inBedMinutes: 480,
          coreMinutes: 180,
          deepMinutes: 90,
          remMinutes: 105,
          awakeMinutes: 45,
          sleepEfficiency: 87.5,
        }],
      });

      const body = response.body as ApiResponse<{ added: number }>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.added).toBe(1);
      expect(mockRecoveryService.addSleepEntries).toHaveBeenCalledWith('default-user', expect.any(Array));
    });

    it('should reject empty entries array', async () => {
      const response = await request(healthSyncApp).post('/sleep/bulk').send({ entries: [] });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid date format', async () => {
      const response = await request(healthSyncApp).post('/sleep/bulk').send({
        entries: [{
          date: '02/09/2026',
          totalSleepMinutes: 420,
          inBedMinutes: 480,
          coreMinutes: 180,
          deepMinutes: 90,
          remMinutes: 105,
          awakeMinutes: 45,
          sleepEfficiency: 87.5,
        }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject out-of-range totalSleepMinutes', async () => {
      const response = await request(healthSyncApp).post('/sleep/bulk').send({
        entries: [{
          date: '2026-02-09',
          totalSleepMinutes: 2000,
          inBedMinutes: 480,
          coreMinutes: 180,
          deepMinutes: 90,
          remMinutes: 105,
          awakeMinutes: 45,
          sleepEfficiency: 87.5,
        }],
      });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  // ============ GET /sleep ============

  describe('GET /sleep', () => {
    it('should return sleep history when days param provided', async () => {
      mockRecoveryService.getSleepHistory.mockResolvedValue([
        { id: '2026-02-09', date: '2026-02-09', totalSleepMinutes: 420, inBedMinutes: 480, coreMinutes: 180, deepMinutes: 90, remMinutes: 105, awakeMinutes: 45, sleepEfficiency: 87.5, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' },
      ]);

      const response = await request(healthSyncApp).get('/sleep?days=7');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return latest sleep when no days param', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', totalSleepMinutes: 420, inBedMinutes: 480, coreMinutes: 180, deepMinutes: 90, remMinutes: 105, awakeMinutes: 45, sleepEfficiency: 87.5, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getSleepHistory.mockResolvedValue([entry]);

      const response = await request(healthSyncApp).get('/sleep');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(entry);
    });

    it('should return 404 when no sleep data', async () => {
      mockRecoveryService.getSleepHistory.mockResolvedValue([]);

      const response = await request(healthSyncApp).get('/sleep');
      const body = response.body as ApiResponse;
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });

    it('should clamp oversized days to 3650 for sleep', async () => {
      mockRecoveryService.getSleepHistory.mockResolvedValue([]);

      await request(healthSyncApp).get('/sleep?days=5000');
      expect(mockRecoveryService.getSleepHistory).toHaveBeenCalledWith('default-user', 3650);
    });

    it('should fall back to latest for non-numeric days', async () => {
      const entry = { id: '2026-02-09', date: '2026-02-09', totalSleepMinutes: 420, inBedMinutes: 480, coreMinutes: 180, deepMinutes: 90, remMinutes: 105, awakeMinutes: 45, sleepEfficiency: 87.5, source: 'healthkit', syncedAt: '2026-02-09T12:00:00.000Z' };
      mockRecoveryService.getSleepHistory.mockResolvedValue([entry]);

      await request(healthSyncApp).get('/sleep?days=abc');
      expect(mockRecoveryService.getSleepHistory).toHaveBeenCalledWith('default-user', 1);
    });
  });

  // ============ Bulk POST error handling ============

  describe('Bulk POST malformed payload checks', () => {
    it('should reject non-array weights in /weight/bulk', async () => {
      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({ weights: { date: '2026-02-09', weightLbs: 180 } });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed entries in /hrv/bulk', async () => {
      const response = await request(healthSyncApp)
        .post('/hrv/bulk')
        .send({
          entries: [{ date: '2026-02-09', avgMs: 'not-a-number', minMs: 30, maxMs: 55, sampleCount: 12 }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed entries in /rhr/bulk', async () => {
      const response = await request(healthSyncApp)
        .post('/rhr/bulk')
        .send({
          entries: [{ date: '2026-02-09', avgBpm: 'not-a-number', sampleCount: 24 }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed entries in /sleep/bulk', async () => {
      const response = await request(healthSyncApp)
        .post('/sleep/bulk')
        .send({
          entries: [{ date: '2026-02-09', totalSleepMinutes: 'not-a-number', inBedMinutes: 480, coreMinutes: 180, deepMinutes: 90, remMinutes: 105, awakeMinutes: 45, sleepEfficiency: 87.5 }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============ Error propagation (service failures) ============

  describe('Error propagation from service', () => {
    it('should return 500 + INTERNAL_ERROR when service throws on POST /sync', async () => {
      mockRecoveryService.upsertRecoverySnapshot.mockRejectedValueOnce(new Error('Database error'));

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
        state: 'ready' as const,
        source: 'healthkit' as const,
      };

      const response = await request(healthSyncApp)
        .post('/sync')
        .send({ recovery: validRecovery });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_ERROR');
    });

    it('should return 500 + INTERNAL_ERROR when service throws on POST /weight/bulk', async () => {
      mockRecoveryService.addWeightEntries.mockRejectedValueOnce(new Error('Batch write failed'));

      const response = await request(healthSyncApp)
        .post('/weight/bulk')
        .send({
          weights: [{ weightLbs: 180, date: '2026-02-09' }],
        });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(500);
      expect(body.error?.code).toBe('INTERNAL_ERROR');
    });
  });
});
