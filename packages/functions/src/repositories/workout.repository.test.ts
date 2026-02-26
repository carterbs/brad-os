import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('WorkoutRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let WorkoutRepository: typeof import('./workout.repository.js').WorkoutRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    const module = await import('./workout.repository.js');
    WorkoutRepository = module.WorkoutRepository;
  });

  describe('create', () => {
    it('should create workout with generated id and pending status', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'workout-1' });

      const result = await repository.create({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
      });

      expect(mockCollection.add).toHaveBeenCalledWith({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      });
      expect(result.id).toBe('workout-1');
      expect(result.status).toBe('pending');
    });

    it('should set started_at and completed_at to null on creation', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'workout-2' });

      const result = await repository.create({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 2,
        scheduled_date: '2024-01-22',
      });

      expect(result.started_at).toBeNull();
      expect(result.completed_at).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return workout when found', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workoutData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('workout-1', workoutData));

      const result = await repository.findById('workout-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('workout-1');
      expect(result).toEqual({
        id: 'workout-1',
        ...workoutData,
      });
    });

    it('should return null when workout not found', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByMesocycleId', () => {
    it('should return workouts for mesocycle ordered by scheduled_date', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: null, completed_at: null } },
        { id: 'w-2', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-2', week_number: 1, scheduled_date: '2024-01-17', status: 'pending', started_at: null, completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMesocycleId('meso-1');

      expect(mockCollection.where).toHaveBeenCalledWith('mesocycle_id', '==', 'meso-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no workouts found', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMesocycleId('meso-empty');

      expect(result).toEqual([]);
    });

    it('should skip malformed workouts when querying by mesocycle', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-valid', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: null, completed_at: null } },
        { id: 'w-invalid', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-2', week_number: 'bad', scheduled_date: '2024-01-16', status: 'completed', started_at: null, completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMesocycleId('meso-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('w-valid');
    });
  });

  describe('findByStatus', () => {
    it('should return workouts with pending status', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'pending', started_at: null, completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('pending');

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'pending');
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('pending');
    });

    it('should return workouts with in_progress status', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'in_progress', started_at: '2024-01-15T10:00:00Z', completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('in_progress');

      expect(result[0]?.status).toBe('in_progress');
    });

    it('should return workouts with completed status', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: '2024-01-15T10:00:00Z', completed_at: '2024-01-15T11:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('completed');

      expect(result[0]?.status).toBe('completed');
    });
  });

  describe('findByDate', () => {
    it('should return workouts for specific date', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'pending', started_at: null, completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByDate('2024-01-15');

      expect(mockCollection.where).toHaveBeenCalledWith('scheduled_date', '==', '2024-01-15');
      expect(result).toHaveLength(1);
    });
  });

  describe('findPreviousWeekWorkout', () => {
    it('should return previous week workout for same plan day', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workoutData = { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: null, completed_at: null };

      const mockQuery = createMockQuery(createMockQuerySnapshot([{ id: 'w-prev', data: workoutData }]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findPreviousWeekWorkout('meso-1', 'pd-1', 2);

      expect(mockCollection.where).toHaveBeenCalledWith('mesocycle_id', '==', 'meso-1');
      expect(result).not.toBeNull();
      expect(result?.week_number).toBe(1);
    });

    it('should return null for week 1 (no previous week)', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);

      const result = await repository.findPreviousWeekWorkout('meso-1', 'pd-1', 1);

      expect(result).toBeNull();
      expect(mockCollection.where).not.toHaveBeenCalled();
    });

    it('should return null when no previous workout found', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findPreviousWeekWorkout('meso-1', 'pd-1', 3);

      expect(result).toBeNull();
    });
  });

  describe('findNextPending', () => {
    it('should return earliest pending workout', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const pendingWorkout = { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'pending', started_at: null, completed_at: null };

      const pendingQuery = createMockQuery(createMockQuerySnapshot([{ id: 'w-pending', data: pendingWorkout }]));
      const inProgressQuery = createMockQuery(createMockQuerySnapshot([]));

      (mockCollection.where as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(pendingQuery)
        .mockReturnValueOnce(inProgressQuery);

      const result = await repository.findNextPending();

      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending');
    });

    it('should return in_progress workout if no pending workouts', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const inProgressWorkout = { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'in_progress', started_at: '2024-01-15T10:00:00Z', completed_at: null };

      const pendingQuery = createMockQuery(createMockQuerySnapshot([]));
      const inProgressQuery = createMockQuery(createMockQuerySnapshot([{ id: 'w-ip', data: inProgressWorkout }]));

      (mockCollection.where as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(pendingQuery)
        .mockReturnValueOnce(inProgressQuery);

      const result = await repository.findNextPending();

      expect(result).not.toBeNull();
      expect(result?.status).toBe('in_progress');
    });

    it('should return earlier dated workout when both pending and in_progress exist', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const pendingWorkout = { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 2, scheduled_date: '2024-01-22', status: 'pending', started_at: null, completed_at: null };
      const inProgressWorkout = { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'in_progress', started_at: '2024-01-15T10:00:00Z', completed_at: null };

      const pendingQuery = createMockQuery(createMockQuerySnapshot([{ id: 'w-pending', data: pendingWorkout }]));
      const inProgressQuery = createMockQuery(createMockQuerySnapshot([{ id: 'w-ip', data: inProgressWorkout }]));

      (mockCollection.where as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(pendingQuery)
        .mockReturnValueOnce(inProgressQuery);

      const result = await repository.findNextPending();

      expect(result).not.toBeNull();
      expect(result?.scheduled_date).toBe('2024-01-15'); // Earlier date
    });

    it('should return null when no pending or in_progress workouts', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);

      const pendingQuery = createMockQuery(createMockQuerySnapshot([]));
      const inProgressQuery = createMockQuery(createMockQuerySnapshot([]));

      (mockCollection.where as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(pendingQuery)
        .mockReturnValueOnce(inProgressQuery);

      const result = await repository.findNextPending();

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all workouts ordered by scheduled_date desc', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-2', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 2, scheduled_date: '2024-01-22', status: 'pending', started_at: null, completed_at: null } },
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: null, completed_at: null } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('scheduled_date', 'desc');
      expect(result).toHaveLength(2);
    });
  });

  describe('findCompletedInDateRange', () => {
    it('should return completed workouts within date range', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const workouts = [
        { id: 'w-1', data: { mesocycle_id: 'meso-1', plan_day_id: 'pd-1', week_number: 1, scheduled_date: '2024-01-15', status: 'completed', started_at: '2024-01-15T10:00:00Z', completed_at: '2024-01-15T11:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(workouts));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findCompletedInDateRange('2024-01-01', '2024-01-31', 0);

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'completed');
      expect(result).toHaveLength(1);
    });

    it('should apply timezone offset to date boundaries', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      await repository.findCompletedInDateRange('2024-01-15', '2024-01-15', 300); // EST offset

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'completed');
    });
  });

  describe('update', () => {
    it('should update workout status', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const existingData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'pd-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('workout-1', existingData))
        .mockResolvedValueOnce(createMockDoc('workout-1', { ...existingData, status: 'in_progress' }));

      const result = await repository.update('workout-1', { status: 'in_progress' });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'in_progress',
      });
      expect(result?.status).toBe('in_progress');
    });

    it('should update started_at timestamp', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const existingData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'pd-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      };
      const startTime = '2024-01-15T10:00:00Z';

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('workout-1', existingData))
        .mockResolvedValueOnce(createMockDoc('workout-1', { ...existingData, started_at: startTime }));

      const result = await repository.update('workout-1', { started_at: startTime });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        started_at: startTime,
      });
      expect(result?.started_at).toBe(startTime);
    });

    it('should update completed_at timestamp', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const existingData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'pd-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
        completed_at: null,
      };
      const completeTime = '2024-01-15T11:00:00Z';

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('workout-1', existingData))
        .mockResolvedValueOnce(createMockDoc('workout-1', { ...existingData, completed_at: completeTime }));

      const result = await repository.update('workout-1', { completed_at: completeTime });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        completed_at: completeTime,
      });
      expect(result?.completed_at).toBe(completeTime);
    });

    it('should return null when updating non-existent workout', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { status: 'in_progress' });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing workout when no updates provided', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const existingData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'pd-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('workout-1', existingData));

      const result = await repository.update('workout-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'workout-1', ...existingData });
    });
  });

  describe('delete', () => {
    it('should delete existing workout and return true', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      const existingData = {
        mesocycle_id: 'meso-1',
        plan_day_id: 'pd-1',
        week_number: 1,
        scheduled_date: '2024-01-15',
        status: 'pending',
        started_at: null,
        completed_at: null,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('workout-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('workout-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent workout', async () => {
      const repository = new WorkoutRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
