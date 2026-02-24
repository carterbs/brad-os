import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Recipe } from '../shared.js';
import {
  type ApiResponse,
  createRecipe,
  createMockRecipeRepository,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repository
const mockRecipeRepo = createMockRecipeRepository();

vi.mock('../repositories/recipe.repository.js', () => ({
  RecipeRepository: vi.fn().mockImplementation(() => mockRecipeRepo),
}));

// Import after mocks
import { recipesApp } from './recipes.js';

describe('Recipes Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /recipes', () => {
    it('should return all recipes', async () => {
      const recipes = [
        createRecipe({ id: 'recipe-1', meal_id: 'meal-1' }),
        createRecipe({ id: 'recipe-2', meal_id: 'meal-2' }),
      ];
      mockRecipeRepo.findAll.mockResolvedValue(recipes);

      const response = await request(recipesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: recipes,
      });
      expect(mockRecipeRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no recipes exist', async () => {
      mockRecipeRepo.findAll.mockResolvedValue([]);

      const response = await request(recipesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });

    it('should return recipes with correct shape', async () => {
      const recipes = [
        createRecipe({
          id: 'recipe-1',
          meal_id: 'meal-1',
          ingredients: [
            { ingredient_id: 'ing-1', quantity: 200, unit: 'g' },
            { ingredient_id: 'ing-2', quantity: null, unit: null },
          ],
          steps: [
            { step_number: 1, instruction: 'Step one' },
            { step_number: 2, instruction: 'Step two' },
          ],
        }),
      ];
      mockRecipeRepo.findAll.mockResolvedValue(recipes);

      const response = await request(recipesApp).get('/');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<Recipe[]>;
      const data = body.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('meal_id');
      expect(data[0]).toHaveProperty('ingredients');
      expect(data[0]).toHaveProperty('steps');
      expect(data[0]).toHaveProperty('created_at');
      expect(data[0]).toHaveProperty('updated_at');
      expect(data[0]?.ingredients).toHaveLength(2);
      expect(data[0]?.steps).toHaveLength(2);
    });

    it('should handle recipes with null steps', async () => {
      const recipes = [
        createRecipe({
          id: 'recipe-1',
          steps: null,
        }),
      ];
      mockRecipeRepo.findAll.mockResolvedValue(recipes);

      const response = await request(recipesApp).get('/');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<Recipe[]>;
      const data = body.data ?? [];
      expect(data[0]?.steps).toBeNull();
    });
  });
});
