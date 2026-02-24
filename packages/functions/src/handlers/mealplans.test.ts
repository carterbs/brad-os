import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { MealPlanSession, MealPlanEntry, CritiqueOperation } from '../shared.js';
import {
  type ApiResponse,
  createMeal,
  createMealPlanSession,
  createMealPlanEntry,
  createMockMealRepository,
  createMockMealPlanSessionRepository,
} from '../__tests__/utils/index.js';

interface GenerateResponse {
  session_id: string;
  plan: MealPlanEntry[];
}

interface CritiqueResponseData {
  plan: MealPlanEntry[];
  explanation: string;
  operations: CritiqueOperation[];
  errors: string[];
}

interface FinalizeResponseData {
  finalized: boolean;
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
const mockMealRepo = createMockMealRepository();
const mockSessionRepo = createMockMealPlanSessionRepository();

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

// Mock the critique service
vi.mock('../services/mealplan-critique.service.js', () => ({
  processCritique: vi.fn(),
}));

// Mock the operations service
vi.mock('../services/mealplan-operations.service.js', () => ({
  applyOperations: vi.fn(),
}));

import { mealplansApp } from './mealplans.js';
import { generateMealPlan } from '../services/mealplan-generation.service.js';
import { processCritique } from '../services/mealplan-critique.service.js';
import { applyOperations } from '../services/mealplan-operations.service.js';

const mockGenerateMealPlan = vi.mocked(generateMealPlan);
const mockProcessCritique = vi.mocked(processCritique);
const mockApplyOperations = vi.mocked(applyOperations);

// Helper to create test data
function createTestMeals(): import('../shared.js').Meal[] {
  return [
    createMeal({ id: 'meal-1', name: 'Oatmeal', meal_type: 'breakfast', effort: 1, url: '' }),
    createMeal({ id: 'meal-2', name: 'Chicken Stir Fry', meal_type: 'dinner', effort: 5, url: '' }),
  ];
}

function createTestPlan(): MealPlanEntry[] {
  return [
    createMealPlanEntry({ day_index: 0, meal_type: 'breakfast', meal_id: 'meal-1', meal_name: 'Oatmeal' }),
    createMealPlanEntry({ day_index: 0, meal_type: 'lunch', meal_id: 'meal-3', meal_name: 'Sandwich' }),
    createMealPlanEntry({ day_index: 0, meal_type: 'dinner', meal_id: 'meal-2', meal_name: 'Chicken Stir Fry' }),
  ];
}

function createTestSession(overrides: Partial<MealPlanSession> = {}): MealPlanSession {
  return createMealPlanSession({
    id: 'session-1',
    plan: createTestPlan(),
    meals_snapshot: createTestMeals(),
    history: [],
    is_finalized: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  });
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

  describe('POST /mealplans/:sessionId/critique', () => {
    beforeEach(() => {
      // Set OPENAI_API_KEY for all critique tests
      process.env['OPENAI_API_KEY'] = 'test-api-key';
    });

    it('should return updated plan on valid critique', async () => {
      const session = createTestSession();
      const updatedPlan: MealPlanEntry[] = [
        { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-1', meal_name: 'Oatmeal' },
        { day_index: 0, meal_type: 'lunch', meal_id: 'meal-3', meal_name: 'Sandwich' },
        { day_index: 0, meal_type: 'dinner', meal_id: 'meal-2', meal_name: 'Chicken Stir Fry' },
      ];

      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({
        explanation: 'Changed Monday dinner.',
        operations: [{ day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-2' }],
      });
      mockApplyOperations.mockReturnValue({
        updatedPlan,
        errors: [],
      });
      mockSessionRepo.applyCritiqueUpdates.mockResolvedValue(undefined);

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Change Monday dinner please' });

      const body = response.body as ApiResponse<CritiqueResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.plan).toEqual(updatedPlan);
      expect(body.data?.explanation).toBe('Changed Monday dinner.');
      expect(body.data?.operations).toHaveLength(1);
      expect(body.data?.errors).toEqual([]);
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp)
        .post('/non-existent/critique')
        .send({ critique: 'Change something' });

      expect(response.status).toBe(404);
    });

    it('should return 400 for finalized session', async () => {
      const session = createTestSession({ is_finalized: true });
      mockSessionRepo.findById.mockResolvedValue(session);

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Change something' });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('SESSION_FINALIZED');
    });

    it('should return 400 when critique is empty string', async () => {
      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: '' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when critique field is missing', async () => {
      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /mealplans/:sessionId/finalize', () => {
    it('should finalize and update lastPlanned for all meals in plan', async () => {
      const session = createTestSession();
      mockSessionRepo.findById.mockResolvedValue(session);
      mockMealRepo.updateLastPlanned.mockResolvedValue(null);
      mockSessionRepo.update.mockResolvedValue({ ...session, is_finalized: true });

      const response = await request(mealplansApp)
        .post('/session-1/finalize')
        .send();

      const body = response.body as ApiResponse<FinalizeResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.finalized).toBe(true);

      // 3 entries in plan, all with non-null meal_id
      expect(mockMealRepo.updateLastPlanned).toHaveBeenCalledTimes(3);
      expect(mockSessionRepo.update).toHaveBeenCalledWith('session-1', { is_finalized: true });
    });

    it('should skip null meal_id entries when finalizing', async () => {
      const plan: MealPlanEntry[] = [
        { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-1', meal_name: 'Oatmeal' },
        { day_index: 0, meal_type: 'lunch', meal_id: null, meal_name: null },
        { day_index: 0, meal_type: 'dinner', meal_id: 'meal-2', meal_name: 'Chicken Stir Fry' },
      ];
      const session = createTestSession({ plan });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockMealRepo.updateLastPlanned.mockResolvedValue(null);
      mockSessionRepo.update.mockResolvedValue({ ...session, is_finalized: true });

      const response = await request(mealplansApp)
        .post('/session-1/finalize')
        .send();

      expect(response.status).toBe(200);
      // Only 2 non-null entries
      expect(mockMealRepo.updateLastPlanned).toHaveBeenCalledTimes(2);
    });

    it('should return 400 when already finalized', async () => {
      const session = createTestSession({ is_finalized: true });
      mockSessionRepo.findById.mockResolvedValue(session);

      const response = await request(mealplansApp)
        .post('/session-1/finalize')
        .send();

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('SESSION_FINALIZED');
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp)
        .post('/non-existent/finalize')
        .send();

      expect(response.status).toBe(404);
    });
  });
});
