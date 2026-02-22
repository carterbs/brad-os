import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Meal } from '../shared.js';

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
const mockMealRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByType: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateLastPlanned: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../repositories/meal.repository.js', () => ({
  MealRepository: vi.fn().mockImplementation(() => mockMealRepo),
}));

// Import after mocks
import { mealsApp } from './meals.js';

// Helper to create test meal
function createTestMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    name: 'Chicken Stir Fry',
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    prep_ahead: false,
    url: 'https://example.com/recipe',
    last_planned: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Meals Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /meals', () => {
    it('should return all meals', async () => {
      const meals = [
        createTestMeal({ id: '1', name: 'Chicken Stir Fry' }),
        createTestMeal({ id: '2', name: 'Oatmeal', meal_type: 'breakfast', effort: 1 }),
      ];
      mockMealRepo.findAll.mockResolvedValue(meals);

      const response = await request(mealsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: meals,
      });
      expect(mockMealRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no meals exist', async () => {
      mockMealRepo.findAll.mockResolvedValue([]);

      const response = await request(mealsApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('GET /meals/:id', () => {
    it('should return meal by id', async () => {
      const meal = createTestMeal({ id: 'meal-123' });
      mockMealRepo.findById.mockResolvedValue(meal);

      const response = await request(mealsApp).get('/meal-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: meal,
      });
      expect(mockMealRepo.findById).toHaveBeenCalledWith('meal-123');
    });

    it('should return 404 when meal not found', async () => {
      mockMealRepo.findById.mockResolvedValue(null);

      const response = await request(mealsApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal with id non-existent-id not found',
        },
      });
    });
  });

  describe('POST /meals', () => {
    it('should create meal with valid data', async () => {
      const createdMeal = createTestMeal({
        id: 'new-meal',
        name: 'Grilled Salmon',
        meal_type: 'dinner',
        effort: 6,
        has_red_meat: false,
        prep_ahead: false,
        url: 'https://example.com/salmon',
      });
      mockMealRepo.create.mockResolvedValue(createdMeal);

      const response = await request(mealsApp)
        .post('/')
        .send({
          name: 'Grilled Salmon',
          meal_type: 'dinner',
          effort: 6,
          has_red_meat: false,
          prep_ahead: false,
          url: 'https://example.com/salmon',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: createdMeal,
      });
      expect(mockMealRepo.create).toHaveBeenCalledWith({
        name: 'Grilled Salmon',
        meal_type: 'dinner',
        effort: 6,
        has_red_meat: false,
        prep_ahead: false,
        url: 'https://example.com/salmon',
      });
    });

    it('should return 400 for invalid meal_type', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          name: 'Test Meal',
          meal_type: 'snack',
          effort: 5,
          has_red_meat: false,
          prep_ahead: false,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing name', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          meal_type: 'dinner',
          effort: 5,
          has_red_meat: false,
          prep_ahead: false,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          name: '',
          meal_type: 'dinner',
          effort: 5,
          has_red_meat: false,
          prep_ahead: false,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for effort out of range', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          name: 'Test',
          meal_type: 'dinner',
          effort: 11,
          has_red_meat: false,
          prep_ahead: false,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing effort', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          name: 'Test',
          meal_type: 'dinner',
          has_red_meat: false,
          prep_ahead: false,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing has_red_meat', async () => {
      const response: Response = await request(mealsApp)
        .post('/')
        .send({
          name: 'Test',
          meal_type: 'dinner',
          effort: 5,
          url: '',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /meals/:id', () => {
    it('should update meal with valid data', async () => {
      const updatedMeal = createTestMeal({
        id: 'meal-123',
        name: 'Updated Stir Fry',
        effort: 7,
      });
      mockMealRepo.update.mockResolvedValue(updatedMeal);

      const response = await request(mealsApp)
        .put('/meal-123')
        .send({ name: 'Updated Stir Fry', effort: 7 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: updatedMeal,
      });
      expect(mockMealRepo.update).toHaveBeenCalledWith('meal-123', {
        name: 'Updated Stir Fry',
        effort: 7,
      });
    });

    it('should update meal with partial data', async () => {
      const updatedMeal = createTestMeal({
        id: 'meal-123',
        name: 'Only Name Updated',
      });
      mockMealRepo.update.mockResolvedValue(updatedMeal);

      const response = await request(mealsApp)
        .put('/meal-123')
        .send({ name: 'Only Name Updated' });

      expect(response.status).toBe(200);
      expect(mockMealRepo.update).toHaveBeenCalledWith('meal-123', {
        name: 'Only Name Updated',
      });
    });

    it('should return 404 when meal not found', async () => {
      mockMealRepo.update.mockResolvedValue(null);

      const response = await request(mealsApp)
        .put('/non-existent-id')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal with id non-existent-id not found',
        },
      });
    });

    it('should return 400 for empty name', async () => {
      const response: Response = await request(mealsApp)
        .put('/meal-123')
        .send({ name: '' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid meal_type', async () => {
      const response: Response = await request(mealsApp)
        .put('/meal-123')
        .send({ meal_type: 'brunch' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for effort out of range', async () => {
      const response: Response = await request(mealsApp)
        .put('/meal-123')
        .send({ effort: 0 });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /meals/:id', () => {
    it('should delete meal successfully', async () => {
      mockMealRepo.delete.mockResolvedValue(true);

      const response = await request(mealsApp).delete('/meal-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
      expect(mockMealRepo.delete).toHaveBeenCalledWith('meal-123');
    });

    it('should return 404 when meal not found', async () => {
      mockMealRepo.delete.mockResolvedValue(false);

      const response = await request(mealsApp).delete('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal with id non-existent-id not found',
        },
      });
    });
  });
});
