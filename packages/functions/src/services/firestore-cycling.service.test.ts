import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:crypto
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

// Firestore mock primitives — declared at module scope so the factory closure captures them
const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDocRef: Record<string, any> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollectionRef: Record<string, any> = {};
const mockDb = { collection: vi.fn(() => mockCollectionRef) };

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(() => mockDb),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
}));

// Import after mocks
import {
  getCyclingActivities,
  getCyclingActivityById,
  getCyclingActivityByStravaId,
  createCyclingActivity,
  deleteCyclingActivity,
  getCurrentFTP,
  createFTPEntry,
  getCurrentTrainingBlock,
  createTrainingBlock,
  getStravaTokens,
  setStravaTokens,
  deleteStravaTokens,
} from './firestore-cycling.service.js';

// ---------- Sample data ----------

const sampleActivity = {
  stravaId: 12345,
  userId: 'test-user',
  date: '2026-02-09',
  durationMinutes: 60,
  avgPower: 200,
  normalizedPower: 210,
  maxPower: 350,
  avgHeartRate: 150,
  maxHeartRate: 175,
  tss: 80,
  intensityFactor: 0.85,
  type: 'virtual' as const,
  source: 'strava' as const,
  ef: 1.33,
  createdAt: '2026-02-09T12:00:00.000Z',
};

const sampleFTPEntry = {
  value: 280,
  date: '2026-02-01',
  source: 'test' as const,
};

const sampleTrainingBlock = {
  startDate: '2026-02-01',
  endDate: '2026-03-28',
  goals: ['Build endurance', 'Increase FTP'],
};

const sampleStravaTokens = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  expiresAt: 1700000000,
  athleteId: 99999,
};

// ---------- Tests ----------

describe('Firestore Cycling Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock chain objects
    Object.assign(mockDocRef, {
      get: mockGet,
      set: mockSet,
      delete: mockDelete,
      update: mockUpdate,
      collection: vi.fn(() => mockCollectionRef),
    });

    Object.assign(mockCollectionRef, {
      doc: vi.fn(() => mockDocRef),
      orderBy: mockOrderBy,
      where: mockWhere,
      get: mockGet,
    });

    // Query chaining
    mockOrderBy.mockReturnValue({ get: mockGet, limit: mockLimit });
    mockLimit.mockReturnValue({ get: mockGet });
    mockWhere.mockReturnValue({ get: mockGet, limit: mockLimit, orderBy: mockOrderBy });

    mockDb.collection.mockReturnValue(mockCollectionRef);
  });

  // ============ getCyclingActivities ============

  describe('getCyclingActivities', () => {
    it('returns activities ordered by date', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { id: 'act-1', data: (): Record<string, unknown> => ({ ...sampleActivity, date: '2026-02-09' }) },
          { id: 'act-2', data: (): Record<string, unknown> => ({ ...sampleActivity, date: '2026-02-08' }) },
        ],
      });

      const result = await getCyclingActivities('test-user');

      expect(mockCollectionRef.orderBy).toHaveBeenCalledWith('date', 'desc');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('act-1');
      expect(result[1]?.id).toBe('act-2');
    });

    it('applies limit when provided', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'act-1', data: (): Record<string, unknown> => sampleActivity }],
      });

      await getCyclingActivities('test-user', 5);

      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('returns empty array when none exist', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await getCyclingActivities('test-user');

      expect(result).toEqual([]);
    });
  });

  // ============ getCyclingActivityById ============

  describe('getCyclingActivityById', () => {
    it('returns activity when found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'act-1',
        data: (): Record<string, unknown> => sampleActivity,
      });

      const result = await getCyclingActivityById('test-user', 'act-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('act-1');
      expect(result?.stravaId).toBe(12345);
      expect(result?.avgPower).toBe(200);
    });

    it('returns null when not found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: false,
        data: (): undefined => undefined,
      });

      const result = await getCyclingActivityById('test-user', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ============ getCyclingActivityByStravaId ============

  describe('getCyclingActivityByStravaId', () => {
    it('returns activity by strava id', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'act-1', data: (): Record<string, unknown> => sampleActivity }],
      });

      const result = await getCyclingActivityByStravaId('test-user', 12345);

      expect(mockWhere).toHaveBeenCalledWith('stravaId', '==', 12345);
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('act-1');
      expect(result?.stravaId).toBe(12345);
    });

    it('returns null when not found', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await getCyclingActivityByStravaId('test-user', 99999);

      expect(result).toBeNull();
    });
  });

  // ============ createCyclingActivity ============

  describe('createCyclingActivity', () => {
    it('creates with generated UUID', async () => {
      const result = await createCyclingActivity('test-user', sampleActivity);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.stravaId).toBe(12345);
      expect(result.date).toBe('2026-02-09');
      expect(result.ef).toBe(1.33);
      expect(mockSet).toHaveBeenCalledTimes(1);

      // Verify the data written includes optional ef field
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          ef: 1.33,
          stravaId: 12345,
        }),
      );
    });
  });

  // ============ deleteCyclingActivity ============

  describe('deleteCyclingActivity', () => {
    it('deletes activity and streams subdoc', async () => {
      // First get: activity doc exists
      mockGet.mockResolvedValueOnce({ exists: true, data: (): Record<string, unknown> => sampleActivity });
      // Second get: streams subdoc exists
      mockGet.mockResolvedValueOnce({ exists: true });

      const result = await deleteCyclingActivity('test-user', 'act-1');

      expect(result).toBe(true);
      // Two deletes: streams doc + activity doc
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    it('returns false when not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const result = await deleteCyclingActivity('test-user', 'nonexistent');

      expect(result).toBe(false);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  // ============ getCurrentFTP ============

  describe('getCurrentFTP', () => {
    it('returns latest FTP entry', async () => {
      const ftpData = {
        userId: 'test-user',
        value: 280,
        date: '2026-02-01',
        source: 'test',
      };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'ftp-1', data: (): Record<string, unknown> => ftpData }],
      });

      const result = await getCurrentFTP('test-user');

      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('ftp-1');
      expect(result?.value).toBe(280);
    });

    it('returns null when no FTP exists', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await getCurrentFTP('test-user');

      expect(result).toBeNull();
    });
  });

  // ============ createFTPEntry ============

  describe('createFTPEntry', () => {
    it('creates with generated UUID', async () => {
      const result = await createFTPEntry('test-user', sampleFTPEntry);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.userId).toBe('test-user');
      expect(result.value).toBe(280);
      expect(result.date).toBe('2026-02-01');
      expect(result.source).toBe('test');
      expect(mockSet).toHaveBeenCalledTimes(1);
    });
  });

  // ============ getCurrentTrainingBlock ============

  describe('getCurrentTrainingBlock', () => {
    it('returns active block', async () => {
      const blockData = {
        userId: 'test-user',
        startDate: '2026-02-01',
        endDate: '2026-03-28',
        currentWeek: 3,
        goals: ['Build endurance'],
        status: 'active',
        daysPerWeek: 3,
        weeklySessions: [
          {
            order: 1,
            sessionType: 'vo2max',
            pelotonClassTypes: ['Power Zone Max'],
            suggestedDurationMinutes: 30,
            description: 'VO2 max session',
          },
        ],
      };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'block-1', data: (): Record<string, unknown> => blockData }],
      });

      const result = await getCurrentTrainingBlock('test-user');

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('block-1');
      expect(result?.status).toBe('active');
      expect(result?.currentWeek).toBe(3);
      expect(result?.weeklySessions).toHaveLength(1);
    });

    it('returns null when no active block', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await getCurrentTrainingBlock('test-user');

      expect(result).toBeNull();
    });
  });

  // ============ createTrainingBlock ============

  describe('createTrainingBlock', () => {
    it('creates with required and optional fields', async () => {
      const input = {
        ...sampleTrainingBlock,
        daysPerWeek: 3,
        experienceLevel: 'intermediate' as const,
        weeklyHoursAvailable: 6,
        weeklySessions: [
          {
            order: 1,
            sessionType: 'vo2max' as const,
            pelotonClassTypes: ['Power Zone Max'],
            suggestedDurationMinutes: 30,
            description: 'VO2 session',
          },
        ],
        preferredDays: [1, 3, 5],
      };

      const result = await createTrainingBlock('test-user', input);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.userId).toBe('test-user');
      expect(result.status).toBe('active');
      expect(result.currentWeek).toBe(1);
      expect(result.daysPerWeek).toBe(3);
      expect(result.experienceLevel).toBe('intermediate');
      expect(result.weeklyHoursAvailable).toBe(6);
      expect(result.preferredDays).toEqual([1, 3, 5]);
      expect(mockSet).toHaveBeenCalledTimes(1);

      // Verify optional fields were written
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          daysPerWeek: 3,
          experienceLevel: 'intermediate',
          weeklyHoursAvailable: 6,
          preferredDays: [1, 3, 5],
        }),
      );
    });
  });

  // ============ getStravaTokens ============

  describe('getStravaTokens', () => {
    it('returns tokens when found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): Record<string, unknown> => sampleStravaTokens,
      });

      const result = await getStravaTokens('test-user');

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('access-abc');
      expect(result?.refreshToken).toBe('refresh-xyz');
      expect(result?.expiresAt).toBe(1700000000);
      expect(result?.athleteId).toBe(99999);
    });

    it('returns null when not found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: false,
        data: (): undefined => undefined,
      });

      const result = await getStravaTokens('test-user');

      expect(result).toBeNull();
    });
  });

  // ============ setStravaTokens ============

  describe('setStravaTokens', () => {
    it('saves tokens', async () => {
      await setStravaTokens('test-user', sampleStravaTokens);

      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-abc',
          refreshToken: 'refresh-xyz',
          expiresAt: 1700000000,
          athleteId: 99999,
        }),
      );
    });
  });

  // ============ deleteStravaTokens ============

  describe('deleteStravaTokens', () => {
    it('deletes existing tokens', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });

      const result = await deleteStravaTokens('test-user');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it('returns false when not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const result = await deleteStravaTokens('test-user');

      expect(result).toBe(false);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
