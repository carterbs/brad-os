import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Ingredient } from '../shared.js';
import {
  type ApiResponse,
  createIngredient,
  createMockIngredientRepository,
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
const mockIngredientRepo = createMockIngredientRepository();

vi.mock('../repositories/ingredient.repository.js', () => ({
  IngredientRepository: vi.fn().mockImplementation(() => mockIngredientRepo),
}));

// Import after mocks
import { ingredientsApp } from './ingredients.js';

describe('Ingredients Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /ingredients', () => {
    it('should return all ingredients', async () => {
      const ingredients = [
        createIngredient({ id: 'ing-1', name: 'Chicken Breast' }),
        createIngredient({ id: 'ing-2', name: 'Rice' }),
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
  });

  describe('GET /ingredients/:id', () => {
    it('should return ingredient by id', async () => {
      const ingredient = createIngredient({ id: 'ing-1' });
      mockIngredientRepo.findById.mockResolvedValue(ingredient);

      const response = await request(ingredientsApp).get('/ing-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: ingredient,
      });
      expect(mockIngredientRepo.findById).toHaveBeenCalledWith('ing-1');
    });

    it('should return 404 when ingredient does not exist', async () => {
      mockIngredientRepo.findById.mockResolvedValue(null);

      const response = await request(ingredientsApp).get('/missing');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ingredient with id missing not found',
        },
      });
    });
  });

  describe('POST /ingredients', () => {
    it('should create an ingredient with valid data', async () => {
      const createdIngredient = createIngredient({ id: 'new-ingredient', name: 'Olive Oil' });
      mockIngredientRepo.create.mockResolvedValue(createdIngredient);

      const response = await request(ingredientsApp)
        .post('/')
        .send({ name: 'Olive Oil', store_section: 'Oils' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdIngredient,
      });
      expect(mockIngredientRepo.create).toHaveBeenCalledWith({
        name: 'Olive Oil',
        store_section: 'Oils',
      });
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(ingredientsApp)
        .post('/')
        .send({ name: '', store_section: 'Oils' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing store section', async () => {
      const response: Response = await request(ingredientsApp)
        .post('/')
        .send({ name: 'Olive Oil' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /ingredients/:id', () => {
    it('should update an ingredient with valid data', async () => {
      const updated = createIngredient({ id: 'ing-1', name: 'Updated Olive Oil' });
      mockIngredientRepo.update.mockResolvedValue(updated);

      const response = await request(ingredientsApp)
        .put('/ing-1')
        .send({ name: 'Updated Olive Oil' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updated,
      });
      expect(mockIngredientRepo.update).toHaveBeenCalledWith('ing-1', {
        name: 'Updated Olive Oil',
      });
    });

    it('should return 404 when ingredient not found', async () => {
      mockIngredientRepo.update.mockResolvedValue(null);

      const response = await request(ingredientsApp)
        .put('/missing')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ingredient with id missing not found',
        },
      });
    });

    it('should return 400 for invalid update payload', async () => {
      const response: Response = await request(ingredientsApp)
        .put('/ing-1')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /ingredients/:id', () => {
    it('should delete an ingredient', async () => {
      mockIngredientRepo.delete.mockResolvedValue(true);

      const response = await request(ingredientsApp).delete('/ing-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockIngredientRepo.delete).toHaveBeenCalledWith('ing-1');
    });

    it('should return 404 when ingredient not found', async () => {
      mockIngredientRepo.delete.mockResolvedValue(false);

      const response = await request(ingredientsApp).delete('/missing');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ingredient with id missing not found',
        },
      });
    });
  });

  describe('Payload Shape', () => {
    it('should return ingredient payload with expected shape', async () => {
      const ingredient = createIngredient({ id: 'ing-1' });
      mockIngredientRepo.findAll.mockResolvedValue([ingredient]);

      const response = await request(ingredientsApp).get('/');

      expect(response.status).toBe(200);
      const body = response.body as ApiResponse<Ingredient[]>;
      const data = body.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        id: ingredient.id,
        name: ingredient.name,
        store_section: ingredient.store_section,
        created_at: ingredient.created_at,
        updated_at: ingredient.updated_at,
      });
    });
  });
});
