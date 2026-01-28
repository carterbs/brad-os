import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference, Query } from 'firebase-admin/firestore';

// Create mock types
interface MockDocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface MockQueryDocumentSnapshot {
  id: string;
  data: () => Record<string, unknown>;
}

interface MockQuerySnapshot {
  empty: boolean;
  docs: MockQueryDocumentSnapshot[];
}

// Helper functions
const createMockDoc = (id: string, data: Record<string, unknown> | null): MockDocumentSnapshot => ({
  id,
  exists: data !== null,
  data: () => data ?? undefined,
});

const createMockQuerySnapshot = (docs: Array<{ id: string; data: Record<string, unknown> }>): MockQuerySnapshot => ({
  empty: docs.length === 0,
  docs: docs.map((doc) => ({
    id: doc.id,
    data: () => doc.data,
  })),
});

const createMockQuery = (snapshot: MockQuerySnapshot): Partial<Query> => ({
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue(snapshot),
});

describe('PlanDayExerciseRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let PlanDayExerciseRepository: typeof import('./plan-day-exercise.repository.js').PlanDayExerciseRepository;

  beforeEach(async () => {
    vi.resetModules();

    mockDocRef = {
      id: 'test-id',
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn() as unknown as DocumentReference['update'],
      delete: vi.fn(),
    };

    mockCollection = {
      doc: vi.fn().mockReturnValue(mockDocRef),
      add: vi.fn().mockResolvedValue({ id: 'generated-id' }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    vi.doMock('../firebase.js', () => ({
      getFirestoreDb: vi.fn().mockReturnValue(mockDb),
      getCollectionName: vi.fn((name: string) => `test_${name}`),
    }));

    const module = await import('./plan-day-exercise.repository.js');
    PlanDayExerciseRepository = module.PlanDayExerciseRepository;
  });

  describe('create', () => {
    it('should create plan day exercise with generated id', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pde-1' });

      const result = await repository.create({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sort_order: 0,
      });

      expect(mockCollection.add).toHaveBeenCalledWith({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sets: 2,
        reps: 8,
        weight: 30.0,
        rest_seconds: 60,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      });
      expect(result.id).toBe('pde-1');
    });

    it('should use default values when not provided', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pde-2' });

      const result = await repository.create({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sort_order: 0,
      });

      expect(result.sets).toBe(2);
      expect(result.reps).toBe(8);
      expect(result.weight).toBe(30.0);
      expect(result.rest_seconds).toBe(60);
      expect(result.min_reps).toBe(8);
      expect(result.max_reps).toBe(12);
    });

    it('should use provided values when specified', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pde-3' });

      const result = await repository.create({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sort_order: 0,
        sets: 4,
        reps: 10,
        weight: 100,
        rest_seconds: 90,
        min_reps: 8,
        max_reps: 15,
      });

      expect(result.sets).toBe(4);
      expect(result.reps).toBe(10);
      expect(result.weight).toBe(100);
      expect(result.rest_seconds).toBe(90);
      expect(result.min_reps).toBe(8);
      expect(result.max_reps).toBe(15);
    });

    it('should preserve sort_order from input', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pde-4' });

      const result = await repository.create({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sort_order: 3,
      });

      expect(result.sort_order).toBe(3);
    });
  });

  describe('findById', () => {
    it('should return plan day exercise when found', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const exerciseData = {
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('pde-1', exerciseData));

      const result = await repository.findById('pde-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('pde-1');
      expect(result).toEqual({
        id: 'pde-1',
        ...exerciseData,
      });
    });

    it('should return null when plan day exercise not found', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByPlanDayId', () => {
    it('should return exercises for plan day ordered by sort_order', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const exercises = [
        { id: 'pde-1', data: { plan_day_id: 'pd-1', exercise_id: 'ex-1', sets: 3, reps: 10, weight: 135, rest_seconds: 90, sort_order: 0, min_reps: 8, max_reps: 12 } },
        { id: 'pde-2', data: { plan_day_id: 'pd-1', exercise_id: 'ex-2', sets: 3, reps: 8, weight: 100, rest_seconds: 60, sort_order: 1, min_reps: 8, max_reps: 12 } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(exercises));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanDayId('pd-1');

      expect(mockCollection.where).toHaveBeenCalledWith('plan_day_id', '==', 'pd-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no exercises found', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanDayId('pd-empty');

      expect(result).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should return all exercises ordered by plan_day_id and sort_order', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const exercises = [
        { id: 'pde-1', data: { plan_day_id: 'pd-1', exercise_id: 'ex-1', sets: 3, reps: 10, weight: 135, rest_seconds: 90, sort_order: 0, min_reps: 8, max_reps: 12 } },
        { id: 'pde-2', data: { plan_day_id: 'pd-1', exercise_id: 'ex-2', sets: 3, reps: 8, weight: 100, rest_seconds: 60, sort_order: 1, min_reps: 8, max_reps: 12 } },
        { id: 'pde-3', data: { plan_day_id: 'pd-2', exercise_id: 'ex-3', sets: 4, reps: 12, weight: 80, rest_seconds: 45, sort_order: 0, min_reps: 8, max_reps: 12 } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(exercises));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('plan_day_id');
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no exercises exist', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update sets', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, sets: 4 }));

      const result = await repository.update('pde-1', { sets: 4 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        sets: 4,
      });
      expect(result?.sets).toBe(4);
    });

    it('should update reps', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, reps: 12 }));

      const result = await repository.update('pde-1', { reps: 12 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        reps: 12,
      });
      expect(result?.reps).toBe(12);
    });

    it('should update weight', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, weight: 145 }));

      const result = await repository.update('pde-1', { weight: 145 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        weight: 145,
      });
      expect(result?.weight).toBe(145);
    });

    it('should update rest_seconds', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, rest_seconds: 120 }));

      const result = await repository.update('pde-1', { rest_seconds: 120 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        rest_seconds: 120,
      });
      expect(result?.rest_seconds).toBe(120);
    });

    it('should update sort_order', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, sort_order: 2 }));

      const result = await repository.update('pde-1', { sort_order: 2 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        sort_order: 2,
      });
      expect(result?.sort_order).toBe(2);
    });

    it('should update min_reps', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, min_reps: 6 }));

      const result = await repository.update('pde-1', { min_reps: 6 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        min_reps: 6,
      });
      expect(result?.min_reps).toBe(6);
    });

    it('should update max_reps', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, max_reps: 15 }));

      const result = await repository.update('pde-1', { max_reps: 15 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        max_reps: 15,
      });
      expect(result?.max_reps).toBe(15);
    });

    it('should update multiple fields at once', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('pde-1', existingData))
        .mockResolvedValueOnce(createMockDoc('pde-1', { ...existingData, sets: 4, reps: 12, weight: 150 }));

      const result = await repository.update('pde-1', {
        sets: 4,
        reps: 12,
        weight: 150,
      });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        sets: 4,
        reps: 12,
        weight: 150,
      });
      expect(result?.sets).toBe(4);
      expect(result?.reps).toBe(12);
      expect(result?.weight).toBe(150);
    });

    it('should return null when updating non-existent exercise', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { sets: 4 });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing exercise when no updates provided', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('pde-1', existingData));

      const result = await repository.update('pde-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'pde-1', ...existingData });
    });
  });

  describe('delete', () => {
    it('should delete existing exercise and return true', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      const existingData = {
        plan_day_id: 'pd-1',
        exercise_id: 'ex-1',
        sets: 3,
        reps: 10,
        weight: 135,
        rest_seconds: 90,
        sort_order: 0,
        min_reps: 8,
        max_reps: 12,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('pde-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('pde-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent exercise', async () => {
      const repository = new PlanDayExerciseRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
