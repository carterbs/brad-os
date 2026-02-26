import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import type { CyclingActivity, ActivityStreamData, CyclingActivityUpdate } from '../types/cycling.js';
import { createFirestoreMocks, setupFirebaseMock } from '../test-utils/index.js';

describe('CyclingActivityRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockStreamsDoc: Partial<DocumentReference>;
  let mockStreamsCollection: Partial<CollectionReference>;
  let mockActivityDoc: Partial<DocumentReference>;
  let mockActivitiesCollection: Partial<CollectionReference>;
  let mockUserDoc: Partial<DocumentReference>;
  let mockUsersCollection: Partial<CollectionReference>;
  let repositoryClass: typeof import('./cycling-activity.repository.js').CyclingActivityRepository;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockStreamsDoc = {};
    mockStreamsCollection = {};
    mockActivityDoc = {};
    mockActivitiesCollection = {};
    mockUserDoc = {};
    mockUsersCollection = mocks.mockCollection;

    mockDb.collection = vi.fn(() => mockUsersCollection);
    mockUsersCollection.doc = vi.fn(() => mockUserDoc);
    mockUserDoc.collection = vi.fn(() => mockActivitiesCollection);
    mockActivitiesCollection.doc = vi.fn(() => mockActivityDoc);
    mockActivitiesCollection.orderBy = vi.fn().mockReturnThis();
    mockActivitiesCollection.where = vi.fn().mockReturnThis();
    mockActivityDoc.collection = vi.fn(() => mockStreamsCollection);
    mockStreamsCollection.doc = vi.fn(() => mockStreamsDoc);

    mockStreamsDoc.get = vi.fn();
    mockStreamsDoc.set = vi.fn().mockResolvedValue(undefined);
    mockStreamsDoc.delete = vi.fn().mockResolvedValue(undefined);

    mockActivityDoc.get = vi.fn();
    mockActivityDoc.set = vi.fn().mockResolvedValue(undefined);
    mockActivityDoc.update = vi.fn().mockResolvedValue(undefined);
    mockActivityDoc.delete = vi.fn().mockResolvedValue(undefined);

    setupFirebaseMock(mocks);

    const module = await import('./cycling-activity.repository.js');
    repositoryClass = module.CyclingActivityRepository;
  });

  describe('findAllByUser', () => {
    it('should fetch cycling activities from user subcollection', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockActivityData = {
        stravaId: 123,
        userId: 'user-1',
        date: '2026-02-20',
        durationMinutes: 60,
        avgPower: 200,
        normalizedPower: 210,
        maxPower: 350,
        avgHeartRate: 150,
        maxHeartRate: 175,
        tss: 80,
        intensityFactor: 0.85,
        type: 'vo2max' as const,
        source: 'strava' as const,
        createdAt: '2026-02-20T12:00:00.000Z',
      };

      const mockDocs = [
        {
          id: 'activity-1',
          data: (): Record<string, unknown> => mockActivityData,
        },
      ];

      const mockQuery = {
        orderBy: vi.fn(),
        limit: vi.fn(),
        get: vi.fn().mockResolvedValue({ docs: mockDocs }),
      };

      // Setup the chain
      (mockActivitiesCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      (mockQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAllByUser('user-1', 10);

      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe('activity-1');
      expect(result[0]?.stravaId).toBe(123);
      expect(mockUsersCollection.doc).toHaveBeenCalledWith('user-1');
    });

    it('should return empty array when no activities exist', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockQuery = {
        orderBy: vi.fn(),
        get: vi.fn().mockResolvedValue({ docs: [] }),
      };

      (mockActivitiesCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAllByUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return mapped CyclingActivity when doc exists', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockActivityData: Record<string, unknown> = {
        stravaId: 456,
        userId: 'user-1',
        date: '2026-02-19',
        durationMinutes: 45,
        avgPower: 180,
        normalizedPower: 190,
        maxPower: 320,
        avgHeartRate: 140,
        maxHeartRate: 165,
        tss: 70,
        intensityFactor: 0.8,
        type: 'threshold',
        source: 'strava',
        ef: 1.35,
        peak5MinPower: 400,
        peak20MinPower: 350,
        hrCompleteness: 95,
        createdAt: '2026-02-19T12:00:00.000Z',
      };

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        id: 'activity-2',
        data: (): Record<string, unknown> => mockActivityData,
      });

      const result = await repository.findById('user-1', 'activity-2');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('activity-2');
      expect(result?.stravaId).toBe(456);
      expect(result?.ef).toBe(1.35);
      expect(result?.peak5MinPower).toBe(400);
    });

    it('should map legacy virtual activity type to unknown', async (): Promise<void> => {
      const repository = new CyclingActivityRepository(mockDb as Firestore);

      const mockActivityData: Record<string, unknown> = {
        stravaId: 333,
        userId: 'user-1',
        date: '2026-02-15',
        durationMinutes: 30,
        avgPower: 150,
        normalizedPower: 160,
        maxPower: 280,
        avgHeartRate: 130,
        maxHeartRate: 155,
        tss: 40,
        intensityFactor: 0.7,
        type: 'virtual',
        source: 'strava',
        createdAt: '2026-02-15T12:00:00.000Z',
      };

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        id: 'activity-legacy',
        data: (): Record<string, unknown> => mockActivityData,
      });

      const result = await repository.findById('user-1', 'activity-legacy');

      expect(result?.type).toBe('unknown');
    });

    it('should return null when doc does not exist', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: false,
      });

      const result = await repository.findById('user-1', 'missing-id');

      expect(result).toBeNull();
    });

    it('should return null when doc data is empty', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        data: (): undefined => undefined,
      });

      const result = await repository.findById('user-1', 'activity-3');

      expect(result).toBeNull();
    });

    it('should return null when doc payload is malformed', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        data: (): Record<string, unknown> => ({
          stravaId: 'bad',
          userId: 'user-1',
          date: 2026,
          durationMinutes: '60',
          avgPower: 200,
          normalizedPower: 210,
          maxPower: 350,
          avgHeartRate: 150,
          maxHeartRate: 175,
          tss: 80,
          intensityFactor: 0.85,
          type: 'vo2max',
          source: 'strava',
          createdAt: '2026-02-20T12:00:00.000Z',
        }),
      });

      const result = await repository.findById('user-1', 'activity-invalid');

      expect(result).toBeNull();
    });
  });

  describe('findByStravaId', () => {
    it('should query activities by Strava ID', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockActivityData: Record<string, unknown> = {
        stravaId: 789,
        userId: 'user-1',
        date: '2026-02-18',
        durationMinutes: 90,
        avgPower: 220,
        normalizedPower: 230,
        maxPower: 380,
        avgHeartRate: 155,
        maxHeartRate: 180,
        tss: 100,
        intensityFactor: 0.9,
        type: 'vo2max',
        source: 'strava',
        createdAt: '2026-02-18T12:00:00.000Z',
      };

      const mockDocs = [
        {
          id: 'activity-4',
          data: (): Record<string, unknown> => mockActivityData,
        },
      ];

      const mockQuery = {
        where: vi.fn(),
        limit: vi.fn(),
        get: vi.fn().mockResolvedValue({ empty: false, docs: mockDocs }),
      };

      (mockActivitiesCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      (mockQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStravaId('user-1', 789);

      expect(result?.id).toBe('activity-4');
      expect(result?.stravaId).toBe(789);
    });

    it('should return null when no results found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockQuery = {
        where: vi.fn(),
        limit: vi.fn(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      };

      (mockActivitiesCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      (mockQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStravaId('user-1', 999);

      expect(result).toBeNull();
    });

    it('should return null when matched document payload is malformed', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockActivityData: Record<string, unknown> = {
        stravaId: 789,
        userId: 'user-1',
        date: '2026-02-18',
        durationMinutes: 90,
        avgPower: 220,
        normalizedPower: 230,
        maxPower: 380,
        avgHeartRate: '155',
        maxHeartRate: 180,
        tss: 100,
        intensityFactor: 0.9,
        type: 'vo2max',
        source: 'strava',
        createdAt: '2026-02-18T12:00:00.000Z',
      };

      const mockQuery = {
        where: vi.fn(),
        limit: vi.fn(),
        get: vi.fn().mockResolvedValue({ empty: false, docs: [{ id: 'activity-bad', data: (): Record<string, unknown> => mockActivityData }] }),
      };

      (mockActivitiesCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
      (mockQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStravaId('user-1', 789);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create activity with required and optional fields', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const activityInput: Omit<CyclingActivity, 'id'> = {
        stravaId: 111,
        userId: 'user-1',
        date: '2026-02-17',
        durationMinutes: 60,
        avgPower: 200,
        normalizedPower: 210,
        maxPower: 350,
        avgHeartRate: 150,
        maxHeartRate: 175,
        tss: 80,
        intensityFactor: 0.85,
        type: 'recovery',
        source: 'strava',
        ef: 1.3,
        peak5MinPower: 380,
        peak20MinPower: 340,
        hrCompleteness: 90,
        createdAt: '2026-02-17T12:00:00.000Z',
      };

      const result = await repository.create('user-1', activityInput);

      expect(result.id).toBeDefined();
      expect(result.stravaId).toBe(111);
      expect(result.ef).toBe(1.3);
      expect((mockActivityDoc.set as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('should omit optional fields when undefined', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const activityInput: Omit<CyclingActivity, 'id'> = {
        stravaId: 222,
        userId: 'user-1',
        date: '2026-02-16',
        durationMinutes: 45,
        avgPower: 180,
        normalizedPower: 190,
        maxPower: 320,
        avgHeartRate: 140,
        maxHeartRate: 165,
        tss: 70,
        intensityFactor: 0.8,
        type: 'threshold',
        source: 'strava',
        createdAt: '2026-02-16T12:00:00.000Z',
      };

      await repository.create('user-1', activityInput);

      const callArgs = (mockActivityDoc.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs).not.toHaveProperty('ef');
      expect(callArgs).not.toHaveProperty('peak5MinPower');
    });
  });

  describe('update', () => {
    it('should return false when activity not found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: false,
      });

      const result = await repository.update('user-1', 'missing-id', { ef: 1.4 });

      expect(result).toBe(false);
    });

    it('should update activity when found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
      });

      const updates: CyclingActivityUpdate = { ef: 1.4, peak5MinPower: 420 };
      const result = await repository.update('user-1', 'activity-5', updates);

      expect((mockActivityDoc.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(updates);
      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should return false when activity not found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: false,
      });

      const result = await repository.delete('user-1', 'missing-id');

      expect(result).toEqual({ deleted: false, hadStreams: false });
    });

    it('should delete activity and streams', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
      });

      (mockStreamsDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
      });

      const result = await repository.delete('user-1', 'activity-6');

      expect((mockStreamsDoc.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect((mockActivityDoc.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, hadStreams: true });
    });

    it('should delete activity even when streams not found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockActivityDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
      });

      (mockStreamsDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: false,
      });

      const result = await repository.delete('user-1', 'activity-7');

      expect((mockActivityDoc.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, hadStreams: false });
    });
  });

  describe('saveStreams', () => {
    it('should save stream data with createdAt timestamp', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const streamInput: Omit<ActivityStreamData, 'createdAt'> = {
        activityId: 'activity-8',
        stravaActivityId: 444,
        watts: [100, 110, 120],
        heartrate: [150, 155, 160],
        time: [0, 1, 2],
        cadence: [80, 85, 90],
        sampleCount: 3,
      };

      const result = await repository.saveStreams('user-1', 'activity-8', streamInput);

      expect(result.activityId).toBe('activity-8');
      expect(result.createdAt).toBeDefined();
      expect((mockStreamsDoc.set as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  describe('getStreams', () => {
    it('should return stream data when exists', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockStreamData: Record<string, unknown> = {
        activityId: 'activity-9',
        stravaActivityId: 555,
        watts: [200, 210, 220],
        heartrate: [160, 165, 170],
        time: [0, 1, 2],
        cadence: [90, 95, 100],
        sampleCount: 3,
        createdAt: '2026-02-14T12:00:00.000Z',
      };

      (mockStreamsDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        data: (): Record<string, unknown> => mockStreamData,
      });

      const result = await repository.getStreams('user-1', 'activity-9');

      expect(result?.activityId).toBe('activity-9');
      expect(result?.watts).toEqual([200, 210, 220]);
    });

    it('should return null when stream doc not found', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockStreamsDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: false,
      });

      const result = await repository.getStreams('user-1', 'missing-activity');

      expect(result).toBeNull();
    });

    it('should return null when stream payload is malformed', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      (mockStreamsDoc.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        data: (): Record<string, unknown> => ({
          activityId: 'activity-9',
          stravaActivityId: 555,
          watts: [200, 210, 220],
          heartrate: [160, 165, 170],
          time: [0, 1, 2],
          cadence: ['90', 95, 100],
          sampleCount: 3,
          createdAt: '2026-02-14T12:00:00.000Z',
        }),
      });

      const result = await repository.getStreams('user-1', 'activity-9');

      expect(result).toBeNull();
    });
  });

  describe('user-scoped path resolution', () => {
    it('should use getCollectionName for users collection', async (): Promise<void> => {
      const repository = new repositoryClass(mockDb as Firestore);

      const mockQuery = {
        orderBy: vi.fn(),
        get: vi.fn().mockResolvedValue({ docs: [] }),
      };

      (mockActivitiesCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findAllByUser('test-user-123');

      expect(mockDb.collection).toHaveBeenCalledWith('test_users');
      expect(mockUsersCollection.doc).toHaveBeenCalledWith('test-user-123');
    });
  });
});
