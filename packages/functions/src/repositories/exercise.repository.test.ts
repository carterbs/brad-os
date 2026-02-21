import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('ExerciseRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let ExerciseRepository: typeof import('./exercise.repository.js').ExerciseRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    const module = await import('./exercise.repository.js');
    ExerciseRepository = module.ExerciseRepository;
  });

  describe('create', () => {
    it('should insert exercise with generated id', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-exercise-id' });

      const result = await repository.create({
        name: 'Bench Press',
        weight_increment: 5,
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bench Press',
          weight_increment: 5,
          is_custom: false,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.id).toBe('new-exercise-id');
      expect(result.name).toBe('Bench Press');
      expect(result.weight_increment).toBe(5);
    });

    it('should use default weight increment if not provided', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-id' });

      const result = await repository.create({
        name: 'Squat',
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Squat',
          weight_increment: 5.0,
        })
      );
      expect(result.weight_increment).toBe(5.0);
    });

    it('should set timestamps on creation', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-id' });

      const result = await repository.create({
        name: 'Deadlift',
        weight_increment: 10,
      });

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.created_at).toBe(result.updated_at);
    });

    it('should mark exercise as custom when is_custom is true', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'custom-id' });

      const result = await repository.create({
        name: 'Custom Exercise',
        weight_increment: 2.5,
        is_custom: true,
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          is_custom: true,
        })
      );
      expect(result.is_custom).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return exercise when found', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const exerciseData = {
        name: 'Bench Press',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('exercise-1', exerciseData));

      const result = await repository.findById('exercise-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('exercise-1');
      expect(result).toEqual({
        id: 'exercise-1',
        ...exerciseData,
      });
    });

    it('should return null when exercise not found', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return exercise when found by name', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const exerciseData = {
        name: 'Squat',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockQuery = createMockQuery(
        createMockQuerySnapshot([{ id: 'squat-id', data: exerciseData }])
      );
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByName('Squat');

      expect(mockCollection.where).toHaveBeenCalledWith('name', '==', 'Squat');
      expect(result).toEqual({
        id: 'squat-id',
        ...exerciseData,
      });
    });

    it('should return null when not found by name', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByName('Non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all exercises ordered by name', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const exercises = [
        { id: 'ex-1', data: { name: 'Bench Press', weight_increment: 5, is_custom: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
        { id: 'ex-2', data: { name: 'Squat', weight_increment: 10, is_custom: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(exercises));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('name');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('ex-1');
      expect(result[1]?.id).toBe('ex-2');
    });

    it('should return empty array when no exercises exist', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findDefaultExercises', () => {
    it('should return only non-custom exercises', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const exercises = [
        { id: 'ex-1', data: { name: 'Bench Press', weight_increment: 5, is_custom: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(exercises));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findDefaultExercises();

      expect(mockCollection.where).toHaveBeenCalledWith('is_custom', '==', false);
      expect(result).toHaveLength(1);
      expect(result[0]?.is_custom).toBe(false);
    });
  });

  describe('findCustomExercises', () => {
    it('should return only custom exercises', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const exercises = [
        { id: 'ex-1', data: { name: 'My Exercise', weight_increment: 5, is_custom: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(exercises));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findCustomExercises();

      expect(mockCollection.where).toHaveBeenCalledWith('is_custom', '==', true);
      expect(result).toHaveLength(1);
      expect(result[0]?.is_custom).toBe(true);
    });
  });

  describe('update', () => {
    it('should update exercise fields and timestamp', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const existingData = {
        name: 'Bench Press',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First call to findById (existing check)
      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('exercise-1', existingData))
        // Second call to findById (after update)
        .mockResolvedValueOnce(createMockDoc('exercise-1', { ...existingData, name: 'Updated Bench Press', updated_at: '2024-01-02T00:00:00Z' }));

      const result = await repository.update('exercise-1', { name: 'Updated Bench Press' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Bench Press',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Bench Press');
    });

    it('should return null when updating non-existent exercise', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { name: 'Updated' });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing exercise when no updates provided', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const existingData = {
        name: 'Bench Press',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('exercise-1', existingData));

      const result = await repository.update('exercise-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'exercise-1',
        ...existingData,
      });
    });

    it('should update weight_increment', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const existingData = {
        name: 'Bench Press',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('exercise-1', existingData))
        .mockResolvedValueOnce(createMockDoc('exercise-1', { ...existingData, weight_increment: 10 }));

      const result = await repository.update('exercise-1', { weight_increment: 10 });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          weight_increment: 10,
        })
      );
      expect(result?.weight_increment).toBe(10);
    });
  });

  describe('delete', () => {
    it('should delete existing exercise and return true', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      const existingData = {
        name: 'Bench Press',
        weight_increment: 5,
        is_custom: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('exercise-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('exercise-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent exercise', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('isInUse', () => {
    it('should return true when exercise is referenced by plan_day_exercises', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);

      const mockPlanDayExercisesCollection = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: false }),
      };
      (mockDb.collection as ReturnType<typeof vi.fn>).mockReturnValue(mockPlanDayExercisesCollection);

      const result = await repository.isInUse('exercise-1');

      expect(mockDb.collection).toHaveBeenCalledWith('test_plan_day_exercises');
      expect(mockPlanDayExercisesCollection.where).toHaveBeenCalledWith('exercise_id', '==', 'exercise-1');
      expect(result).toBe(true);
    });

    it('should return false when exercise is not referenced', async () => {
      const repository = new ExerciseRepository(mockDb as Firestore);

      const mockPlanDayExercisesCollection = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true }),
      };
      (mockDb.collection as ReturnType<typeof vi.fn>).mockReturnValue(mockPlanDayExercisesCollection);

      const result = await repository.isInUse('unused-exercise');

      expect(result).toBe(false);
    });
  });
});
