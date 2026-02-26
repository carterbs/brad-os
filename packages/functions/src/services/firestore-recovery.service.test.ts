import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { createFirestoreMocks } from '../test-utils/index.js';

const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
let mockDb: { collection: ReturnType<typeof vi.fn>; batch: ReturnType<typeof vi.fn> };
let mockDocRef: Partial<DocumentReference>;
let mockCollectionRef: Partial<CollectionReference>;

// ---- Module mocks (must be before service import) ----

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(() => mockDb),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
}));

// ---- Import service under test ----

import {
  getRecoverySnapshot,
  getLatestRecoverySnapshot,
  getRecoveryHistory,
  upsertRecoverySnapshot,
  getRecoveryBaseline,
  upsertRecoveryBaseline,
  addWeightEntry,
  addWeightEntries,
  getWeightHistory,
  getLatestWeight,
  addHRVEntries,
  getHRVHistory,
  addRHREntries,
  getRHRHistory,
  addSleepEntries,
  getSleepHistory,
} from './firestore-recovery.service.js';

// ---- Test data ----

const userId = 'user-123';

const sampleSnapshot = {
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
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleBaseline = {
  hrvMedian: 45,
  hrvStdDev: 8.2,
  rhrMedian: 54,
  calculatedAt: '2026-02-01T00:00:00.000Z',
  sampleCount: 30,
};

const sampleWeight = {
  date: '2026-02-09',
  weightLbs: 175.5,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleHRV = {
  date: '2026-02-09',
  avgMs: 42,
  minMs: 30,
  maxMs: 55,
  sampleCount: 12,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleRHR = {
  date: '2026-02-09',
  avgBpm: 52,
  sampleCount: 24,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

const sampleSleep = {
  date: '2026-02-09',
  totalSleepMinutes: 420,
  inBedMinutes: 480,
  coreMinutes: 180,
  deepMinutes: 90,
  remMinutes: 105,
  awakeMinutes: 45,
  sleepEfficiency: 87.5,
  source: 'healthkit' as const,
  syncedAt: '2026-02-09T12:00:00.000Z',
};

// ---- Helpers ----

type DataFn = () => Record<string, unknown>;

function docExists(data: Record<string, unknown>, id = 'doc-id'): {
  exists: true;
  data: DataFn;
  id: string;
} {
  return { exists: true, data: (): Record<string, unknown> => ({ ...data }), id };
}

function docNotFound(): { exists: false; data: () => undefined } {
  return { exists: false, data: (): undefined => undefined };
}

function queryResult(
  docs: Array<{ id: string; data: DataFn }>,
): { empty: boolean; docs: typeof docs } {
  return { empty: docs.length === 0, docs };
}

// ---- Tests ----

describe('firestore-recovery.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const firestoreMocks = createFirestoreMocks();
    mockDb = {
      collection: firestoreMocks.mockDb.collection as ReturnType<typeof vi.fn>,
      batch: vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
    };
    mockDocRef = firestoreMocks.mockDocRef;
    mockCollectionRef = firestoreMocks.mockCollection;

    mockDb.collection = vi.fn(() => mockCollectionRef);

    mockCollectionRef.doc = vi.fn(() => mockDocRef);
    mockCollectionRef.orderBy = mockOrderBy;
    mockCollectionRef.where = mockWhere;
    mockCollectionRef.get = mockGet;

    mockDocRef.collection = vi.fn(() => mockCollectionRef);
    mockDocRef.get = mockGet;
    mockDocRef.set = mockSet;

    // Query chaining
    mockOrderBy.mockReturnValue({ get: mockGet, limit: mockLimit });
    mockLimit.mockReturnValue({ get: mockGet });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy, get: mockGet });
  });

  // ============ Recovery Snapshots ============

  describe('getRecoverySnapshot', () => {
    it('returns snapshot when document exists', async () => {
      mockGet.mockResolvedValueOnce(docExists(sampleSnapshot, '2026-02-09'));

      const result = await getRecoverySnapshot(userId, '2026-02-09');

      expect(result).toEqual(sampleSnapshot);
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(userId);
    });

    it('returns null when document does not exist', async () => {
      mockGet.mockResolvedValueOnce(docNotFound());

      const result = await getRecoverySnapshot(userId, '2026-02-09');

      expect(result).toBeNull();
    });

    it('returns null when doc.exists=true but data() is undefined', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): undefined => undefined,
        id: '2026-02-09',
      });

      const result = await getRecoverySnapshot(userId, '2026-02-09');

      expect(result).toBeNull();
    });
  });

  describe('getLatestRecoverySnapshot', () => {
    it('returns the most recent snapshot', async () => {
      mockGet.mockResolvedValueOnce(
        queryResult([{ id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleSnapshot }) }]),
      );

      const result = await getLatestRecoverySnapshot(userId);

      expect(result).toEqual(sampleSnapshot);
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('returns null when no snapshots exist', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));

      const result = await getLatestRecoverySnapshot(userId);

      expect(result).toBeNull();
    });

    it('returns null when snapshot is not empty but docs[0] is missing', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [undefined] as unknown as Array<{ id: string; data: DataFn }>,
      });

      const result = await getLatestRecoverySnapshot(userId);

      expect(result).toBeNull();
    });
  });

  describe('getRecoveryHistory', () => {
    it('returns array of snapshots ordered by date desc', async () => {
      const olderSnapshot = { ...sampleSnapshot, date: '2026-02-08', score: 65 };
      mockGet.mockResolvedValueOnce(
        queryResult([
          { id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleSnapshot }) },
          { id: '2026-02-08', data: (): Record<string, unknown> => ({ ...olderSnapshot }) },
        ]),
      );

      const result = await getRecoveryHistory(userId, 7);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(sampleSnapshot);
      expect(result[1]).toEqual(olderSnapshot);
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(7);
    });

    it('returns empty array when query has no docs', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));

      const result = await getRecoveryHistory(userId, 7);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('upsertRecoverySnapshot', () => {
    it('writes snapshot and returns stored data with syncedAt', async () => {
      mockSet.mockResolvedValueOnce(undefined);

      const input = {
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

      const result = await upsertRecoverySnapshot(userId, input);

      expect(result.date).toBe('2026-02-09');
      expect(result.score).toBe(78);
      expect(result.state).toBe('ready');
      expect(result.syncedAt).toBeDefined();
      expect(mockCollectionRef.doc).toHaveBeenCalledWith('2026-02-09');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-02-09',
          score: 78,
          state: 'ready',
          source: 'healthkit',
        }),
      );
    });
  });

  // ============ Recovery Baseline ============

  describe('getRecoveryBaseline', () => {
    it('returns baseline when document exists', async () => {
      mockGet.mockResolvedValueOnce(docExists(sampleBaseline, 'recoveryBaseline'));

      const result = await getRecoveryBaseline(userId);

      expect(result).toEqual(sampleBaseline);
    });

    it('returns null when baseline is not set', async () => {
      mockGet.mockResolvedValueOnce(docNotFound());

      const result = await getRecoveryBaseline(userId);

      expect(result).toBeNull();
    });

    it('returns null when baseline doc exists but data() is undefined', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): undefined => undefined,
        id: 'recoveryBaseline',
      });

      const result = await getRecoveryBaseline(userId);

      expect(result).toBeNull();
    });
  });

  describe('upsertRecoveryBaseline', () => {
    it('writes baseline and returns data with calculatedAt', async () => {
      mockSet.mockResolvedValueOnce(undefined);

      const input = {
        hrvMedian: 45,
        hrvStdDev: 8.2,
        rhrMedian: 54,
        sampleCount: 30,
      };

      const result = await upsertRecoveryBaseline(userId, input);

      expect(result.hrvMedian).toBe(45);
      expect(result.rhrMedian).toBe(54);
      expect(result.sampleCount).toBe(30);
      expect(result.calculatedAt).toBeDefined();
      expect(mockCollectionRef.doc).toHaveBeenCalledWith('recoveryBaseline');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          hrvMedian: 45,
          hrvStdDev: 8.2,
          rhrMedian: 54,
          sampleCount: 30,
        }),
      );
    });
  });

  // ============ Weight History ============

  describe('addWeightEntry', () => {
    it('writes single weight entry and returns with id', async () => {
      mockSet.mockResolvedValueOnce(undefined);

      const result = await addWeightEntry(userId, {
        weightLbs: 175.5,
        date: '2026-02-09',
      });

      expect(result.id).toBe('2026-02-09');
      expect(result.weightLbs).toBe(175.5);
      expect(result.date).toBe('2026-02-09');
      expect(result.source).toBe('healthkit');
      expect(result.syncedAt).toBeDefined();
      expect(mockCollectionRef.doc).toHaveBeenCalledWith('2026-02-09');
    });
  });

  describe('addWeightEntries', () => {
    it('batches writes correctly for multiple entries', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const weights = [
        { weightLbs: 175.0, date: '2026-02-07' },
        { weightLbs: 175.5, date: '2026-02-08' },
        { weightLbs: 176.0, date: '2026-02-09' },
      ];

      const result = await addWeightEntries(userId, weights);

      expect(result).toBe(3);
      expect(mockBatchSet).toHaveBeenCalledTimes(3);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);

      // Verify each entry was set with correct data
      for (const weight of weights) {
        expect(mockBatchSet).toHaveBeenCalledWith(
          mockDocRef,
          expect.objectContaining({
            date: weight.date,
            weightLbs: weight.weightLbs,
            source: 'healthkit',
          }),
        );
      }
    });

    it('returns 0 and does not commit batches when input array is empty', async () => {
      const result = await addWeightEntries(userId, []);

      expect(result).toBe(0);
      expect(mockBatchSet).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('splits >500 entries into multiple commits', async () => {
      mockBatchCommit.mockResolvedValue(undefined);

      const weights = Array.from({ length: 501 }, (_, i) => ({
        weightLbs: 180 + i * 0.1,
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));

      const result = await addWeightEntries(userId, weights);

      expect(result).toBe(501);
      expect(mockBatchSet).toHaveBeenCalledTimes(501);
      expect(mockBatchCommit).toHaveBeenCalledTimes(2); // 500 + 1
    });
  });

  describe('getWeightHistory', () => {
    it('returns weight entries ordered by date desc', async () => {
      const weight1 = { ...sampleWeight, date: '2026-02-09' };
      const weight2 = { ...sampleWeight, date: '2026-02-08', weightLbs: 174.5 };
      mockGet.mockResolvedValueOnce(
        queryResult([
          { id: '2026-02-09', data: (): Record<string, unknown> => ({ ...weight1 }) },
          { id: '2026-02-08', data: (): Record<string, unknown> => ({ ...weight2 }) },
        ]),
      );

      const result = await getWeightHistory(userId, 30);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('2026-02-09');
      expect(result[0]?.weightLbs).toBe(175.5);
      expect(result[1]?.id).toBe('2026-02-08');
      expect(result[1]?.weightLbs).toBe(174.5);
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(30);
    });

    it('returns empty array when query has no docs', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));

      const result = await getWeightHistory(userId, 30);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getLatestWeight', () => {
    it('returns the most recent weight entry', async () => {
      mockGet.mockResolvedValueOnce(
        queryResult([{ id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleWeight }) }]),
      );

      const result = await getLatestWeight(userId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('2026-02-09');
      expect(result?.weightLbs).toBe(175.5);
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('returns null when no weight entries exist', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));

      const result = await getLatestWeight(userId);

      expect(result).toBeNull();
    });

    it('returns null when snapshot is not empty but docs[0] is missing', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [undefined] as unknown as Array<{ id: string; data: DataFn }>,
      });

      const result = await getLatestWeight(userId);

      expect(result).toBeNull();
    });
  });

  // ============ HRV History ============

  describe('addHRVEntries', () => {
    it('batches writes correctly for multiple entries', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const entries = [
        { date: '2026-02-07', avgMs: 40, minMs: 28, maxMs: 52, sampleCount: 10 },
        { date: '2026-02-08', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
      ];

      const result = await addHRVEntries(userId, entries);

      expect(result).toBe(2);
      expect(mockBatchSet).toHaveBeenCalledTimes(2);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({ date: '2026-02-07', avgMs: 40, source: 'healthkit' }),
      );
    });

    it('defaults source to healthkit when not provided', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);

      await addHRVEntries(userId, [
        { date: '2026-02-09', avgMs: 42, minMs: 30, maxMs: 55, sampleCount: 12 },
      ]);

      expect(mockBatchSet).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({ source: 'healthkit' }),
      );
    });

    it('returns 0 with zero commits for empty array', async () => {
      const result = await addHRVEntries(userId, []);

      expect(result).toBe(0);
      expect(mockBatchSet).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('getHRVHistory', () => {
    it('returns HRV entries filtered by date cutoff', async () => {
      mockGet.mockResolvedValueOnce(
        queryResult([
          { id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleHRV }) },
        ]),
      );

      const result = await getHRVHistory(userId, 7);

      expect(result).toHaveLength(1);
      expect(result[0]?.avgMs).toBe(42);
      expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
    });

    it('returns empty array when no entries exist', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));

      const result = await getHRVHistory(userId, 7);

      expect(result).toHaveLength(0);
    });
  });

  // ============ RHR History ============

  describe('addRHREntries', () => {
    it('batches writes correctly for multiple entries', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const entries = [
        { date: '2026-02-07', avgBpm: 52, sampleCount: 24 },
        { date: '2026-02-08', avgBpm: 54, sampleCount: 20 },
      ];

      const result = await addRHREntries(userId, entries);

      expect(result).toBe(2);
      expect(mockBatchSet).toHaveBeenCalledTimes(2);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({ date: '2026-02-07', avgBpm: 52, source: 'healthkit' }),
      );
    });

    it('defaults source to healthkit', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);
      await addRHREntries(userId, [{ date: '2026-02-09', avgBpm: 52, sampleCount: 24 }]);
      expect(mockBatchSet).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({ source: 'healthkit' }));
    });

    it('returns 0 with zero commits for empty array', async () => {
      const result = await addRHREntries(userId, []);

      expect(result).toBe(0);
      expect(mockBatchSet).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('getRHRHistory', () => {
    it('returns RHR entries filtered by date cutoff', async () => {
      mockGet.mockResolvedValueOnce(
        queryResult([{ id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleRHR }) }]),
      );

      const result = await getRHRHistory(userId, 7);

      expect(result).toHaveLength(1);
      expect(result[0]?.avgBpm).toBe(52);
      expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
    });

    it('returns empty array when no entries exist', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));
      const result = await getRHRHistory(userId, 7);
      expect(result).toHaveLength(0);
    });
  });

  // ============ Sleep History ============

  describe('addSleepEntries', () => {
    it('batches writes correctly for all sleep fields', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const entries = [{
        date: '2026-02-09',
        totalSleepMinutes: 420,
        inBedMinutes: 480,
        coreMinutes: 180,
        deepMinutes: 90,
        remMinutes: 105,
        awakeMinutes: 45,
        sleepEfficiency: 87.5,
      }];

      const result = await addSleepEntries(userId, entries);

      expect(result).toBe(1);
      expect(mockBatchSet).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          date: '2026-02-09',
          totalSleepMinutes: 420,
          deepMinutes: 90,
          sleepEfficiency: 87.5,
          source: 'healthkit',
        }),
      );
    });

    it('defaults source to healthkit', async () => {
      mockBatchCommit.mockResolvedValueOnce(undefined);
      await addSleepEntries(userId, [{
        date: '2026-02-09', totalSleepMinutes: 420, inBedMinutes: 480,
        coreMinutes: 180, deepMinutes: 90, remMinutes: 105,
        awakeMinutes: 45, sleepEfficiency: 87.5,
      }]);
      expect(mockBatchSet).toHaveBeenCalledWith(mockDocRef, expect.objectContaining({ source: 'healthkit' }));
    });

    it('returns 0 with zero commits for empty array', async () => {
      const result = await addSleepEntries(userId, []);

      expect(result).toBe(0);
      expect(mockBatchSet).not.toHaveBeenCalled();
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('getSleepHistory', () => {
    it('returns sleep entries filtered by date cutoff', async () => {
      mockGet.mockResolvedValueOnce(
        queryResult([{ id: '2026-02-09', data: (): Record<string, unknown> => ({ ...sampleSleep }) }]),
      );

      const result = await getSleepHistory(userId, 7);

      expect(result).toHaveLength(1);
      expect(result[0]?.totalSleepMinutes).toBe(420);
      expect(result[0]?.sleepEfficiency).toBe(87.5);
      expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.any(String));
    });

    it('returns empty array when no entries exist', async () => {
      mockGet.mockResolvedValueOnce(queryResult([]));
      const result = await getSleepHistory(userId, 7);
      expect(result).toHaveLength(0);
    });
  });
});
