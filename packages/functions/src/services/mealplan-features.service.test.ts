import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMeal, createMealPlanEntry, createMealPlanSession } from '../__tests__/utils/index.js';
import { adultBreakfastEnabled, activeMealPlan, activeMealPlanSession, preserveDisabledEntries } from './mealplan-features.service.js';
import { applyOperations } from './mealplan-operations.service.js';

afterEach(() => vi.unstubAllEnvs());
describe('Adult breakfast feature policy', () => {
  const kid = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'family', meal_id: 'kid' });
  const adult = createMealPlanEntry({ meal_type: 'breakfast', meal_track: 'adult', meal_id: 'adult' });
  it('defaults off and only accepts an explicit true value', () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', undefined);
    expect(adultBreakfastEnabled()).toBe(false);
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
    expect(adultBreakfastEnabled()).toBe(false);
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'true');
    expect(adultBreakfastEnabled()).toBe(true);
  });
  it('projects legacy sessions without mutating saved meals or history', () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
    const saved = createMealPlanSession({ plan: [kid, adult], meals_snapshot: [createMeal({ audience: 'adult', meal_type: 'breakfast' })], history: [{ role: 'assistant', content: 'Changed breakfast', operations: [{ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'adult' }], previous_assignments: [adult] }] });
    const projected = activeMealPlanSession(saved);
    expect(projected.plan).toEqual([kid]);
    expect(projected.meals_snapshot).toEqual([]);
    expect(projected.history[0]?.operations).toEqual([]);
    expect(projected.history[0]?.previous_assignments).toEqual([]);
    expect(saved.plan).toEqual([kid, adult]);
    expect(saved.history[0]?.operations).toHaveLength(1);
    const changed = { ...kid, meal_id: 'new-kid' };
    expect(preserveDisabledEntries(saved.plan, [changed])).toEqual([changed, adult]);
  });
  it('rejects an adult edit atomically while preserving legacy saved entries', () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
    const result = applyOperations([kid, adult], [{ day_index: 0, meal_type: 'breakfast', meal_track: 'adult', new_meal_id: null }], []);
    expect(result.errors).toContain('Adult breakfast is disabled');
    expect(result.updatedPlan).toEqual([kid, adult]);
  });
  it('matches legacy missing tracks to family when merging active edits', () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
    const legacy = { ...kid, meal_track: undefined };
    const changed = { ...kid, meal_id: 'replacement' };
    expect(preserveDisabledEntries([legacy, adult], [changed])).toEqual([changed, adult]);
    expect(preserveDisabledEntries([kid, adult], [{ ...changed, meal_track: undefined }])).toEqual([{ ...changed, meal_track: undefined }, adult]);
  });
  it('restores both tracks and adult editing when enabled', () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'true');
    expect(activeMealPlan([kid, adult])).toEqual([kid, adult]);
    const result = applyOperations([kid, adult], [{ day_index: 0, meal_type: 'breakfast', meal_track: 'adult', new_meal_id: null }], []);
    expect(result.errors).toEqual([]);
    expect(result.updatedPlan[1]?.meal_id).toBeNull();
  });
});
