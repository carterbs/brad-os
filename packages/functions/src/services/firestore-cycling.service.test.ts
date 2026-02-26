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
  saveActivityStreams,
  getActivityStreams,
  getCurrentFTP,
  getFTPHistory,
  createFTPEntry,
  getCurrentTrainingBlock,
  getTrainingBlocks,
  createTrainingBlock,
  completeTrainingBlock,
  updateTrainingBlockWeek,
  getWeightGoal,
  setWeightGoal,
  getStravaTokens,
  setStravaTokens,
  deleteStravaTokens,
  setAthleteToUserMapping,
  getUserIdByAthleteId,
  saveVO2MaxEstimate,
  getLatestVO2Max,
  getVO2MaxHistory,
  getCyclingProfile,
  setCyclingProfile,
  updateCyclingActivity,
} from './firestore-cycling.service.js';
import * as repositories from '../repositories/index.js';

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

  describe('repository-backed stream and update helpers', () => {
    it('should save and read activity streams via repository', async () => {
      const repository = {
        findAllByUser: vi.fn(),
        findById: vi.fn(),
        findByStravaId: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        saveStreams: vi.fn().mockResolvedValue(undefined),
        getStreams: vi.fn().mockResolvedValue({
          activityId: 'act-1',
          stravaActivityId: 12345,
          watts: [100, 120],
          heartrate: [130, 132],
          sampleCount: 2,
          createdAt: '2026-02-10T12:00:00.000Z',
        }),
        update: vi.fn(),
      };

      const repoSpy = vi
        .spyOn(repositories, 'getCyclingActivityRepository')
        .mockReturnValue(
          repository as unknown as ReturnType<typeof repositories.getCyclingActivityRepository>
        );

      await saveActivityStreams('test-user', 'act-1', {
        activityId: 'act-1',
        stravaActivityId: 12345,
        watts: [100, 120],
        heartrate: [130, 132],
        sampleCount: 2,
      });
      const streams = await getActivityStreams('test-user', 'act-1');

      expect(repository.saveStreams).toHaveBeenCalledWith('test-user', 'act-1', {
        activityId: 'act-1',
        stravaActivityId: 12345,
        watts: [100, 120],
        heartrate: [130, 132],
        sampleCount: 2,
      });
      expect(streams?.activityId).toBe('act-1');
      expect(repository.getStreams).toHaveBeenCalledWith('test-user', 'act-1');
      repoSpy.mockRestore();
    });

    it('should only log update when activity update succeeds', async () => {
      const repository = {
        findAllByUser: vi.fn(),
        findById: vi.fn(),
        findByStravaId: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        saveStreams: vi.fn(),
        getStreams: vi.fn(),
        update: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      };

      const repoSpy = vi
        .spyOn(repositories, 'getCyclingActivityRepository')
        .mockReturnValue(
          repository as unknown as ReturnType<typeof repositories.getCyclingActivityRepository>
        );

      const first = await updateCyclingActivity('test-user', 'act-1', { ef: 1.31 });
      const second = await updateCyclingActivity('test-user', 'act-2', { ef: 1.22 });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(repository.update).toHaveBeenCalledTimes(2);
      repoSpy.mockRestore();
    });
  });

  describe('additional Firestore mapping branches', () => {
    it('returns null when FTP snapshot has no first document', async () => {
      mockGet.mockResolvedValueOnce({ empty: false, docs: [] });

      const result = await getCurrentFTP('test-user');
      expect(result).toBeNull();
    });

    it('maps FTP history entries', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          {
            id: 'ftp-a',
            data: (): Record<string, unknown> => ({
              userId: 'test-user',
              value: 280,
              date: '2026-02-10',
              source: 'test',
            }),
          },
          {
            id: 'ftp-b',
            data: (): Record<string, unknown> => ({
              userId: 'test-user',
              value: 270,
              date: '2026-01-20',
              source: 'manual',
            }),
          },
        ],
      });

      const result = await getFTPHistory('test-user');

      expect(result).toEqual([
        { id: 'ftp-a', userId: 'test-user', value: 280, date: '2026-02-10', source: 'test' },
        { id: 'ftp-b', userId: 'test-user', value: 270, date: '2026-01-20', source: 'manual' },
      ]);
    });

    it('returns null when active block snapshot has no document entry', async () => {
      mockGet.mockResolvedValueOnce({ empty: false, docs: [] });
      const result = await getCurrentTrainingBlock('test-user');
      expect(result).toBeNull();
    });

    it('maps training block list response', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          {
            id: 'block-a',
            data: (): Record<string, unknown> => ({
              userId: 'test-user',
              startDate: '2026-01-01',
              endDate: '2026-02-20',
              currentWeek: 3,
              goals: ['regain_fitness'],
              status: 'active',
            }),
          },
        ],
      });

      const result = await getTrainingBlocks('test-user');
      expect(result[0]).toEqual({
        id: 'block-a',
        userId: 'test-user',
        startDate: '2026-01-01',
        endDate: '2026-02-20',
        currentWeek: 3,
        goals: ['regain_fitness'],
        status: 'active',
      });
    });

    it('completes and updates training block week when doc exists', async () => {
      mockGet.mockResolvedValue({ exists: true });

      const completed = await completeTrainingBlock('test-user', 'block-1');
      const updated = await updateTrainingBlockWeek('test-user', 'block-1', 4);

      expect(completed).toBe(true);
      expect(updated).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'completed' });
      expect(mockUpdate).toHaveBeenCalledWith({ currentWeek: 4 });
    });

    it('returns false for completion/week updates when block doc is missing', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const completed = await completeTrainingBlock('test-user', 'missing-block');
      const updated = await updateTrainingBlockWeek('test-user', 'missing-block', 5);

      expect(completed).toBe(false);
      expect(updated).toBe(false);
    });

    it('returns null for weight goal when settings doc has no data', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): undefined => undefined,
      });

      const result = await getWeightGoal('test-user');
      expect(result).toBeNull();
    });

    it('sets and returns weight goal payload', async () => {
      const goal = await setWeightGoal('test-user', {
        targetWeightLbs: 175,
        targetDate: '2026-06-01',
        startWeightLbs: 190,
        startDate: '2026-01-01',
      });

      expect(mockSet).toHaveBeenCalledWith({
        userId: 'test-user',
        targetWeightLbs: 175,
        targetDate: '2026-06-01',
        startWeightLbs: 190,
        startDate: '2026-01-01',
      });
      expect(goal.targetWeightLbs).toBe(175);
    });

    it('returns null for Strava tokens when doc exists but data is absent', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): undefined => undefined,
      });
      const result = await getStravaTokens('test-user');
      expect(result).toBeNull();
    });

    it('writes and reads athlete-to-user mapping', async () => {
      await setAthleteToUserMapping(12345, 'test-user');
      expect(mockSet).toHaveBeenCalledWith({ userId: 'test-user' });

      mockGet.mockResolvedValueOnce({
        exists: true,
        data: (): Record<string, unknown> => ({ userId: 'test-user' }),
      });
      const resolved = await getUserIdByAthleteId(12345);
      expect(resolved).toBe('test-user');
    });

    it('returns null for athlete mapping when doc is missing or empty', async () => {
      mockGet
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true, data: (): undefined => undefined });

      const missing = await getUserIdByAthleteId(1);
      const empty = await getUserIdByAthleteId(2);

      expect(missing).toBeNull();
      expect(empty).toBeNull();
    });

    it('saves VO2 max estimate including optional activityId', async () => {
      const estimate = await saveVO2MaxEstimate('test-user', {
        userId: 'test-user',
        date: '2026-02-10',
        value: 53.2,
        method: 'peak_20min',
        sourcePower: 310,
        sourceWeight: 74,
        activityId: 'act-2',
        createdAt: '2026-02-10T10:00:00.000Z',
      });

      expect(estimate.id).toBe('test-uuid-1234');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: 'act-2',
          value: 53.2,
        }),
      );
    });

    it('returns null when latest VO2 max snapshot has no first document', async () => {
      mockGet.mockResolvedValueOnce({ empty: false, docs: [] });
      const result = await getLatestVO2Max('test-user');
      expect(result).toBeNull();
    });

    it('maps latest and historical VO2 max responses', async () => {
      mockGet
        .mockResolvedValueOnce({
          empty: false,
          docs: [
            {
              id: 'vo2-latest',
              data: (): Record<string, unknown> => ({
                userId: 'test-user',
                date: '2026-02-10',
                value: 53,
                method: 'ftp_derived',
                sourcePower: 300,
                sourceWeight: 74,
                createdAt: '2026-02-10T12:00:00.000Z',
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          docs: [
            {
              id: 'vo2-1',
              data: (): Record<string, unknown> => ({
                userId: 'test-user',
                date: '2026-02-10',
                value: 53,
                method: 'ftp_derived',
                sourcePower: 300,
                sourceWeight: 74,
                createdAt: '2026-02-10T12:00:00.000Z',
              }),
            },
            {
              id: 'vo2-2',
              data: (): Record<string, unknown> => ({
                userId: 'test-user',
                date: '2026-01-15',
                value: 51,
                method: 'ftp_derived',
                sourcePower: 290,
                sourceWeight: 74,
                createdAt: '2026-01-15T12:00:00.000Z',
              }),
            },
          ],
        });

      const latest = await getLatestVO2Max('test-user');
      const history = await getVO2MaxHistory('test-user', 2);

      expect(latest?.id).toBe('vo2-latest');
      expect(history).toHaveLength(2);
      expect(history[1]?.value).toBe(51);
    });

    it('handles null cycling profile and merges updates when setting profile', async () => {
      mockGet
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true, data: (): undefined => undefined });

      const missing = await getCyclingProfile('test-user');
      const empty = await getCyclingProfile('test-user');
      const saved = await setCyclingProfile('test-user', {
        weightKg: 75,
        maxHR: 188,
      });

      expect(missing).toBeNull();
      expect(empty).toBeNull();
      expect(mockSet).toHaveBeenCalledWith(
        { userId: 'test-user', weightKg: 75, maxHR: 188 },
        { merge: true },
      );
      expect(saved).toEqual({ userId: 'test-user', weightKg: 75, maxHR: 188 });
    });
  });
});
