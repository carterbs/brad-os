import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
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
  });

  describe('GET /recipes/:id', () => {
    it('should return a recipe by id', async () => {
      const recipe = createRecipe({ id: 'recipe-1', meal_id: 'meal-1' });
      mockRecipeRepo.findById.mockResolvedValue(recipe);

      const response = await request(recipesApp).get('/recipe-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: recipe,
      });
      expect(mockRecipeRepo.findById).toHaveBeenCalledWith('recipe-1');
    });

    it('should return 404 when recipe does not exist', async () => {
      mockRecipeRepo.findById.mockResolvedValue(null);

      const response = await request(recipesApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /recipes', () => {
    it('should create a recipe with valid data', async () => {
      const createdRecipe = createRecipe({ id: 'new-recipe', meal_id: 'meal-1' });
      mockRecipeRepo.create.mockResolvedValue(createdRecipe);

      const response = await request(recipesApp)
        .post('/')
        .send({
          meal_id: 'meal-1',
          ingredients: createdRecipe.ingredients,
          steps: createdRecipe.steps,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdRecipe,
      });
      expect(mockRecipeRepo.create).toHaveBeenCalledWith({
        meal_id: 'meal-1',
        ingredients: createdRecipe.ingredients,
        steps: createdRecipe.steps,
      });
    });

    it('should return 400 for invalid payload', async () => {
      const response: Response = await request(recipesApp).post('/').send({
        meal_id: '',
        ingredients: [],
        steps: [],
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /recipes/:id', () => {
    it('should update a recipe with valid data', async () => {
      const updated = createRecipe({ id: 'recipe-1', meal_id: 'meal-updated' });
      mockRecipeRepo.update.mockResolvedValue(updated);

      const response = await request(recipesApp)
        .put('/recipe-1')
        .send({
          meal_id: 'meal-updated',
          ingredients: updated.ingredients,
          steps: updated.steps,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updated,
      });
      expect(mockRecipeRepo.update).toHaveBeenCalledWith('recipe-1', {
        meal_id: 'meal-updated',
        ingredients: updated.ingredients,
        steps: updated.steps,
      });
    });

    it('should partially update a recipe', async () => {
      const updated = createRecipe({ id: 'recipe-1', steps: null, meal_id: 'meal-1' });
      mockRecipeRepo.update.mockResolvedValue(updated);

      const response = await request(recipesApp)
        .put('/recipe-1')
        .send({
          steps: null,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updated,
      });
      expect(mockRecipeRepo.update).toHaveBeenCalledWith('recipe-1', { steps: null });
    });

    it('should return 404 when recipe not found', async () => {
      mockRecipeRepo.update.mockResolvedValue(null);

      const response = await request(recipesApp)
        .put('/non-existent-id')
        .send({ meal_id: 'meal-2' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe with id non-existent-id not found',
        },
      });
    });

    it('should return 400 for malformed update', async () => {
      const response: Response = await request(recipesApp)
        .put('/recipe-1')
        .send({ ingredients: 'bad' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /recipes/:id', () => {
    it('should delete a recipe', async () => {
      mockRecipeRepo.delete.mockResolvedValue(true);

      const response = await request(recipesApp).delete('/recipe-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockRecipeRepo.delete).toHaveBeenCalledWith('recipe-1');
    });

    it('should return 404 when recipe not found for delete', async () => {
      mockRecipeRepo.delete.mockResolvedValue(false);

      const response = await request(recipesApp).delete('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe with id non-existent-id not found',
        },
      });
    });
  });

  describe('Payload Shape', () => {
    it('should return recipe payload with expected shape', async () => {
      const recipe = createRecipe({ id: 'recipe-1', meal_id: 'meal-1' });
      mockRecipeRepo.findAll.mockResolvedValue([recipe]);

      const response = await request(recipesApp).get('/');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<Recipe[]>;
      const data = body.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        id: 'recipe-1',
        meal_id: 'meal-1',
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        created_at: recipe.created_at,
        updated_at: recipe.updated_at,
      });
    });
  });
});
