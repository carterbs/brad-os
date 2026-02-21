import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('PlanRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let mockMesocyclesCollection: Partial<CollectionReference>;
  let PlanRepository: typeof import('./plan.repository.js').PlanRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDocRef = mocks.mockDocRef;
    mockCollection = mocks.mockCollection;

    mockMesocyclesCollection = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true }),
    };

    mockDb = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name.includes('mesocycles')) {
          return mockMesocyclesCollection;
        }
        return mockCollection;
      }),
    };
    mocks.mockDb = mockDb;

    setupFirebaseMock(mocks);

    const module = await import('./plan.repository.js');
    PlanRepository = module.PlanRepository;
  });

  describe('create', () => {
    it('should create plan with generated id', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-1' });

      const result = await repository.create({
        name: 'Upper/Lower Split',
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Upper/Lower Split',
          duration_weeks: 6,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.id).toBe('plan-1');
      expect(result.name).toBe('Upper/Lower Split');
    });

    it('should use default duration_weeks of 6 if not provided', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-2' });

      const result = await repository.create({
        name: 'Push/Pull/Legs',
      });

      expect(result.duration_weeks).toBe(6);
    });

    it('should use provided duration_weeks', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-3' });

      const result = await repository.create({
        name: 'Custom Plan',
        duration_weeks: 8,
      });

      expect(result.duration_weeks).toBe(8);
    });

    it('should set timestamps on creation', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'plan-4' });

      const result = await repository.create({
        name: 'Full Body',
      });

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.created_at).toBe(result.updated_at);
    });
  });

  describe('findById', () => {
    it('should return plan when found', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const planData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-1', planData));

      const result = await repository.findById('plan-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('plan-1');
      expect(result).toEqual({
        id: 'plan-1',
        ...planData,
      });
    });

    it('should return null when plan not found', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all plans ordered by name', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const plans = [
        { id: 'p-1', data: { name: 'Full Body', duration_weeks: 6, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
        { id: 'p-2', data: { name: 'Upper/Lower', duration_weeks: 6, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(plans));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('name');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no plans exist', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update plan name', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-1', { ...existingData, name: 'Updated Split' }));

      const result = await repository.update('plan-1', { name: 'Updated Split' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Split',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.name).toBe('Updated Split');
    });

    it('should update duration_weeks', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-1', { ...existingData, duration_weeks: 8 }));

      const result = await repository.update('plan-1', { duration_weeks: 8 });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          duration_weeks: 8,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.duration_weeks).toBe(8);
    });

    it('should update both name and duration_weeks', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-1', { ...existingData, name: 'New Plan', duration_weeks: 12 }));

      const result = await repository.update('plan-1', {
        name: 'New Plan',
        duration_weeks: 12,
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Plan',
          duration_weeks: 12,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.name).toBe('New Plan');
      expect(result?.duration_weeks).toBe(12);
    });

    it('should return null when updating non-existent plan', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { name: 'Updated' });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing plan when no updates provided', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-1', existingData));

      const result = await repository.update('plan-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'plan-1', ...existingData });
    });

    it('should update updated_at timestamp', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const originalTimestamp = '2024-01-01T00:00:00Z';
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: originalTimestamp,
        updated_at: originalTimestamp,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('plan-1', existingData))
        .mockResolvedValueOnce(createMockDoc('plan-1', { ...existingData, name: 'Updated' }));

      await repository.update('plan-1', { name: 'Updated' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(String) as unknown as string,
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete existing plan and return true', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      const existingData = {
        name: 'Upper/Lower Split',
        duration_weeks: 6,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('plan-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('plan-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent plan', async () => {
      const repository = new PlanRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('isInUse', () => {
    it('should return true when plan is referenced by mesocycles', async () => {
      const repository = new PlanRepository(mockDb as Firestore);

      (mockMesocyclesCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue({ empty: false });

      const result = await repository.isInUse('plan-1');

      expect(mockDb.collection).toHaveBeenCalledWith('test_mesocycles');
      expect(mockMesocyclesCollection.where).toHaveBeenCalledWith('plan_id', '==', 'plan-1');
      expect(result).toBe(true);
    });

    it('should return false when plan is not referenced by mesocycles', async () => {
      const repository = new PlanRepository(mockDb as Firestore);

      (mockMesocyclesCollection.get as ReturnType<typeof vi.fn>).mockResolvedValue({ empty: true });

      const result = await repository.isInUse('unused-plan');

      expect(result).toBe(false);
    });
  });
});
