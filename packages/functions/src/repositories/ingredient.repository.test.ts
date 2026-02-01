import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, Query } from 'firebase-admin/firestore';

// Create mock types
interface MockQueryDocumentSnapshot {
  id: string;
  data: () => Record<string, unknown>;
}

interface MockQuerySnapshot {
  empty: boolean;
  docs: MockQueryDocumentSnapshot[];
}

// Create mock functions
const createMockQuerySnapshot = (docs: Array<{ id: string; data: Record<string, unknown> }>): MockQuerySnapshot => ({
  empty: docs.length === 0,
  docs: docs.map((doc) => ({
    id: doc.id,
    data: () => doc.data,
  })),
});

// Create chainable mock query
const createMockQuery = (snapshot: MockQuerySnapshot): Partial<Query> => ({
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue(snapshot),
});

describe('IngredientRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let IngredientRepository: typeof import('./ingredient.repository.js').IngredientRepository;

  beforeEach(async () => {
    vi.resetModules();

    // Create mock collection reference
    mockCollection = {
      doc: vi.fn(),
      add: vi.fn(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    // Create mock Firestore
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    // Mock the firebase module
    vi.doMock('../firebase.js', () => ({
      getFirestoreDb: vi.fn().mockReturnValue(mockDb),
      getCollectionName: vi.fn((name: string) => `test_${name}`),
    }));

    // Import after mocking
    const module = await import('./ingredient.repository.js');
    IngredientRepository = module.IngredientRepository;
  });

  describe('findAll', () => {
    it('should return all ingredients ordered by name', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);
      const ingredients = [
        { id: 'ing-1', data: { name: 'Chicken Breast', store_section: 'Meat', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
        { id: 'ing-2', data: { name: 'Rice', store_section: 'Grains', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(ingredients));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('name');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('ing-1');
      expect(result[0]?.name).toBe('Chicken Breast');
      expect(result[0]?.store_section).toBe('Meat');
      expect(result[1]?.id).toBe('ing-2');
      expect(result[1]?.name).toBe('Rice');
      expect(result[1]?.store_section).toBe('Grains');
    });

    it('should return empty array when no ingredients exist', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return ingredient when found', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);
      const ingredientData = {
        name: 'Chicken Breast',
        store_section: 'Meat',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'ing-1',
          exists: true,
          data: () => ingredientData,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.findById('ing-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('ing-1');
      expect(result).toEqual({
        id: 'ing-1',
        ...ingredientData,
      });
    });

    it('should return null when ingredient not found', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'non-existent',
          exists: false,
          data: () => undefined,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });
});
