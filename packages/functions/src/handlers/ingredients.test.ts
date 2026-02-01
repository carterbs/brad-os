import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Ingredient } from '../shared.js';

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
const mockIngredientRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../repositories/ingredient.repository.js', () => ({
  IngredientRepository: vi.fn().mockImplementation(() => mockIngredientRepo),
}));

// Import after mocks
import { ingredientsApp } from './ingredients.js';

// Helper to create test ingredient
function createTestIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    name: 'Chicken Breast',
    store_section: 'Meat',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Ingredients Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /ingredients', () => {
    it('should return all ingredients', async () => {
      const ingredients = [
        createTestIngredient({ id: 'ing-1', name: 'Chicken Breast', store_section: 'Meat' }),
        createTestIngredient({ id: 'ing-2', name: 'Rice', store_section: 'Grains' }),
      ];
      mockIngredientRepo.findAll.mockResolvedValue(ingredients);

      const response = await request(ingredientsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: ingredients,
      });
      expect(mockIngredientRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no ingredients exist', async () => {
      mockIngredientRepo.findAll.mockResolvedValue([]);

      const response = await request(ingredientsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });

    it('should return ingredients with correct shape', async () => {
      const ingredients = [
        createTestIngredient({
          id: 'ing-1',
          name: 'Olive Oil',
          store_section: 'Oils',
        }),
      ];
      mockIngredientRepo.findAll.mockResolvedValue(ingredients);

      const response = await request(ingredientsApp).get('/');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<Ingredient[]>;
      const data = body.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('store_section');
      expect(data[0]).toHaveProperty('created_at');
      expect(data[0]).toHaveProperty('updated_at');
    });
  });
});
