import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type {
  ConversationMessage,
  JevQuestion,
  MealPlanSession,
} from '../shared.js';
import {
  type ApiResponse,
  createMeal,
  createMealPlanEntry,
  createMealPlanSession,
  createMockIngredientRepository,
  createMockMealPlanSessionRepository,
  createMockMealRepository,
  createMockRecipeRepository,
} from '../__tests__/utils/index.js';

interface CritiqueResponseData {
  plan: MealPlanSession['plan'];
  explanation: string;
  errors: string[];
}

interface PostedJevRequest {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
}

function createDraftSession(): MealPlanSession {
  const currentMeal = createMeal({
    id: 'meal-old',
    name: 'Pasta',
    meal_type: 'dinner',
    audience: 'family',
    effort: 4,
    has_red_meat: false,
    prep_ahead: false,
  });
  const replacementMeal = createMeal({
    id: 'meal-new',
    name: 'Chicken Stir Fry',
    meal_type: 'dinner',
    audience: 'family',
    effort: 5,
    has_red_meat: false,
    prep_ahead: false,
  });

  return createMealPlanSession({
    id: 'session-jev',
    plan: [
      createMealPlanEntry({
        day_index: 0,
        meal_track: 'family',
        meal_type: 'dinner',
        meal_id: currentMeal.id,
        meal_name: currentMeal.name,
      }),
    ],
    meals_snapshot: [currentMeal, replacementMeal],
    history: [],
    is_finalized: false,
    created_at: '2026-09-15T12:00:00.000Z',
    updated_at: '2026-09-15T12:00:00.000Z',
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function choiceAnswer(
  question: Extract<JevQuestion, { type: 'choice' }>,
  choice: string
): Record<string, unknown> {
  return {
    type: 'choice',
    choice,
    confidence: 1,
    probabilities: Object.fromEntries(
      Object.keys(question.criteria).map((option) => [
        option,
        option === choice ? 1 : 0,
      ])
    ),
  };
}

function validJevResponse(posted: PostedJevRequest): Record<string, unknown> {
  const matchingCandidates = Object.hasOwn(
    posted.state,
    'candidate_evaluations'
  );
  const answers = Object.fromEntries(
    Object.entries(posted.questions).map(([head, question]) => {
      if (question.type === 'noul') {
        return [head, { type: 'noul', noul: matchingCandidates ? 1 : 0 }];
      }
      const choice =
        head === 'request'
          ? 'change'
          : head.startsWith('action_')
            ? 'replace'
            : Object.keys(question.criteria)[0] ?? '';
      return [head, choiceAnswer(question, choice)];
    })
  );
  return { model: posted.model, answers };
}

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));

const mockMealRepo = createMockMealRepository();
const mockSessionRepo = createMockMealPlanSessionRepository();
const mockRecipeRepo = createMockRecipeRepository();
const mockIngredientRepo = createMockIngredientRepository();

vi.mock('../repositories/meal.repository.js', () => ({
  MealRepository: vi.fn().mockImplementation(() => mockMealRepo),
}));

vi.mock('../repositories/mealplan-session.repository.js', () => ({
  MealPlanSessionRepository: vi.fn().mockImplementation(() => mockSessionRepo),
}));

vi.mock('../repositories/recipe.repository.js', () => ({
  RecipeRepository: vi.fn().mockImplementation(() => mockRecipeRepo),
}));

vi.mock('../repositories/ingredient.repository.js', () => ({
  IngredientRepository: vi.fn().mockImplementation(() => mockIngredientRepo),
}));

vi.mock('../services/mealplan-recency.service.js', () => ({
  getUniquePlannedMealIds: vi.fn(),
  markPlanMealsLastPlanned: vi.fn(),
  reconcileMealLastPlanned: vi.fn(),
  reconcileMealLastPlannedForPlanChange: vi.fn(),
}));

import { mealplansApp } from './mealplans.js';
import {
  getUniquePlannedMealIds,
  markPlanMealsLastPlanned,
  reconcileMealLastPlanned,
  reconcileMealLastPlannedForPlanChange,
} from '../services/mealplan-recency.service.js';

const mockGetUniquePlannedMealIds = vi.mocked(getUniquePlannedMealIds);
const mockMarkPlanMealsLastPlanned = vi.mocked(markPlanMealsLastPlanned);
const mockReconcileMealLastPlanned = vi.mocked(reconcileMealLastPlanned);
const mockReconcileMealLastPlannedForPlanChange = vi.mocked(
  reconcileMealLastPlannedForPlanChange
);
const mockFetch = vi.fn();

let persistedSession = createDraftSession();

function expectNoUnrelatedMealPlanCalls(): void {
  expect(mockSessionRepo.update).not.toHaveBeenCalled();
  expect(mockMealRepo.findAll).not.toHaveBeenCalled();
  expect(mockMealRepo.updateLastPlanned).not.toHaveBeenCalled();
  expect(mockRecipeRepo.findAll).not.toHaveBeenCalled();
  expect(mockIngredientRepo.findAll).not.toHaveBeenCalled();
  expect(mockGetUniquePlannedMealIds).not.toHaveBeenCalled();
  expect(mockMarkPlanMealsLastPlanned).not.toHaveBeenCalled();
  expect(mockReconcileMealLastPlanned).not.toHaveBeenCalled();
  expect(mockReconcileMealLastPlannedForPlanChange).not.toHaveBeenCalled();
}

describe('mealplans Jev API flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    persistedSession = createDraftSession();
    mockSessionRepo.findById.mockImplementation(
      (id: string): Promise<MealPlanSession | null> =>
        Promise.resolve(id === persistedSession.id ? persistedSession : null)
    );
    mockSessionRepo.applyCritiqueUpdates.mockImplementation(
      (
        id: string,
        userMessage: ConversationMessage,
        assistantMessage: ConversationMessage,
        updatedPlan: MealPlanSession['plan']
      ): Promise<void> => {
        if (id === persistedSession.id) {
          persistedSession = {
            ...persistedSession,
            plan: updatedPlan.map((entry) => ({ ...entry })),
            history: [
              ...persistedSession.history,
              { ...userMessage },
              { ...assistantMessage },
            ],
            updated_at: '2026-09-17T12:00:00.000Z',
          };
        }
        return Promise.resolve();
      }
    );
    mockFetch.mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const posted = JSON.parse(String(init?.body)) as PostedJevRequest;
        return jsonResponse(validJevResponse(posted));
      }
    );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key');
    vi.stubEnv('JEV_MODEL', 'jev-1.13.0');
    vi.stubEnv('JEV_TIMEOUT_MS', '30000');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('persists a validated draft replacement and reads the same session back', async () => {
    const critique = 'Replace Monday dinner with Chicken Stir Fry';
    const postResponse = await request(mealplansApp)
      .post('/session-jev/critique')
      .send({ critique });
    const postBody = postResponse.body as ApiResponse<CritiqueResponseData>;

    expect(postResponse.status).toBe(200);
    expect(postBody.success).toBe(true);
    expect(postBody.data?.errors).toEqual([]);
    expect(postBody.data?.plan).toEqual([
      expect.objectContaining({
        day_index: 0,
        meal_track: 'family',
        meal_type: 'dinner',
        meal_id: 'meal-new',
        meal_name: 'Chicken Stir Fry',
      }),
    ]);
    expect(mockSessionRepo.applyCritiqueUpdates).toHaveBeenCalledTimes(1);

    const getResponse = await request(mealplansApp).get('/session-jev');
    const getBody = getResponse.body as ApiResponse<MealPlanSession>;
    expect(getResponse.status).toBe(200);
    expect(getBody).toEqual({ success: true, data: persistedSession });
    expect(persistedSession.is_finalized).toBe(false);
    expect(persistedSession.history).toHaveLength(2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of mockFetch.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-typesafe-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(init.body))).toEqual(
        expect.objectContaining({ model: 'jev-1.13.0' })
      );
    }
    const firstRequest = JSON.parse(
      String((mockFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    ) as PostedJevRequest;
    const secondRequest = JSON.parse(
      String((mockFetch.mock.calls[1]?.[1] as RequestInit | undefined)?.body)
    ) as PostedJevRequest;
    expect(firstRequest.state).toEqual(
      expect.objectContaining({
        latest_request: critique,
        conversation_history: [],
      })
    );
    expect(firstRequest.state).not.toHaveProperty('candidate_evaluations');
    expect(Object.keys(firstRequest.questions)).toEqual([
      'request',
      'action_slot_0',
      'easier_slot_0',
    ]);
    expect(Object.keys(secondRequest.questions)).toEqual(['match_slot_0_0']);
    expect(secondRequest.state).toEqual(
      expect.objectContaining({
        candidate_evaluations: {
          match_slot_0_0: {
            slot_id: 'slot_0',
            target_slot: expect.objectContaining({
              meal_id: 'meal-old',
              meal_name: 'Pasta',
            }),
            candidate: {
              id: 'meal-new',
              name: 'Chicken Stir Fry',
              meal_type: 'dinner',
              audience: 'family',
              effort: 5,
              has_red_meat: false,
              prep_ahead: false,
            },
          },
        },
      })
    );
    expectNoUnrelatedMealPlanCalls();
  });

  it('rejects a malformed provider reply without persisting any changes', async () => {
    const originalSession = structuredClone(persistedSession);
    mockFetch.mockResolvedValue(
      jsonResponse({ model: 'jev-1.13.0', answers: {} })
    );

    const response = await request(mealplansApp)
      .post('/session-jev/critique')
      .send({ critique: 'Replace Monday dinner with Chicken Stir Fry' });
    const body = response.body as ApiResponse;

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('JEV_INVALID_RESPONSE');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSessionRepo.applyCritiqueUpdates).not.toHaveBeenCalled();
    expect(persistedSession).toEqual(originalSession);
    expectNoUnrelatedMealPlanCalls();
  });
});
