import { describe, it, expect } from 'vitest';
import type { MealPlanEntry, MealPlanSession } from '../shared.js';
import {
  createMealPlanEntry,
  createMealPlanSession,
  createMockMealRepository,
  createMockMealPlanSessionRepository,
} from '../__tests__/utils/index.js';
import {
  getAffectedMealIds,
  getUniquePlannedMealIds,
  markPlanMealsLastPlanned,
  reconcileMealLastPlanned,
  reconcileMealLastPlannedForPlanChange,
} from './mealplan-recency.service.js';

function planEntry(
  mealId: string | null,
  overrides: Partial<MealPlanEntry> = {}
): MealPlanEntry {
  return createMealPlanEntry({
    day_index: 0,
    meal_type: 'dinner',
    meal_id: mealId,
    meal_name: mealId === null ? null : mealId,
    ...overrides,
  });
}

function finalizedSession(
  overrides: Partial<MealPlanSession>
): MealPlanSession {
  return createMealPlanSession({
    is_finalized: true,
    ...overrides,
  });
}

describe('MealPlan Recency Service', () => {
  it('deduplicates planned meal IDs and skips empty plan entries', () => {
    const mealIds = getUniquePlannedMealIds([
      planEntry('meal-1'),
      planEntry(null, { day_index: 1 }),
      planEntry('meal-1', { day_index: 2 }),
      planEntry('meal-2', { day_index: 3 }),
    ]);

    expect(mealIds).toEqual(['meal-1', 'meal-2']);
  });

  it('returns sorted affected meal IDs from the old and new plans', () => {
    const previousPlan = [
      planEntry('meal-old'),
      planEntry(null, { day_index: 1 }),
    ];
    const nextPlan = [
      planEntry('meal-new'),
      planEntry('meal-old', { day_index: 1 }),
    ];

    expect(getAffectedMealIds(previousPlan, nextPlan)).toEqual([
      'meal-new',
      'meal-old',
    ]);
  });

  it('marks each planned meal once when finalizing a plan', async () => {
    const mealRepository = createMockMealRepository();
    mealRepository.updateLastPlanned.mockResolvedValue(null);

    await markPlanMealsLastPlanned(
      mealRepository,
      [planEntry('meal-1'), planEntry('meal-1'), planEntry('meal-2')],
      '2026-06-14T12:00:00.000Z'
    );

    expect(mealRepository.updateLastPlanned).toHaveBeenCalledTimes(2);
    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-1',
      '2026-06-14T12:00:00.000Z'
    );
    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-2',
      '2026-06-14T12:00:00.000Z'
    );
  });

  it('sets affected meals to the newest remaining finalized session timestamp', async () => {
    const mealRepository = createMockMealRepository();
    const sessionRepository = createMockMealPlanSessionRepository();
    const olderSession = finalizedSession({
      id: 'older-session',
      plan: [planEntry('meal-old')],
      updated_at: '2026-06-01T12:00:00.000Z',
    });
    const newerSession = finalizedSession({
      id: 'newer-session',
      plan: [planEntry('meal-new')],
      updated_at: '2026-06-14T12:00:00.000Z',
    });

    sessionRepository.findAll.mockResolvedValue([newerSession, olderSession]);
    mealRepository.updateLastPlanned.mockResolvedValue(null);

    const result = await reconcileMealLastPlannedForPlanChange({
      previousPlan: [planEntry('meal-old')],
      nextPlan: [planEntry('meal-new')],
      sessionRepository,
      mealRepository,
    });

    expect(result.affectedMealIds).toEqual(['meal-new', 'meal-old']);
    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-new',
      '2026-06-14T12:00:00.000Z'
    );
    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-old',
      '2026-06-01T12:00:00.000Z'
    );
  });

  it('clears last_planned when no finalized session still contains a removed meal', async () => {
    const mealRepository = createMockMealRepository();
    const sessionRepository = createMockMealPlanSessionRepository();
    const draftSession = createMealPlanSession({
      is_finalized: false,
      plan: [planEntry('meal-removed')],
      updated_at: '2026-06-14T12:00:00.000Z',
    });

    sessionRepository.findAll.mockResolvedValue([draftSession]);
    mealRepository.updateLastPlanned.mockResolvedValue(null);

    await reconcileMealLastPlannedForPlanChange({
      previousPlan: [planEntry('meal-removed')],
      nextPlan: [planEntry(null)],
      sessionRepository,
      mealRepository,
    });

    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-removed',
      null
    );
  });

  it('reconciles deleted finalized session meals against remaining finalized sessions', async () => {
    const mealRepository = createMockMealRepository();
    const sessionRepository = createMockMealPlanSessionRepository();
    sessionRepository.findAll.mockResolvedValue([
      finalizedSession({
        id: 'older',
        updated_at: '2026-06-01T00:00:00.000Z',
        plan: [planEntry('meal-1')],
      }),
      finalizedSession({
        id: 'newer',
        updated_at: '2026-06-10T00:00:00.000Z',
        plan: [planEntry('meal-1')],
      }),
      createMealPlanSession({
        id: 'draft',
        is_finalized: false,
        updated_at: '2026-06-12T00:00:00.000Z',
        plan: [planEntry('meal-2')],
      }),
    ]);
    mealRepository.updateLastPlanned.mockResolvedValue(null);

    await reconcileMealLastPlanned(mealRepository, sessionRepository, [
      'meal-1',
      'meal-2',
    ]);

    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-1',
      '2026-06-10T00:00:00.000Z'
    );
    expect(mealRepository.updateLastPlanned).toHaveBeenCalledWith(
      'meal-2',
      null
    );
  });

  it('does not query sessions when no meal IDs are affected', async () => {
    const mealRepository = createMockMealRepository();
    const sessionRepository = createMockMealPlanSessionRepository();

    const result = await reconcileMealLastPlannedForPlanChange({
      previousPlan: [planEntry(null)],
      nextPlan: [planEntry(null)],
      sessionRepository,
      mealRepository,
    });
    await reconcileMealLastPlanned(mealRepository, sessionRepository, []);

    expect(result.affectedMealIds).toEqual([]);
    expect(sessionRepository.findAll).not.toHaveBeenCalled();
    expect(mealRepository.updateLastPlanned).not.toHaveBeenCalled();
  });
});
