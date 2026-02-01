import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Recipe } from '../shared.js';

// Type for API response body
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repository
const mockRecipeRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByMealIds: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../repositories/recipe.repository.js', () => ({
  RecipeRepository: vi.fn().mockImplementation(() => mockRecipeRepo),
}));

// Import after mocks
import { recipesApp } from './recipes.js';

// Helper to create test recipe
function createTestRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    meal_id: 'meal-1',
    ingredients: [
      { ingredient_id: 'ing-1', quantity: 200, unit: 'g' },
    ],
    steps: [
      { step_number: 1, instruction: 'Cook the chicken' },
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Recipes Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /recipes', () => {
    it('should return all recipes', async () => {
      const recipes = [
        createTestRecipe({ id: 'recipe-1', meal_id: 'meal-1' }),
        createTestRecipe({ id: 'recipe-2', meal_id: 'meal-2' }),
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
        createTestRecipe({
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
        createTestRecipe({
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
