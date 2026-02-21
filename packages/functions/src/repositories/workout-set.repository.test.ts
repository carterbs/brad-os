import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('WorkoutSetRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let mockWorkoutsCollection: Partial<CollectionReference>;
  let WorkoutSetRepository: typeof import('./workout-set.repository.js').WorkoutSetRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDocRef = mocks.mockDocRef;
    mockCollection = mocks.mockCollection;

    mockWorkoutsCollection = {
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(createMockDoc('w-1', null)),
      }),
    };

    mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name.includes('workouts')) {
          return mockWorkoutsCollection;
        }
        return mockCollection;
      }),
    };
    mocks.mockDb = mockDb;

    setupFirebaseMock(mocks);

    const module = await import('./workout-set.repository.js');
    WorkoutSetRepository = module.WorkoutSetRepository;
  });

  describe('create', () => {
    it('should create workout set with generated id and pending status', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'set-1' });

      const result = await repository.create({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
      });

      expect(mockCollection.add).toHaveBeenCalledWith({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      });
      expect(result.id).toBe('set-1');
      expect(result.status).toBe('pending');
    });

    it('should set actual_reps and actual_weight to null on creation', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'set-2' });

      const result = await repository.create({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 2,
        target_reps: 8,
        target_weight: 135,
      });

      expect(result.actual_reps).toBeNull();
      expect(result.actual_weight).toBeNull();
    });

    it('should preserve set_number from input', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'set-3' });

      const result = await repository.create({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 3,
        target_reps: 12,
        target_weight: 80,
      });

      expect(result.set_number).toBe(3);
    });
  });

  describe('findById', () => {
    it('should return workout set when found', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const setData = {
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('set-1', setData));

      const result = await repository.findById('set-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('set-1');
      expect(result).toEqual({
        id: 'set-1',
        ...setData,
      });
    });

    it('should return null when workout set not found', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByWorkoutId', () => {
    it('should return sets for workout ordered by exercise_id and set_number', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
        { id: 's-2', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 2, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByWorkoutId('w-1');

      expect(mockCollection.where).toHaveBeenCalledWith('workout_id', '==', 'w-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no sets found', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByWorkoutId('w-empty');

      expect(result).toEqual([]);
    });
  });

  describe('findByWorkoutAndExercise', () => {
    it('should return sets for specific workout and exercise', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
        { id: 's-2', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 2, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByWorkoutAndExercise('w-1', 'ex-1');

      expect(mockCollection.where).toHaveBeenCalledWith('workout_id', '==', 'w-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('findByStatus', () => {
    it('should return sets with pending status', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('pending');

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'pending');
      expect(result).toHaveLength(1);
    });

    it('should return sets with completed status', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: 10, actual_weight: 100, status: 'completed' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('completed');

      expect(result[0]?.status).toBe('completed');
    });

    it('should return sets with skipped status', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'skipped' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByStatus('skipped');

      expect(result[0]?.status).toBe('skipped');
    });
  });

  describe('findAll', () => {
    it('should return all sets ordered by workout_id, exercise_id, set_number', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
        { id: 's-2', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 2, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'pending' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('workout_id');
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update actual_reps', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, actual_reps: 10 }));

      const result = await repository.update('set-1', { actual_reps: 10 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        actual_reps: 10,
      });
      expect(result?.actual_reps).toBe(10);
    });

    it('should update actual_weight', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, actual_weight: 105 }));

      const result = await repository.update('set-1', { actual_weight: 105 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        actual_weight: 105,
      });
      expect(result?.actual_weight).toBe(105);
    });

    it('should update status', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, status: 'completed' }));

      const result = await repository.update('set-1', { status: 'completed' });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'completed',
      });
      expect(result?.status).toBe('completed');
    });

    it('should update target_reps', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, target_reps: 12 }));

      const result = await repository.update('set-1', { target_reps: 12 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        target_reps: 12,
      });
      expect(result?.target_reps).toBe(12);
    });

    it('should update target_weight', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, target_weight: 110 }));

      const result = await repository.update('set-1', { target_weight: 110 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        target_weight: 110,
      });
      expect(result?.target_weight).toBe(110);
    });

    it('should update multiple fields at once', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('set-1', existingData))
        .mockResolvedValueOnce(createMockDoc('set-1', { ...existingData, actual_reps: 10, actual_weight: 100, status: 'completed' }));

      const result = await repository.update('set-1', {
        actual_reps: 10,
        actual_weight: 100,
        status: 'completed',
      });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        actual_reps: 10,
        actual_weight: 100,
        status: 'completed',
      });
      expect(result?.actual_reps).toBe(10);
      expect(result?.actual_weight).toBe(100);
      expect(result?.status).toBe('completed');
    });

    it('should return null when updating non-existent set', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { actual_reps: 10 });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing set when no updates provided', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('set-1', existingData));

      const result = await repository.update('set-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'set-1', ...existingData });
    });
  });

  describe('delete', () => {
    it('should delete existing set and return true', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const existingData = {
        workout_id: 'w-1',
        exercise_id: 'ex-1',
        set_number: 1,
        target_reps: 10,
        target_weight: 100,
        actual_reps: null,
        actual_weight: null,
        status: 'pending',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('set-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('set-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent set', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('findCompletedByExerciseId', () => {
    it('should return completed sets for exercise with workout details', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: 10, actual_weight: 100, status: 'completed' } },
      ];

      const workoutData = {
        scheduled_date: '2024-01-15',
        completed_at: '2024-01-15T11:00:00Z',
        week_number: 1,
        mesocycle_id: 'meso-1',
        status: 'completed',
      };

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      (mockWorkoutsCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockResolvedValue(createMockDoc('w-1', workoutData)),
      });

      const result = await repository.findCompletedByExerciseId('ex-1');

      expect(mockCollection.where).toHaveBeenCalledWith('exercise_id', '==', 'ex-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.scheduled_date).toBe('2024-01-15');
      expect(result[0]?.mesocycle_id).toBe('meso-1');
    });

    it('should return empty array when no completed sets', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findCompletedByExerciseId('ex-empty');

      expect(result).toEqual([]);
    });

    it('should filter out sets with null actual values', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: null, actual_weight: null, status: 'completed' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findCompletedByExerciseId('ex-1');

      expect(result).toEqual([]);
    });

    it('should only include sets from completed workouts', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: 10, actual_weight: 100, status: 'completed' } },
      ];

      const workoutData = {
        scheduled_date: '2024-01-15',
        completed_at: null,
        week_number: 1,
        mesocycle_id: 'meso-1',
        status: 'in_progress', // Not completed
      };

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      (mockWorkoutsCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockResolvedValue(createMockDoc('w-1', workoutData)),
      });

      const result = await repository.findCompletedByExerciseId('ex-1');

      // Should be empty because workout is not completed
      expect(result).toEqual([]);
    });

    it('should sort results by completed_at, scheduled_date, set_number', async () => {
      const repository = new WorkoutSetRepository(mockDb as Firestore);
      const sets = [
        { id: 's-2', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 2, target_reps: 10, target_weight: 100, actual_reps: 10, actual_weight: 100, status: 'completed' } },
        { id: 's-1', data: { workout_id: 'w-1', exercise_id: 'ex-1', set_number: 1, target_reps: 10, target_weight: 100, actual_reps: 10, actual_weight: 100, status: 'completed' } },
      ];

      const workoutData = {
        scheduled_date: '2024-01-15',
        completed_at: '2024-01-15T11:00:00Z',
        week_number: 1,
        mesocycle_id: 'meso-1',
        status: 'completed',
      };

      const mockQuery = createMockQuery(createMockQuerySnapshot(sets));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      (mockWorkoutsCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockResolvedValue(createMockDoc('w-1', workoutData)),
      });

      const result = await repository.findCompletedByExerciseId('ex-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.set_number).toBe(1);
      expect(result[1]?.set_number).toBe(2);
    });
  });
});
