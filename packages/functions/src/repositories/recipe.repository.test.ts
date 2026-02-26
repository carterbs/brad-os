import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference } from 'firebase-admin/firestore';
import {
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('RecipeRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let RecipeRepository: typeof import('./recipe.repository.js').RecipeRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;

    setupFirebaseMock(mocks);

    const module = await import('./recipe.repository.js');
    RecipeRepository = module.RecipeRepository;
  });

  describe('findAll', () => {
    it('should return all recipes ordered by created_at', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-1',
          data: {
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
            steps: [{ step_number: 1, instruction: 'Cook chicken' }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'recipe-2',
          data: {
            meal_id: 'meal-2',
            ingredients: [{ ingredient_id: 'ing-2', quantity: null, unit: null }],
            steps: null,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('created_at');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('recipe-1');
      expect(result[0]?.meal_id).toBe('meal-1');
      expect(result[0]?.ingredients).toHaveLength(1);
      expect(result[0]?.ingredients[0]?.ingredient_id).toBe('ing-1');
      expect(result[1]?.id).toBe('recipe-2');
      expect(result[1]?.ingredients).toEqual([{ ingredient_id: 'ing-2', quantity: null, unit: null }]);
      expect(result[1]?.steps).toBeNull();
    });

    it('should return empty array when no recipes exist', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByMealIds', () => {
    it('should return recipes matching given meal IDs', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-1',
          data: {
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
            steps: [{ step_number: 1, instruction: 'Cook chicken' }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'recipe-3',
          data: {
            meal_id: 'meal-3',
            ingredients: [{ ingredient_id: 'ing-2', quantity: 100, unit: 'ml' }],
            steps: null,
            created_at: '2024-01-03T00:00:00Z',
            updated_at: '2024-01-03T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealIds(['meal-1', 'meal-3']);

      expect(mockCollection.where).toHaveBeenCalledWith('meal_id', 'in', ['meal-1', 'meal-3']);
      expect(result).toHaveLength(2);
      expect(result[0]?.meal_id).toBe('meal-1');
      expect(result[1]?.meal_id).toBe('meal-3');
    });

    it('should return empty array when no meal IDs match', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealIds(['meal-999']);

      expect(result).toEqual([]);
    });

    it('should return empty array when given empty meal IDs array', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const result = await repository.findByMealIds([]);

      expect(result).toEqual([]);
      expect(mockCollection.where).not.toHaveBeenCalled();
    });

    it('should skip malformed recipes when listing by meal ids', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-1',
          data: {
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
            steps: [{ step_number: 1, instruction: 'Cook chicken' }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'recipe-invalid',
          data: {
            meal_id: 'meal-2',
            ingredients: [{ ingredient_id: 'ing-2', quantity: 'bad', unit: 'g' }],
            steps: [],
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealIds(['meal-1', 'meal-2']);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('recipe-1');
    });
  });

  describe('findById', () => {
    it('should return recipe when found', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipeData = {
        meal_id: 'meal-1',
        ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
        steps: [{ step_number: 1, instruction: 'Cook chicken' }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'recipe-1',
          exists: true,
          data: () => recipeData,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.findById('recipe-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('recipe-1');
      expect(result).toEqual({
        id: 'recipe-1',
        ...recipeData,
      });
    });

    it('should return null when recipe not found', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

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

    it('should return null when recipe payload is malformed', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'recipe-invalid',
          exists: true,
          data: (): Record<string, unknown> => ({
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 'bad', unit: 'g' }],
            steps: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.findById('recipe-invalid');

      expect(result).toBeNull();
    });
  });

  describe('write-guard methods', () => {
    it('should reject create with not implemented error', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      await expect(repository.create({ meal_id: 'meal-1' })).rejects.toThrow(
        'RecipeRepository.create is not implemented'
      );
    });

    it('should reject update with not implemented error', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      await expect(repository.update('recipe-1', { meal_id: 'meal-2' })).rejects.toThrow(
        'RecipeRepository.update is not implemented'
      );
    });

    it('should reject delete with not implemented error', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      await expect(repository.delete('recipe-1')).rejects.toThrow(
        'RecipeRepository.delete is not implemented'
      );
    });
  });
});
