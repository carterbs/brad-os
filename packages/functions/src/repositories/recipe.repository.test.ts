import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  createMockDoc,
  createMockQuerySnapshot,
  createMockQuery,
  createFirestoreMocks,
  setupFirebaseMock,
} from '../test-utils/index.js';

describe('RecipeRepository', () => {
  let mockDb: Partial<Firestore>;
  let mockCollection: Partial<CollectionReference>;
  let mockDocRef: Partial<DocumentReference>;
  let RecipeRepository: typeof import('./recipe.repository.js').RecipeRepository;

  beforeEach(async () => {
    vi.resetModules();

    const mocks = createFirestoreMocks();
    mockDb = mocks.mockDb;
    mockCollection = mocks.mockCollection;
    mockDocRef = mocks.mockDocRef;

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
      expect(result[0]?.ingredients[0]?.ingredient_id).toBe('ing-1');
    });
  });

  describe('findByMealIds', () => {
    it('should return recipes matching meal IDs', async () => {
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
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealIds(['meal-1']);

      expect(mockCollection.where).toHaveBeenCalledWith('meal_id', 'in', ['meal-1']);
      expect(result).toHaveLength(1);
      expect(result[0]?.meal_id).toBe('meal-1');
    });

    it('should return empty array for empty meal id list', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const result = await repository.findByMealIds([]);

      expect(result).toEqual([]);
      expect(mockCollection.where).not.toHaveBeenCalled();
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

      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockDoc('recipe-1', recipeData)
      );

      const result = await repository.findById('recipe-1');

      expect(mockCollection.doc).toHaveBeenCalledWith('recipe-1');
      expect(result).toEqual({
        id: 'recipe-1',
        ...recipeData,
      });
    });

    it('should return null when recipe not found', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockDoc('non-existent', null)
      );

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a recipe with timestamps', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-recipe-id' });

      const result = await repository.create({
        meal_id: 'meal-1',
        ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
        steps: [{ step_number: 1, instruction: 'Stir' }],
      });

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          meal_id: 'meal-1',
          ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
          steps: [{ step_number: 1, instruction: 'Stir' }],
          created_at: expect.any(String),
          updated_at: expect.any(String),
        })
      );
      expect(result.id).toBe('new-recipe-id');
      expect(result.created_at).toBe(result.updated_at);
    });
  });

  describe('update', () => {
    it('should return updated recipe when recipe exists', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const existingData = {
        meal_id: 'meal-1',
        ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
        steps: [{ step_number: 1, instruction: 'Cook chicken' }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockDoc('recipe-1', existingData))
        .mockResolvedValueOnce(createMockDoc('recipe-1', {
          ...existingData,
          meal_id: 'meal-updated',
          updated_at: '2024-01-02T00:00:00Z',
        }));

      const result = await repository.update('recipe-1', { meal_id: 'meal-updated' });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          meal_id: 'meal-updated',
          updated_at: expect.any(String),
        })
      );
      expect(result).not.toBeNull();
      expect(result?.meal_id).toBe('meal-updated');
    });
  });

  describe('delete', () => {
    it('should return true when an existing recipe is deleted', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      (mockDocRef.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          createMockDoc('recipe-1', {
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 100, unit: 'g' }],
            steps: [{ step_number: 1, instruction: 'Boil water' }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          })
        );

      const result = await repository.delete('recipe-1');

      expect(mockDocRef.delete).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('should return false when recipe does not exist', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      (mockDocRef.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockDoc('non-existent', null)
      );

      const result = await repository.delete('non-existent');

      expect(mockDocRef.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
