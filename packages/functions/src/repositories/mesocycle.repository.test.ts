import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('MesocycleRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let MesocycleRepository: typeof import('./mesocycle.repository.js').MesocycleRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

    setupFirebaseMock(mocks);

    const module = await import('./mesocycle.repository.js');
    MesocycleRepository = module.MesocycleRepository;
  });

  describe('create', () => {
    it('should create mesocycle with generated id and pending status', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'meso-1' });

      const result = await repository.create({
        plan_id: 'plan-1',
        start_date: '2024-01-15',
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: 'plan-1',
          start_date: '2024-01-15',
          current_week: 1,
          status: 'pending',
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.id).toBe('meso-1');
      expect(result.status).toBe('pending');
    });

    it('should set current_week to 1 on creation', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'meso-2' });

      const result = await repository.create({
        plan_id: 'plan-1',
        start_date: '2024-02-01',
      });

      expect(result.current_week).toBe(1);
    });

    it('should set timestamps on creation', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'meso-3' });

      const result = await repository.create({
        plan_id: 'plan-1',
        start_date: '2024-03-01',
      });

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.created_at).toBe(result.updated_at);
    });
  });

  describe('findById', () => {
    it('should return mesocycle when found', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mesocycleData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meso-1', mesocycleData));

      const result = await repository.findById('meso-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('meso-1');
      expect(result).toEqual({
        id: 'meso-1',
        ...mesocycleData,
      });
    });

    it('should return null when mesocycle not found', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByPlanId', () => {
    it('should return mesocycles for plan ordered by start_date desc', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mesocycles = [
        { id: 'm-2', data: { plan_id: 'plan-1', start_date: '2024-03-01', current_week: 1, status: 'pending', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' } },
        { id: 'm-1', data: { plan_id: 'plan-1', start_date: '2024-01-15', current_week: 7, status: 'completed', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-02-26T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(mesocycles));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanId('plan-1');

      expect(mockCollection.where).toHaveBeenCalledWith('plan_id', '==', 'plan-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no mesocycles found for plan', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByPlanId('plan-empty');

      expect(result).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('should return active mesocycles ordered by start_date desc', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mesocycles = [
        { id: 'm-1', data: { plan_id: 'plan-1', start_date: '2024-01-15', current_week: 3, status: 'active', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-15T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(mesocycles));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'active');
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('active');
    });

    it('should return empty array when no active mesocycles', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(result).toEqual([]);
    });

    it('should return multiple active mesocycles if they exist', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mesocycles = [
        { id: 'm-1', data: { plan_id: 'plan-1', start_date: '2024-01-15', current_week: 3, status: 'active', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-15T00:00:00Z' } },
        { id: 'm-2', data: { plan_id: 'plan-2', start_date: '2024-01-08', current_week: 4, status: 'active', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-08T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(mesocycles));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(result).toHaveLength(2);
    });
  });

  describe('findAll', () => {
    it('should return all mesocycles ordered by start_date desc', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mesocycles = [
        { id: 'm-2', data: { plan_id: 'plan-1', start_date: '2024-03-01', current_week: 1, status: 'pending', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' } },
        { id: 'm-1', data: { plan_id: 'plan-1', start_date: '2024-01-15', current_week: 7, status: 'completed', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-02-26T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(mesocycles));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('start_date', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no mesocycles exist', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update current_week', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meso-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meso-1', { ...existingData, current_week: 4 }));

      const result = await repository.update('meso-1', { current_week: 4 });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_week: 4,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.current_week).toBe(4);
    });

    it('should update status', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 1,
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meso-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meso-1', { ...existingData, status: 'active' }));

      const result = await repository.update('meso-1', { status: 'active' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.status).toBe('active');
    });

    it('should update both current_week and status', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 6,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-02-19T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meso-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meso-1', { ...existingData, current_week: 7, status: 'completed' }));

      const result = await repository.update('meso-1', {
        current_week: 7,
        status: 'completed',
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_week: 7,
          status: 'completed',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.current_week).toBe(7);
      expect(result?.status).toBe('completed');
    });

    it('should return null when updating non-existent mesocycle', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { current_week: 2 });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing mesocycle when no updates provided', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 3,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meso-1', existingData));

      const result = await repository.update('meso-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'meso-1', ...existingData });
    });

    it('should update updated_at timestamp', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const originalTimestamp = '2024-01-01T00:00:00Z';
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 1,
        status: 'pending',
        created_at: originalTimestamp,
        updated_at: originalTimestamp,
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meso-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meso-1', { ...existingData, current_week: 2 }));

      await repository.update('meso-1', { current_week: 2 });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(String) as unknown as string,
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete existing mesocycle and return true', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      const existingData = {
        plan_id: 'plan-1',
        start_date: '2024-01-15',
        current_week: 1,
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meso-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('meso-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent mesocycle', async () => {
      const repository = new MesocycleRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
