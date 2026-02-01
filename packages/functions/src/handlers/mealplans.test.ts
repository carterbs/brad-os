import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Meal, MealPlanSession, MealPlanEntry } from '../shared.js';

// Type for API response body
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface GenerateResponse {
  session_id: string;
  plan: MealPlanEntry[];
}

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repositories
const mockMealRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockSessionRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  appendHistory: vi.fn(),
  updatePlan: vi.fn(),
};

vi.mock('../repositories/meal.repository.js', () => ({
  MealRepository: vi.fn().mockImplementation(() => mockMealRepo),
}));

vi.mock('../repositories/mealplan-session.repository.js', () => ({
  MealPlanSessionRepository: vi.fn().mockImplementation(() => mockSessionRepo),
}));

// Mock the generation service
vi.mock('../services/mealplan-generation.service.js', async () => {
  const actual = await vi.importActual<typeof import('../services/mealplan-generation.service.js')>('../services/mealplan-generation.service.js');
  return {
    ...actual,
    generateMealPlan: vi.fn(),
  };
});

import { mealplansApp } from './mealplans.js';
import { generateMealPlan } from '../services/mealplan-generation.service.js';

const mockGenerateMealPlan = vi.mocked(generateMealPlan);

// Helper to create test data
function createTestMeals(): Meal[] {
  return [
    {
      id: 'meal-1',
      name: 'Oatmeal',
      meal_type: 'breakfast',
      effort: 1,
      has_red_meat: false,
      url: '',
      last_planned: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'meal-2',
      name: 'Chicken Stir Fry',
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      url: '',
      last_planned: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];
}

function createTestPlan(): MealPlanEntry[] {
  return [
    { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-1', meal_name: 'Oatmeal' },
    { day_index: 0, meal_type: 'lunch', meal_id: 'meal-3', meal_name: 'Sandwich' },
    { day_index: 0, meal_type: 'dinner', meal_id: 'meal-2', meal_name: 'Chicken Stir Fry' },
  ];
}

function createTestSession(overrides: Partial<MealPlanSession> = {}): MealPlanSession {
  return {
    id: 'session-1',
    plan: createTestPlan(),
    meals_snapshot: createTestMeals(),
    history: [],
    is_finalized: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Mealplans Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /mealplans/generate', () => {
    it('should return session with plan on successful generation', async () => {
      const meals = createTestMeals();
      const plan = createTestPlan();
      const session = createTestSession({ plan });

      mockMealRepo.findAll.mockResolvedValue(meals);
      mockGenerateMealPlan.mockReturnValue(plan);
      mockSessionRepo.create.mockResolvedValue(session);

      const response = await request(mealplansApp)
        .post('/generate')
        .send();

      const body = response.body as ApiResponse<GenerateResponse>;
      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data?.session_id).toBe('session-1');
      expect(body.data?.plan).toEqual(plan);
      expect(mockMealRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockGenerateMealPlan).toHaveBeenCalledWith(meals);
    });

    it('should return 422 when insufficient meals', async () => {
      const { InsufficientMealsError } = await import('../services/mealplan-generation.service.js');
      mockMealRepo.findAll.mockResolvedValue([]);
      mockGenerateMealPlan.mockImplementation(() => {
        throw new InsufficientMealsError('Not enough meals');
      });

      const response = await request(mealplansApp)
        .post('/generate')
        .send();

      const body = response.body as ApiResponse;
      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INSUFFICIENT_MEALS');
    });
  });

  describe('GET /mealplans/:sessionId', () => {
    it('should return session by id', async () => {
      const session = createTestSession();
      mockSessionRepo.findById.mockResolvedValue(session);

      const response = await request(mealplansApp).get('/session-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: session,
      });
      expect(mockSessionRepo.findById).toHaveBeenCalledWith('session-1');
    });

    it('should return 404 when session not found', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp).get('/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'MealPlanSession with id non-existent-id not found',
        },
      });
    });
  });
});
