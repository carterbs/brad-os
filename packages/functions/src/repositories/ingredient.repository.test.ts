import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference } from 'firebase-admin/firestore';
import {
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('IngredientRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let IngredientRepository: typeof import('./ingredient.repository.js').IngredientRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;

    setupFirebaseMock(mocks);

    const module = await import('./ingredient.repository.js');
    IngredientRepository = module.IngredientRepository;
  });

  describe('findAll', () => {
    it('should return all ingredients ordered by name', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);
      const ingredients = [
        { id: 'ing-1', data: { name: 'Chicken Breast', store_section: 'Meat & Seafood', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
        { id: 'ing-2', data: { name: 'Rice', store_section: 'Pasta & Grains', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(ingredients));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('name');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('ing-1');
      expect(result[0]?.name).toBe('Chicken Breast');
      expect(result[0]?.store_section).toBe('Meat & Seafood');
      expect(result[1]?.id).toBe('ing-2');
      expect(result[1]?.name).toBe('Rice');
      expect(result[1]?.store_section).toBe('Pasta & Grains');
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
        store_section: 'Meat & Seafood',
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

  describe('create', () => {
    it('should create an ingredient and return it with id and timestamps', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-ing-id' });

      const result = await repository.create({ name: 'Carrot', store_section: 'Produce' });

      expect(result.id).toBe('new-ing-id');
      expect(result.name).toBe('Carrot');
      expect(result.store_section).toBe('Produce');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Carrot', store_section: 'Produce' })
      );
    });
  });

  describe('update', () => {
    it('should update an existing ingredient', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const ingredientData = {
        name: 'Chicken Breast',
        store_section: 'Meat & Seafood',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'ing-1', exists: true, data: () => ingredientData,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.update('ing-1', { name: 'Modified Chicken' });

      expect(result).not.toBeNull();
      expect(mockDocRef.update).toHaveBeenCalled();
    });

    it('should return null for non-existent ingredient', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'missing', exists: false, data: () => undefined,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.update('missing', { name: 'Nope' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing ingredient', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const ingredientData = {
        name: 'Chicken Breast',
        store_section: 'Meat & Seafood',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'ing-1', exists: true, data: () => ingredientData,
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.delete('ing-1');

      expect(result).toBe(true);
      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it('should return false for non-existent ingredient', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'missing', exists: false, data: () => undefined,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.delete('missing');

      expect(result).toBe(false);
    });
  });

  describe('parseEntity with store_section validation', () => {
    it('should reject ingredients with invalid store_section', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);
      const ingredients = [
        { id: 'ing-1', data: { name: 'Chicken', store_section: 'InvalidSection', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(ingredients));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(0);
    });

    it('should accept ingredients with valid store_section', async () => {
      const repository = new IngredientRepository(mockDb as Firestore);
      const ingredients = [
        { id: 'ing-1', data: { name: 'Chicken', store_section: 'Meat & Seafood', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' } },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(ingredients));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.store_section).toBe('Meat & Seafood');
    });
  });
});
