import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type {
  MealPlanSession,
  MealPlanEntry,
  CritiqueOperation,
} from '../shared.js';
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
  outcome?: string;
}

interface ReviseResponseData extends CritiqueResponseData {
  recency_reconciled: boolean;
}

interface FinalizeResponseData {
  finalized: boolean;
}

interface DeleteResponseData {
  deleted: boolean;
  was_finalized: boolean;
  recency_reconciled: boolean;
}

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
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
  const actual = await vi.importActual<
    typeof import('../services/mealplan-generation.service.js')
  >('../services/mealplan-generation.service.js');
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

// Mock the recency service
vi.mock('../services/mealplan-recency.service.js', () => ({
  getUniquePlannedMealIds: vi.fn((plan: Array<{ meal_id: string | null }>) => {
    const mealIds = new Set<string>();
    for (const entry of plan) {
      if (entry.meal_id !== null) {
        mealIds.add(entry.meal_id);
      }
    }
    return [...mealIds];
  }),
  markPlanMealsLastPlanned: vi.fn().mockResolvedValue(undefined),
  reconcileMealLastPlanned: vi.fn().mockResolvedValue(undefined),
  reconcileMealLastPlannedForPlanChange: vi.fn(),
}));

import { mealplansApp } from './mealplans.js';
import { generateMealPlan } from '../services/mealplan-generation.service.js';
import { processCritique } from '../services/mealplan-critique.service.js';
import { applyOperations } from '../services/mealplan-operations.service.js';
import { AppError } from '../middleware/error-handler.js';
import {
  markPlanMealsLastPlanned,
  reconcileMealLastPlanned,
  reconcileMealLastPlannedForPlanChange,
} from '../services/mealplan-recency.service.js';

const mockGenerateMealPlan = vi.mocked(generateMealPlan);
const mockProcessCritique = vi.mocked(processCritique);
const mockApplyOperations = vi.mocked(applyOperations);
const mockMarkPlanMealsLastPlanned = vi.mocked(markPlanMealsLastPlanned);
const mockReconcileMealLastPlanned = vi.mocked(reconcileMealLastPlanned);
const mockReconcileMealLastPlannedForPlanChange = vi.mocked(
  reconcileMealLastPlannedForPlanChange
);

// Helper to create test data
function createTestMeals(): import('../shared.js').Meal[] {
  return [
    createMeal({
      id: 'meal-1',
      name: 'Oatmeal',
      meal_type: 'breakfast',
      effort: 1,
      url: '',
    }),
    createMeal({
      id: 'meal-2',
      name: 'Chicken Stir Fry',
      meal_type: 'dinner',
      effort: 5,
      url: '',
    }),
  ];
}

function createTestPlan(): MealPlanEntry[] {
  return [
    createMealPlanEntry({
      day_index: 0,
      meal_type: 'breakfast',
      meal_id: 'meal-1',
      meal_name: 'Oatmeal',
    }),
    createMealPlanEntry({
      day_index: 0,
      meal_type: 'lunch',
      meal_id: 'meal-3',
      meal_name: 'Sandwich',
    }),
    createMealPlanEntry({
      day_index: 0,
      meal_type: 'dinner',
      meal_id: 'meal-2',
      meal_name: 'Chicken Stir Fry',
    }),
  ];
}

function createTestSession(
  overrides: Partial<MealPlanSession> = {}
): MealPlanSession {
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
  describe('adult breakfast disabled', () => {
    it('filters legacy session reads and preserves the stored session', async () => {
      vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
      const kid = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'family' });
      const adult = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'adult' });
      const session = createMealPlanSession({ plan: [kid, adult] });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.findLatest.mockResolvedValue(session);
      for (const path of ['/session-1', '/latest']) {
        const response = await request(mealplansApp).get(path);
        const body = response.body as ApiResponse<MealPlanSession & { feature_flags: { adult_breakfast_enabled: boolean } }>;
        expect(response.status).toBe(200);
        expect(body.data?.plan).toEqual([kid]);
        expect(body.data?.feature_flags.adult_breakfast_enabled).toBe(false);
      }
      expect(session.plan).toEqual([kid, adult]);
    });
    it('finalizes a legacy plan with only active meal recency IDs', async () => {
      vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
      const kid = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'family', meal_id: 'kid' });
      const adult = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'adult', meal_id: 'adult' });
      const session = createMealPlanSession({ plan: [kid, adult] });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.finalize.mockResolvedValue({ ...session, is_finalized: true });
      const response = await request(mealplansApp).post('/session-1/finalize').send();
      expect(response.status).toBe(200);
      expect(mockSessionRepo.finalize).toHaveBeenCalledWith('session-1', session, ['kid']);
      expect(session.plan).toEqual([kid, adult]);
    });
    it.each(['critique', 'revise'])('preserves disabled saved assignments on %s', async (endpoint) => {
      vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
      vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key');
      const kid = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'family' });
      const adult = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'adult' });
      const replacement = { ...kid, meal_id: 'new-kid', meal_name: 'New kid breakfast' };
      const session = createMealPlanSession({ plan: [kid, adult], is_finalized: endpoint === 'revise' });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Changed kid breakfast', operations: [] });
      mockApplyOperations.mockReturnValue({ updatedPlan: [replacement], errors: [] });
      const response = await request(mealplansApp).post('/session-1/' + endpoint).send({ critique: 'Change kid breakfast' });
      const body = response.body as ApiResponse<CritiqueResponseData>;
      expect(response.status).toBe(200);
      expect(body.data?.plan).toEqual([replacement]);
      expect(mockProcessCritique.mock.calls[0]?.[0].plan).toEqual([kid]);
      expect(mockSessionRepo.applyCritiqueUpdates.mock.calls[0]?.[3]).toEqual([replacement, adult]);
      expect(mockSessionRepo.applyCritiqueUpdates.mock.calls[0]?.[4]).toEqual(session);
    });
  });
  beforeEach(() => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'true');
    vi.clearAllMocks();
    mockSessionRepo.applyCritiqueUpdates.mockResolvedValue(true);
    mockSessionRepo.finalize.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /mealplans/generate', () => {
    it('should return session with plan on successful generation', async () => {
      const meals = createTestMeals();
      const plan = createTestPlan();
      const session = createTestSession({ plan });

      mockMealRepo.findAll.mockResolvedValue(meals);
      mockGenerateMealPlan.mockReturnValue(plan);
      mockSessionRepo.create.mockResolvedValue(session);

      const response = await request(mealplansApp).post('/generate').send();

      const body = response.body as ApiResponse<GenerateResponse>;
      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data?.session_id).toBe('session-1');
      expect(body.data?.plan).toEqual(plan);
      expect(mockMealRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockGenerateMealPlan).toHaveBeenCalledWith(meals);
    });

    it('should return 422 when insufficient meals', async () => {
      const { InsufficientMealsError } =
        await import('../services/mealplan-generation.service.js');
      mockMealRepo.findAll.mockResolvedValue([]);
      mockGenerateMealPlan.mockImplementation(() => {
        throw new InsufficientMealsError('Not enough meals');
      });

      const response = await request(mealplansApp).post('/generate').send();

      const body = response.body as ApiResponse;
      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INSUFFICIENT_MEALS');
    });
  });

  describe('GET /mealplans/latest', () => {
    it('should return the newest session', async () => {
      const latest = createTestSession({
        id: 'session-new',
        created_at: '2026-06-14T00:00:00.000Z',
      });
      mockSessionRepo.findLatest.mockResolvedValue(latest);

      const response = await request(mealplansApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { ...latest, feature_flags: { adult_breakfast_enabled: true } } });
      expect(mockSessionRepo.findLatest).toHaveBeenCalledTimes(1);
      expect(mockSessionRepo.findAll).not.toHaveBeenCalled();
    });

    it('should return null when there are no sessions', async () => {
      mockSessionRepo.findLatest.mockResolvedValue(null);

      const response = await request(mealplansApp).get('/latest');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
      expect(mockSessionRepo.findLatest).toHaveBeenCalledTimes(1);
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
        data: { ...session, feature_flags: { adult_breakfast_enabled: true } },
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
      vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key');
    });

    it('should return updated plan on valid critique', async () => {
      const session = createTestSession();
      const updatedPlan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
        {
          day_index: 0,
          meal_type: 'lunch',
          meal_id: 'meal-3',
          meal_name: 'Sandwich',
        },
        {
          day_index: 0,
          meal_type: 'dinner',
          meal_id: 'meal-2',
          meal_name: 'Chicken Stir Fry',
        },
      ];

      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({
        explanation: 'Changed Monday dinner.',
        operations: [
          { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-2' },
        ],
      });
      mockApplyOperations.mockReturnValue({
        updatedPlan,
        errors: [],
      });
      mockSessionRepo.applyCritiqueUpdates.mockResolvedValue(true);

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
      expect(body.error?.message).toContain('brados mealplan revise');
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

    it('requires TypeSafe credentials even when OpenAI is configured', async () => {
      vi.stubEnv('TYPESAFE_API_KEY', '  ');
      vi.stubEnv('OPENAI_API_KEY', 'unused-openai-key');
      mockSessionRepo.findById.mockResolvedValue(createTestSession());

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Change Monday dinner' });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(500);
      expect(body.error?.code).toBe('MISSING_API_KEY');
      expect(body.error?.message).toContain('TypeSafe');
      expect(mockProcessCritique).not.toHaveBeenCalled();
      expect(mockSessionRepo.applyCritiqueUpdates).not.toHaveBeenCalled();
    });

    it('passes the trimmed TypeSafe key to the meal service', async () => {
      vi.stubEnv('TYPESAFE_API_KEY', '  typesafe-key  ');
      const session = createTestSession();
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'No changes.', operations: [] });
      mockApplyOperations.mockReturnValue({ updatedPlan: session.plan, errors: [] });

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Looks good' });

      expect(response.status).toBe(200);
      expect(mockProcessCritique).toHaveBeenCalledWith(session, 'Looks good', 'typesafe-key', undefined);
    });

    it('does not save a partial draft or its history when validation fails', async () => {
      const session = createTestSession();
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({
        explanation: 'Attempted change.',
        operations: [{ day_index: 0, meal_type: 'dinner', new_meal_id: null }],
      });
      mockApplyOperations.mockReturnValue({ updatedPlan: [], errors: ['Invalid change'] });

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Change some meals' });

      const body = response.body as ApiResponse<CritiqueResponseData>;
      expect(response.status).toBe(200);
      expect(body.data?.plan).toEqual(session.plan);
      expect(body.data?.explanation).toContain('No changes were applied');
      expect(body.data?.errors).toEqual(['Invalid change']);
      expect(body.data?.outcome).toBe('validation_failed');
      expect(mockSessionRepo.applyCritiqueUpdates).not.toHaveBeenCalled();
    });

    it('exposes provider failure without saving an unverified plan', async () => {
      mockSessionRepo.findById.mockResolvedValue(createTestSession());
      mockProcessCritique.mockRejectedValue(new AppError(502, 'JEV_INVALID_RESPONSE', 'Invalid Jev response'));

      const response = await request(mealplansApp)
        .post('/session-1/critique')
        .send({ critique: 'Change Monday dinner' });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(502);
      expect(body.error?.code).toBe('JEV_INVALID_RESPONSE');
      expect(mockSessionRepo.applyCritiqueUpdates).not.toHaveBeenCalled();
    });
  });

  describe('POST /mealplans/:sessionId/revise', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key');
    });

    it('requires TypeSafe credentials for finalized revisions', async () => {
      vi.stubEnv('TYPESAFE_API_KEY', '');
      mockSessionRepo.findById.mockResolvedValue(createTestSession({ is_finalized: true }));

      const response = await request(mealplansApp)
        .post('/session-1/revise')
        .send({ critique: 'Change Monday dinner' });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(500);
      expect(body.error?.code).toBe('MISSING_API_KEY');
      expect(mockProcessCritique).not.toHaveBeenCalled();
    });

    it('records clarification without reconciling recency for an unchanged finalized plan', async () => {
      const session = createTestSession({ is_finalized: true });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Which day?', operations: [] });
      mockApplyOperations.mockReturnValue({ updatedPlan: session.plan, errors: [] });

      const response = await request(mealplansApp)
        .post('/session-1/revise')
        .send({ critique: 'Something different' });

      const body = response.body as ApiResponse<ReviseResponseData>;
      expect(response.status).toBe(200);
      expect(body.data?.plan).toEqual(session.plan);
      expect(body.data?.recency_reconciled).toBe(false);
      expect(mockSessionRepo.applyCritiqueUpdates).toHaveBeenCalledWith(
        'session-1',
        { role: 'user', content: 'Something different' },
        { role: 'assistant', content: 'Which day?', operations: [] },
        session.plan,
        session
      );
      expect(mockReconcileMealLastPlannedForPlanChange).not.toHaveBeenCalled();
      expect(mockSessionRepo.update).not.toHaveBeenCalled();
    });

    it('does not reconcile recency when returned operations leave the actual plan unchanged', async () => {
      const session = createTestSession({ is_finalized: true });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Already assigned.', operations: [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'meal-2' }] });
      mockApplyOperations.mockReturnValue({ updatedPlan: session.plan.map((entry) => ({ ...entry })), errors: [] });
      const response = await request(mealplansApp).post('/session-1/revise').send({ critique: 'Keep Monday dinner' });
      const body = response.body as ApiResponse<ReviseResponseData>;
      expect(response.status).toBe(200);
      expect(body.data?.recency_reconciled).toBe(false);
      expect(mockReconcileMealLastPlannedForPlanChange).not.toHaveBeenCalled();
    });

    it('should revise a finalized session, append history, and reconcile recency', async () => {
      const session = createTestSession({ is_finalized: true });
      const updatedPlan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
        {
          day_index: 0,
          meal_type: 'lunch',
          meal_id: 'meal-3',
          meal_name: 'Sandwich',
        },
        { day_index: 0, meal_type: 'dinner', meal_id: null, meal_name: null },
      ];
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: null },
      ];

      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({
        explanation: 'Removed Monday dinner.',
        operations,
      });
      mockApplyOperations.mockReturnValue({
        updatedPlan,
        errors: [],
      });
      mockSessionRepo.applyCritiqueUpdates.mockResolvedValue(true);
      mockReconcileMealLastPlannedForPlanChange.mockResolvedValue({
        affectedMealIds: ['meal-2'],
      });

      const response = await request(mealplansApp)
        .post('/session-1/revise')
        .send({ critique: 'Remove Monday dinner' });

      const body = response.body as ApiResponse<ReviseResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.plan).toEqual(updatedPlan);
      expect(body.data?.explanation).toBe('Removed Monday dinner.');
      expect(body.data?.operations).toEqual(operations);
      expect(body.data?.errors).toEqual([]);
      expect(body.data?.recency_reconciled).toBe(true);
      expect(mockSessionRepo.applyCritiqueUpdates).toHaveBeenCalledWith(
        'session-1',
        { role: 'user', content: 'Remove Monday dinner' },
        { role: 'assistant', content: 'Removed Monday dinner.', operations, previous_assignments: session.plan.filter((entry) => entry.meal_type === 'dinner') },
        updatedPlan,
        session
      );
      expect(mockReconcileMealLastPlannedForPlanChange).toHaveBeenCalledWith({
        previousPlan: session.plan,
        nextPlan: updatedPlan,
        sessionRepository: mockSessionRepo,
        mealRepository: mockMealRepo,
      });
    });

    it('should reject draft sessions with guidance to use critique', async () => {
      const session = createTestSession({ is_finalized: false });
      mockSessionRepo.findById.mockResolvedValue(session);

      const response = await request(mealplansApp)
        .post('/session-1/revise')
        .send({ critique: 'Change Monday dinner' });

      const body = response.body as ApiResponse;
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe('SESSION_NOT_FINALIZED');
      expect(body.error?.message).toContain('brados mealplan critique');
      expect(mockProcessCritique).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp)
        .post('/non-existent/revise')
        .send({ critique: 'Change something' });

      expect(response.status).toBe(404);
      expect(mockProcessCritique).not.toHaveBeenCalled();
    });

    it('should not persist partial revisions when operations return errors', async () => {
      const session = createTestSession({ is_finalized: true });
      const updatedPlan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
        {
          day_index: 0,
          meal_type: 'lunch',
          meal_id: 'meal-3',
          meal_name: 'Sandwich',
        },
        { day_index: 0, meal_type: 'dinner', meal_id: null, meal_name: null },
      ];
      const operations: CritiqueOperation[] = [
        { day_index: 0, meal_type: 'dinner', new_meal_id: null },
        { day_index: 2, meal_type: 'dinner', new_meal_id: 'missing-meal' },
      ];

      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({
        explanation: 'Tried to revise dinner.',
        operations,
      });
      mockApplyOperations.mockReturnValue({
        updatedPlan,
        errors: ['Meal ID "missing-meal" not found in meals snapshot'],
      });

      const response = await request(mealplansApp)
        .post('/session-1/revise')
        .send({ critique: 'Change some dinners' });

      const body = response.body as ApiResponse<ReviseResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.plan).toEqual(session.plan);
      expect(body.data?.errors).toEqual([
        'Meal ID "missing-meal" not found in meals snapshot',
      ]);
      expect(body.data?.recency_reconciled).toBe(false);
      expect(body.data?.outcome).toBe('validation_failed');
      expect(mockSessionRepo.applyCritiqueUpdates).not.toHaveBeenCalled();
      expect(mockReconcileMealLastPlannedForPlanChange).not.toHaveBeenCalled();
    });
  });

  describe.each(['critique', 'revise'])('POST /mealplans/:sessionId/%s contract', (endpoint) => {
    beforeEach(() => {
      vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key');
    });

    it('passes context through and returns the explicit outcome', async () => {
      const session = createTestSession({ is_finalized: endpoint === 'revise' });
      const context = { original_request: 'Plan this week', interpretation: 'Preserve breakfasts', calendar_context: 'Tuesday dinner out', planning_week_start: '2026-09-21' };
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Which dinner?', operations: [], outcome: 'clarification_required' });
      mockApplyOperations.mockReturnValue({ updatedPlan: session.plan, errors: [] });
      const response = await request(mealplansApp).post(`/session-1/${endpoint}`).send({ critique: 'Change dinner', context });
      const body = response.body as ApiResponse<CritiqueResponseData>;
      expect(response.status).toBe(200);
      expect(body.data?.outcome).toBe('clarification_required');
      expect(mockProcessCritique).toHaveBeenCalledWith(session, 'Change dinner', 'test-typesafe-key', context);
      expect(mockSessionRepo.applyCritiqueUpdates).toHaveBeenCalledWith('session-1', { role: 'user', content: 'Change dinner', context }, expect.anything(), session.plan, session);
    });

    it('stores original assignments for applied edits without treating every displacement as dislike', async () => {
      const session = createTestSession({ is_finalized: endpoint === 'revise' });
      const operations: CritiqueOperation[] = [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: null }];
      const updatedPlan = session.plan.map((entry) => entry.meal_type === 'dinner' ? { ...entry, meal_id: null, meal_name: null } : entry);
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Cleared dinner for your reservation', operations, outcome: 'applied' });
      mockApplyOperations.mockReturnValue({ updatedPlan, errors: [] });
      const response = await request(mealplansApp).post(`/session-1/${endpoint}`).send({ critique: 'Dinner out Monday; remove dinner' });
      expect(response.status).toBe(200);
      expect(mockSessionRepo.applyCritiqueUpdates).toHaveBeenCalledWith('session-1', { role: 'user', content: 'Dinner out Monday; remove dinner' }, {
        role: 'assistant', content: 'Cleared dinner for your reservation', operations,
        previous_assignments: session.plan.filter((entry) => entry.meal_type === 'dinner'),
      }, updatedPlan, session);
    });

    it('returns 409 and avoids recency writes if the loaded session became stale', async () => {
      const session = createTestSession({ is_finalized: endpoint === 'revise' });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'Updated dinner', operations: [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: null }], outcome: 'applied' });
      mockApplyOperations.mockReturnValue({ updatedPlan: [], errors: [] });
      mockSessionRepo.applyCritiqueUpdates.mockResolvedValue(false);
      const response = await request(mealplansApp).post(`/session-1/${endpoint}`).send({ critique: 'Remove dinner' });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(409);
      expect(body.error?.code).toBe('SESSION_CONFLICT');
      expect(mockReconcileMealLastPlannedForPlanChange).not.toHaveBeenCalled();
    });

    it('uses TypeSafe credentials even when obsolete GPT selection remains configured', async () => {
      vi.stubEnv('MEALPLAN_CRITIQUE_PROVIDER', 'gpt');
      vi.stubEnv('TYPESAFE_API_KEY', '  typesafe-key  ');
      vi.stubEnv('OPENAI_API_KEY', '');
      const session = createTestSession({ is_finalized: endpoint === 'revise' });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockProcessCritique.mockResolvedValue({ explanation: 'No changes', operations: [], outcome: 'no_change_requested' });
      mockApplyOperations.mockReturnValue({ updatedPlan: session.plan, errors: [] });
      const response = await request(mealplansApp).post(`/session-1/${endpoint}`).send({ critique: 'Looks good' });
      expect(response.status).toBe(200);
      expect(mockProcessCritique).toHaveBeenCalledWith(session, 'Looks good', 'typesafe-key', undefined);
    });

    it('cannot use OpenAI credentials in place of a missing TypeSafe key', async () => {
      vi.stubEnv('MEALPLAN_CRITIQUE_PROVIDER', 'gpt');
      vi.stubEnv('TYPESAFE_API_KEY', '  ');
      vi.stubEnv('OPENAI_API_KEY', 'configured-for-another-feature');
      mockSessionRepo.findById.mockResolvedValue(createTestSession({ is_finalized: endpoint === 'revise' }));
      const response = await request(mealplansApp).post(`/session-1/${endpoint}`).send({ critique: 'Looks good' });
      const body = response.body as ApiResponse;
      expect(response.status).toBe(500);
      expect(body.error?.code).toBe('MISSING_API_KEY');
      expect(body.error?.message).toContain('TypeSafe');
      expect(mockProcessCritique).not.toHaveBeenCalled();
    });
  });

  describe('POST /mealplans/:sessionId/finalize', () => {
    it('should finalize and update lastPlanned for all meals in plan', async () => {
      const session = createTestSession();
      const finalized = { ...session, is_finalized: true, updated_at: '2026-09-20T16:00:00.000Z' };
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.finalize.mockResolvedValue(finalized);

      const response = await request(mealplansApp)
        .post('/session-1/finalize')
        .send();

      const body = response.body as ApiResponse<FinalizeResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data?.finalized).toBe(true);

      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
      expect(mockSessionRepo.finalize).toHaveBeenCalledWith('session-1', session, [...new Set(session.plan.flatMap((entry) => entry.meal_id === null ? [] : [entry.meal_id]))]);
      expect(mockSessionRepo.update).not.toHaveBeenCalled();
    });

    it('delegates the exact snapshot including empty slots to atomic finalization', async () => {
      const plan: MealPlanEntry[] = [
        {
          day_index: 0,
          meal_type: 'breakfast',
          meal_id: 'meal-1',
          meal_name: 'Oatmeal',
        },
        { day_index: 0, meal_type: 'lunch', meal_id: null, meal_name: null },
        {
          day_index: 0,
          meal_type: 'dinner',
          meal_id: 'meal-2',
          meal_name: 'Chicken Stir Fry',
        },
      ];
      const session = createTestSession({ plan });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.finalize.mockResolvedValue({
        ...session,
        is_finalized: true,
      });

      const response = await request(mealplansApp)
        .post('/session-1/finalize')
        .send();

      expect(response.status).toBe(200);
      expect(mockSessionRepo.finalize).toHaveBeenCalledWith('session-1', session, [...new Set(session.plan.flatMap((entry) => entry.meal_id === null ? [] : [entry.meal_id]))]);
      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
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
      expect(mockSessionRepo.finalize).not.toHaveBeenCalled();
      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp)
        .post('/non-existent/finalize')
        .send();

      expect(response.status).toBe(404);
      expect(mockSessionRepo.finalize).not.toHaveBeenCalled();
      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
    });

    it('rejects a stale finalization without writing any meal recency', async () => {
      const session = createTestSession();
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.finalize.mockResolvedValue(null);
      const response = await request(mealplansApp).post('/session-1/finalize').send();
      const body = response.body as ApiResponse;
      expect(response.status).toBe(409);
      expect(body.error?.code).toBe('SESSION_CONFLICT');
      expect(mockSessionRepo.finalize).toHaveBeenCalledWith('session-1', session, [...new Set(session.plan.flatMap((entry) => entry.meal_id === null ? [] : [entry.meal_id]))]);
      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
      expect(mockSessionRepo.update).not.toHaveBeenCalled();
    });

    it('does not write meal recency if the finalization transaction fails', async () => {
      mockSessionRepo.findById.mockResolvedValue(createTestSession());
      mockSessionRepo.finalize.mockRejectedValueOnce(new Error('Transaction unavailable'));
      const response = await request(mealplansApp).post('/session-1/finalize').send();
      expect(response.status).toBe(500);
      expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
      expect(mockSessionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /mealplans/:sessionId', () => {
    it('should delete a draft session without recency side effects', async () => {
      const session = createTestSession({ is_finalized: false });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.delete.mockResolvedValue(true);

      const response = await request(mealplansApp).delete('/session-1').send();

      const body = response.body as ApiResponse<DeleteResponseData>;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        deleted: true,
        was_finalized: false,
        recency_reconciled: false,
      });
      expect(mockSessionRepo.delete).toHaveBeenCalledWith('session-1');
      expect(mockReconcileMealLastPlanned).not.toHaveBeenCalled();
    });

    it('should delete a finalized session and reconcile affected meal recency', async () => {
      const plan: MealPlanEntry[] = [
        createMealPlanEntry({ meal_id: 'meal-1', meal_name: 'Oatmeal' }),
        createMealPlanEntry({
          meal_id: 'meal-2',
          meal_name: 'Chicken Stir Fry',
        }),
      ];
      const session = createTestSession({ plan, is_finalized: true });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.delete.mockResolvedValue(true);

      const response = await request(mealplansApp).delete('/session-1').send();

      const body = response.body as ApiResponse<DeleteResponseData>;
      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        deleted: true,
        was_finalized: true,
        recency_reconciled: true,
      });
      expect(mockReconcileMealLastPlanned).toHaveBeenCalledWith(
        mockMealRepo,
        mockSessionRepo,
        ['meal-1', 'meal-2']
      );
    });

    it('should make latest return the next newest session after deleting the newest draft', async () => {
      const newest = createTestSession({
        id: 'session-new',
        is_finalized: false,
      });
      const older = createTestSession({
        id: 'session-old',
        created_at: '2026-06-07T00:00:00.000Z',
      });
      mockSessionRepo.findById.mockResolvedValue(newest);
      mockSessionRepo.delete.mockResolvedValue(true);
      mockSessionRepo.findLatest.mockResolvedValue(older);

      const deleteResponse = await request(mealplansApp)
        .delete('/session-new')
        .send();
      const latestResponse = await request(mealplansApp).get('/latest');

      expect(deleteResponse.status).toBe(200);
      expect(latestResponse.status).toBe(200);
      expect(latestResponse.body).toEqual({ success: true, data: { ...older, feature_flags: { adult_breakfast_enabled: true } } });
    });

    it('should make latest return null after deleting the only draft session', async () => {
      const session = createTestSession({
        id: 'session-only',
        is_finalized: false,
      });
      mockSessionRepo.findById.mockResolvedValue(session);
      mockSessionRepo.delete.mockResolvedValue(true);
      mockSessionRepo.findLatest.mockResolvedValue(null);

      const deleteResponse = await request(mealplansApp)
        .delete('/session-only')
        .send();
      const latestResponse = await request(mealplansApp).get('/latest');

      expect(deleteResponse.status).toBe(200);
      expect(latestResponse.status).toBe(200);
      expect(latestResponse.body).toEqual({ success: true, data: null });
    });

    it('should return 404 when deleting a missing session', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      const response = await request(mealplansApp)
        .delete('/non-existent')
        .send();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'MealPlanSession with id non-existent not found',
        },
      });
      expect(mockSessionRepo.delete).not.toHaveBeenCalled();
    });
  });
});
