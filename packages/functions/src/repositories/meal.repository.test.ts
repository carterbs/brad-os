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

// Create mock functions
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

describe('MealRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let MealRepository: typeof import('./meal.repository.js').MealRepository;

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

    const module = await import('./meal.repository.js');
    MealRepository = module.MealRepository;
  });

  describe('create', () => {
    it('should insert meal with generated id', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-meal-id' });

      const result = await repository.create({
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: 'https://example.com/recipe',
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Chicken Stir Fry',
          meal_type: 'dinner',
          effort: 5,
          has_red_meat: false,
          url: 'https://example.com/recipe',
          last_planned: null,
          created_at: expect.any(String) as unknown as string,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result.id).toBe('new-meal-id');
      expect(result.name).toBe('Chicken Stir Fry');
      expect(result.last_planned).toBeNull();
    });

    it('should set timestamps on creation', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-id' });

      const result = await repository.create({
        name: 'Oatmeal',
        meal_type: 'breakfast',
        effort: 1,
        has_red_meat: false,
        url: '',
      });

      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(result.created_at).toBe(result.updated_at);
    });
  });

  describe('findById', () => {
    it('should return meal when found', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const mealData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: 'https://example.com',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meal-1', mealData));

      const result = await repository.findById('meal-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('meal-1');
      expect(result).toEqual({
        id: 'meal-1',
        ...mealData,
      });
    });

    it('should return null when meal not found', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all meals ordered by name', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const meals = [
        { id: 'meal-1', data: { name: 'Chicken Stir Fry', meal_type: 'dinner', effort: 5, has_red_meat: false, url: '', last_planned: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
        { id: 'meal-2', data: { name: 'Oatmeal', meal_type: 'breakfast', effort: 1, has_red_meat: false, url: '', last_planned: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(meals));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('name');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('meal-1');
      expect(result[1]?.id).toBe('meal-2');
    });

    it('should return empty array when no meals exist', async () => {
      const repository = new MealRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByType', () => {
    it('should return meals filtered by type', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const dinnerMeals = [
        { id: 'meal-1', data: { name: 'Chicken Stir Fry', meal_type: 'dinner', effort: 5, has_red_meat: false, url: '', last_planned: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(dinnerMeals));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByType('dinner');

      expect(mockCollection.where).toHaveBeenCalledWith('meal_type', '==', 'dinner');
      expect(result).toHaveLength(1);
      expect(result[0]?.meal_type).toBe('dinner');
    });

    it('should return empty array when no meals of type exist', async () => {
      const repository = new MealRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByType('breakfast');

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update meal fields and timestamp', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meal-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meal-1', { ...existingData, name: 'Updated Stir Fry', updated_at: '2024-01-02T00:00:00Z' }));

      const result = await repository.update('meal-1', { name: 'Updated Stir Fry' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Stir Fry',
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Stir Fry');
    });

    it('should return null when updating non-existent meal', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.update('non-existent', { name: 'Updated' });

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return existing meal when no updates provided', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meal-1', existingData));

      const result = await repository.update('meal-1', {});

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'meal-1',
        ...existingData,
      });
    });

    it('should update effort', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meal-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meal-1', { ...existingData, effort: 8 }));

      const result = await repository.update('meal-1', { effort: 8 });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          effort: 8,
        })
      );
      expect(result?.effort).toBe(8);
    });

    it('should update has_red_meat', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meal-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meal-1', { ...existingData, has_red_meat: true }));

      const result = await repository.update('meal-1', { has_red_meat: true });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          has_red_meat: true,
        })
      );
      expect(result?.has_red_meat).toBe(true);
    });
  });

  describe('updateLastPlanned', () => {
    it('should update last_planned timestamp', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const newTimestamp = '2024-06-15T00:00:00Z';

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('meal-1', existingData))
        .mockResolvedValueOnce(createMockDoc('meal-1', { ...existingData, last_planned: newTimestamp }));

      const result = await repository.updateLastPlanned('meal-1', newTimestamp);

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_planned: newTimestamp,
          updated_at: expect.any(String) as unknown as string,
        })
      );
      expect(result?.last_planned).toBe(newTimestamp);
    });

    it('should return null when updating last_planned for non-existent meal', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.updateLastPlanned('non-existent', '2024-06-15T00:00:00Z');

      expect(mockDocRef.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing meal and return true', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      const existingData = {
        name: 'Chicken Stir Fry',
        meal_type: 'dinner',
        effort: 5,
        has_red_meat: false,
        url: '',
        last_planned: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('meal-1', existingData));
      (mockDocRef.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await repository.delete('meal-1');

      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent meal', async () => {
      const repository = new MealRepository(mockDb as Firestore);
      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(createMockDoc('non-existent', null));

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
