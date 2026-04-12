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
      expect(result[0]?.ingredients[0]?.ingredient_id).toBe('ing-1');
      expect(result[0]?.ingredients[0]?.quantity).toBe(200);
      expect(result[0]?.ingredients[0]?.unit).toBe('g');
      expect(result[1]?.id).toBe('recipe-2');
      expect(result[1]?.ingredients[0]?.ingredient_id).toBe('ing-2');
      expect(result[1]?.ingredients[0]?.quantity).toBeNull();
      expect(result[1]?.ingredients[0]?.unit).toBeNull();
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

  describe('parseEntity edge cases', () => {
    it('should parse recipe when steps field is completely absent from data', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-no-steps',
          data: {
            meal_id: 'meal-1',
            ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
            // steps key intentionally omitted — simulates original seeded recipes
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('recipe-no-steps');
      expect(result[0]?.steps).toBeNull();
    });

    it('should parse ingredient with only ingredient_id and no quantity or unit keys', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-sparse',
          data: {
            meal_id: 'meal-sparse',
            ingredients: [
              { ingredient_id: 'ing-only' },
              { ingredient_id: 'ing-full', quantity: 100, unit: 'g' },
            ],
            steps: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.ingredients).toHaveLength(2);
      expect(result[0]?.ingredients[0]).toEqual({
        ingredient_id: 'ing-only',
        quantity: null,
        unit: null,
      });
      expect(result[0]?.ingredients[1]).toEqual({
        ingredient_id: 'ing-full',
        quantity: 100,
        unit: 'g',
      });
    });

    it('should include recipes with sparse ingredient data in findByMealIds', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);
      const recipes = [
        {
          id: 'recipe-sparse-1',
          data: {
            meal_id: 'meal-6',
            ingredients: [
              { ingredient_id: 'ing-a' },
              { ingredient_id: 'ing-b' },
            ],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          id: 'recipe-full-1',
          data: {
            meal_id: 'meal-7',
            ingredients: [{ ingredient_id: 'ing-c', quantity: 2, unit: 'cups' }],
            steps: [{ step_number: 1, instruction: 'Mix ingredients' }],
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];

      const mockQuery = createMockQuery(createMockQuerySnapshot(recipes));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealIds(['meal-6', 'meal-7']);

      expect(result).toHaveLength(2);
      expect(result[0]?.ingredients[0]?.quantity).toBeNull();
      expect(result[0]?.ingredients[0]?.unit).toBeNull();
      expect(result[0]?.steps).toBeNull();
      expect(result[1]?.ingredients[0]?.quantity).toBe(2);
      expect(result[1]?.steps).toHaveLength(1);
    });
  });

  describe('findByMealId', () => {
    it('should return recipe when found', async () => {
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

      const result = await repository.findByMealId('meal-1');

      expect(mockCollection.where).toHaveBeenCalledWith('meal_id', '==', 'meal-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('recipe-1');
      expect(result?.meal_id).toBe('meal-1');
    });

    it('should return null when not found', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await repository.findByMealId('meal-999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a recipe with valid data', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      // findByMealId returns empty (no existing recipe for this meal)
      const emptyQuery = createMockQuery(createMockQuerySnapshot([]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(emptyQuery);

      // Mock MealRepository.findById and IngredientRepository.findById via collection.doc
      const mockDocRef = {
        get: vi.fn()
          .mockResolvedValueOnce({
            id: 'meal-1', exists: true, data: () => ({
              name: 'Test Meal', meal_type: 'dinner', effort: 5,
              has_red_meat: false, prep_ahead: false, url: null, last_planned: null,
              created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
            }),
          })
          .mockResolvedValueOnce({
            id: 'ing-1', exists: true, data: () => ({
              name: 'Chicken', store_section: 'Meat & Seafood',
              created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
            }),
          }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      (mockCollection.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-recipe-id' });

      const result = await repository.create({
        meal_id: 'meal-1',
        ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
        steps: [{ step_number: 1, instruction: 'Cook it' }],
      });

      expect(result.id).toBe('new-recipe-id');
      expect(result.meal_id).toBe('meal-1');
      expect(result.ingredients).toHaveLength(1);
      expect(result.steps).toHaveLength(1);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should throw 409 when recipe already exists for meal', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const existingQuery = createMockQuery(createMockQuerySnapshot([{
        id: 'existing-recipe',
        data: {
          meal_id: 'meal-1',
          ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
          steps: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      }]));
      (mockCollection.where as ReturnType<typeof vi.fn>).mockReturnValue(existingQuery);

      await expect(
        repository.create({
          meal_id: 'meal-1',
          ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
          steps: null,
        })
      ).rejects.toThrow('Recipe already exists for this meal');
    });
  });

  describe('update', () => {
    it('should strip meal_id from update payload', async () => {
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
          id: 'recipe-1', exists: true, data: () => recipeData,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.update('recipe-1', {
        meal_id: 'meal-changed',
        steps: null,
      });

      // update should have been called without meal_id
      const updateCall = mockDocRef.update.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(updateCall['meal_id']).toBeUndefined();
      expect(updateCall['steps']).toBeNull();
      expect(result).not.toBeNull();
    });

    it('should return null for non-existent recipe', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'non-existent', exists: false, data: () => undefined,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.update('non-existent', { steps: null });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing recipe', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const recipeData = {
        meal_id: 'meal-1',
        ingredients: [{ ingredient_id: 'ing-1', quantity: 200, unit: 'g' }],
        steps: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'recipe-1', exists: true, data: () => recipeData,
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.delete('recipe-1');

      expect(result).toBe(true);
      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it('should return false for non-existent recipe', async () => {
      const repository = new RecipeRepository(mockDb as Firestore);

      const mockDocRef = {
        get: vi.fn().mockResolvedValue({
          id: 'non-existent', exists: false, data: () => undefined,
        }),
      };
      (mockCollection.doc as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });
});
