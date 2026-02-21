import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('PlanDayRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let PlanDayRepository: typeof import('./plan-day.repository.js').PlanDayRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    const module = await import('./plan-day.repository.js');
    PlanDayRepository = module.PlanDayRepository;
  });

  describe('create', () => {
    it('should create plan day with generated id', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-day-1' });

      const result = await repository.create({
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      });

      expect(mockCollection.add).toHaveBeenCalledWith({
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      });
      expect(result.id).toBe('plan-day-1');
      expect(result.name).toBe('Push Day');
    });

    it('should preserve all fields from input', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-day-2' });

      const result = await repository.create({
        plan_id: 'plan-1',
        day_of_week: 3,
        name: 'Pull Day',
        sort_order: 1,
      });

      expect(result.plan_id).toBe('plan-1');
      expect(result.day_of_week).toBe(3);
      expect(result.name).toBe('Pull Day');
      expect(result.sort_order).toBe(1);
    });

    it('should handle different day_of_week values', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-day-3' });

      const result = await repository.create({
        plan_id: 'plan-1',
        day_of_week: 5,
        name: 'Leg Day',
        sort_order: 2,
      });

      expect(result.day_of_week).toBe(5);
    });
  });

  describe('findById', () => {
    it('should return plan day when found', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const planDayData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-day-1', planDayData));

      const result = await repository.findById('plan-day-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('plan-day-1');
      expect(result).toEqual({
        id: 'plan-day-1',
        ...planDayData,
      });
    });

    it('should return null when plan day not found', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByPlanId', () => {
    it('should return plan days for plan ordered by sort_order', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const planDays = [
        { id: 'pd-1', data: { plan_id: 'plan-1', day_of_week: 1, name: 'Push Day', sort_order: 0 } },
        { id: 'pd-2', data: { plan_id: 'plan-1', day_of_week: 3, name: 'Pull Day', sort_order: 1 } },
        { id: 'pd-3', data: { plan_id: 'plan-1', day_of_week: 5, name: 'Leg Day', sort_order: 2 } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(planDays));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanId('plan-1');

      expect(mockCollection.where).toHaveBeenCalledWith('plan_id', '==', 'plan-1');
      expect(result).toHaveLength(3);
      expect(result[0]?.name).toBe('Push Day');
      expect(result[1]?.name).toBe('Pull Day');
      expect(result[2]?.name).toBe('Leg Day');
    });

    it('should return empty array when no plan days found', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanId('plan-empty');

      expect(result).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should return all plan days ordered by plan_id and sort_order', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const planDays = [
        { id: 'pd-1', data: { plan_id: 'plan-1', day_of_week: 1, name: 'Push Day', sort_order: 0 } },
        { id: 'pd-2', data: { plan_id: 'plan-1', day_of_week: 3, name: 'Pull Day', sort_order: 1 } },
        { id: 'pd-3', data: { plan_id: 'plan-2', day_of_week: 1, name: 'Upper', sort_order: 0 } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(planDays));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('plan_id');
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no plan days exist', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update day_of_week', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-day-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-day-1', { ...existingData, day_of_week: 2 }));

      const result = await repository.update('plan-day-1', { day_of_week: 2 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        day_of_week: 2,
      });
      expect(result?.day_of_week).toBe(2);
    });

    it('should update name', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-day-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-day-1', { ...existingData, name: 'Chest & Shoulders' }));

      const result = await repository.update('plan-day-1', { name: 'Chest & Shoulders' });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        name: 'Chest & Shoulders',
      });
      expect(result?.name).toBe('Chest & Shoulders');
    });

    it('should update sort_order', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-day-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-day-1', { ...existingData, sort_order: 2 }));

      const result = await repository.update('plan-day-1', { sort_order: 2 });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        sort_order: 2,
      });
      expect(result?.sort_order).toBe(2);
    });

    it('should update multiple fields at once', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-day-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-day-1', { ...existingData, day_of_week: 3, name: 'New Name', sort_order: 1 }));

      const result = await repository.update('plan-day-1', {
        day_of_week: 3,
        name: 'New Name',
        sort_order: 1,
      });

      expect(mockDocRef.update).toHaveBeenCalledWith({
        day_of_week: 3,
        name: 'New Name',
        sort_order: 1,
      });
      expect(result?.day_of_week).toBe(3);
      expect(result?.name).toBe('New Name');
      expect(result?.sort_order).toBe(1);
    });

    it('should return null when updating non-existent plan day', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { name: 'Updated' });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing plan day when no updates provided', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-day-1', existingData));

      const result = await repository.update('plan-day-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'plan-day-1', ...existingData });
    });
  });

  describe('delete', () => {
    it('should delete existing plan day and return true', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        day_of_week: 1,
        name: 'Push Day',
        sort_order: 0,
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-day-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('plan-day-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent plan day', async () => {
      const repository = new PlanDayRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
