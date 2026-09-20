import { describe, expect, it } from 'vitest';
import type { Meal, MealPlanEntry } from '../shared.js';
import { createMeal, createMealPlanEntry, createMealPlanSession } from '../__tests__/utils/index.js';
import { feasibleChoices } from './mealplan-feasibility.service.js';

function slot(day: number, meal: Meal | null): MealPlanEntry {
  return createMealPlanEntry({
    day_index: day,
    meal_track: meal?.audience ?? 'family',
    meal_type: meal?.meal_type ?? 'dinner',
    meal_id: meal?.id ?? null,
    meal_name: meal?.name ?? null,
  });
}

function empty(plan: MealPlanEntry[]): MealPlanEntry[] {
  return plan.map((entry) => ({ ...entry, meal_id: null, meal_name: null }));
}

describe('meal-plan structural feasibility', () => {
  it('keeps every alternative that can participate in a complete assignment', () => {
    const a = createMeal({ id: 'a' });
    const b = createMeal({ id: 'b' });
    const c = createMeal({ id: 'c' });
    const plan = [slot(0, null), slot(2, null), slot(4, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a, b, c] });
    const remaining = new Map([[0, [a, b]], [1, [b, c]], [2, [a, b]]]);
    const before = structuredClone({ session, plan, remaining });

    const result = feasibleChoices(session, plan, remaining);

    expect(result.status).toBe('feasible');
    expect(result.choices).toEqual(new Map([[0, [a, b]], [1, [c]], [2, [a, b]]]));
    expect({ session, plan, remaining }).toEqual(before);
  });

  it('reports true infeasibility when slots compete for the same only meal', () => {
    const a = createMeal({ id: 'a' });
    const plan = [slot(0, null), slot(2, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a] });

    const result = feasibleChoices(session, plan, new Map([[0, [a]], [1, [a]]]));

    expect(result).toEqual({ status: 'infeasible', choices: new Map([[0, []], [1, []]]) });
  });

  it('allows simultaneous swaps after all changing slots are freed', () => {
    const a = createMeal({ id: 'a', prep_ahead: true });
    const b = createMeal({ id: 'b' });
    const plan = [slot(0, a), slot(2, b)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a, b] });

    const result = feasibleChoices(session, empty(plan), new Map([[0, [b]], [1, [a]]]));

    expect(result.status).toBe('feasible');
    expect(result.choices).toEqual(new Map([[0, [b]], [1, [a]]]));
  });

  it('counts a prior selected assignment and all fixed meals against prep capacity', () => {
    const meals = Array.from({ length: 4 }, (_, index) => createMeal({ id: `prep-${index}`, prep_ahead: true }));
    const plan = [slot(0, meals[0] ?? null), slot(2, meals[1] ?? null), slot(4, null), slot(6, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: meals });
    const base = plan.map((entry, index) => index === 2 ? slot(4, meals[2] ?? null) : entry);

    const result = feasibleChoices(session, base, new Map([[3, [meals[3]!]]]));

    expect(result.status).toBe('infeasible');
    expect(result.choices.get(3)).toEqual([]);
  });

  it('preserves an existing prep overage without treating temporary removals as a new cap', () => {
    const meals = Array.from({ length: 5 }, (_, index) => createMeal({ id: `prep-${index}`, prep_ahead: true }));
    const plan = meals.slice(0, 4).map((meal, index) => slot(index, meal));
    const session = createMealPlanSession({ plan, meals_snapshot: meals });
    const base = plan.map((entry, index) => index === 0 ? slot(0, null) : entry);

    const result = feasibleChoices(session, base, new Map([[0, [meals[4]!]]]));

    expect(result.status).toBe('feasible');
    expect(result.choices.get(0)).toEqual([meals[4]]);
  });

  it('rejects a third red-meat dinner even when the days are nonconsecutive', () => {
    const meals = Array.from({ length: 3 }, (_, index) => createMeal({ id: `red-${index}`, has_red_meat: true }));
    const plan = [slot(0, meals[0] ?? null), slot(2, meals[1] ?? null), slot(4, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: meals });

    expect(feasibleChoices(session, plan, new Map([[2, [meals[2]!]]])).status).toBe('infeasible');
  });

  it('rejects newly consecutive red-meat dinners but preserves an existing consecutive pair', () => {
    const a = createMeal({ id: 'a', has_red_meat: true });
    const b = createMeal({ id: 'b', has_red_meat: true });
    const c = createMeal({ id: 'c', has_red_meat: true });
    const plan = [slot(0, a), slot(1, b)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a, b, c] });
    const base = [slot(0, a), slot(1, null)];

    expect(feasibleChoices(session, base, new Map([[1, [c]]])).status).toBe('feasible');
    expect(feasibleChoices({ ...session, plan: base }, base, new Map([[1, [c]]])).status).toBe('infeasible');
  });

  it('allows a non-increasing legacy red-meat count above two', () => {
    const meals = Array.from({ length: 4 }, (_, index) => createMeal({ id: `red-${index}`, has_red_meat: true }));
    const plan = [slot(0, meals[0] ?? null), slot(2, meals[1] ?? null), slot(4, meals[2] ?? null)];
    const session = createMealPlanSession({ plan, meals_snapshot: meals });
    const base = [slot(0, null), plan[1]!, plan[2]!];

    expect(feasibleChoices(session, base, new Map([[0, [meals[3]!]]])).status).toBe('feasible');
  });

  it('allows repeated adult breakfasts only with fewer than seven catalog choices', () => {
    const meals = Array.from({ length: 7 }, (_, index) => createMeal({ id: `adult-${index}`, audience: 'adult', meal_type: 'breakfast' }));
    const plan = [slot(0, meals[0] ?? null), slot(1, meals[1] ?? null)];
    const base = empty(plan);
    const remaining = new Map([[0, [meals[0]!]], [1, [meals[0]!]]]);
    const session = createMealPlanSession({ plan, meals_snapshot: meals.slice(0, 6) });

    expect(feasibleChoices(session, base, remaining).status).toBe('feasible');
    expect(feasibleChoices({ ...session, meals_snapshot: meals }, base, remaining).status).toBe('infeasible');
  });

  it('permits moving an existing duplicate without increasing its multiplicity', () => {
    const a = createMeal({ id: 'a' });
    const b = createMeal({ id: 'b' });
    const c = createMeal({ id: 'c' });
    const plan = [slot(0, a), slot(2, a), slot(4, b)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a, b, c] });

    expect(feasibleChoices(session, [plan[0]!, plan[1]!, slot(4, null)], new Map([[2, [c]]])).status).toBe('feasible');
    expect(feasibleChoices(session, [plan[0]!, slot(2, null), slot(4, null)], new Map([[2, [a]]])).status).toBe('feasible');
    expect(feasibleChoices(session, [plan[0]!, slot(2, null), slot(4, null)], new Map([[1, [b]], [2, [a]]])).status).toBe('feasible');
    expect(feasibleChoices(session, [plan[0]!, plan[1]!, slot(4, null)], new Map([[2, [a]]])).status).toBe('infeasible');
  });

  it('filters missing catalog IDs, wrong audiences and wrong meal types', () => {
    const good = createMeal({ id: 'good' });
    const adult = createMeal({ id: 'adult', audience: 'adult' });
    const breakfast = createMeal({ id: 'breakfast', meal_type: 'breakfast' });
    const missing = createMeal({ id: 'missing' });
    const plan = [slot(0, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: [good, adult, breakfast] });

    expect(feasibleChoices(session, plan, new Map([[0, [good, adult, breakfast, missing, good]]])).choices.get(0)).toEqual([good]);
  });

  it('uses catalog evidence rather than caller-supplied meal attributes', () => {
    const meals = Array.from({ length: 4 }, (_, index) => createMeal({ id: `prep-${index}`, prep_ahead: true }));
    const plan = [slot(0, meals[0] ?? null), slot(1, meals[1] ?? null), slot(2, meals[2] ?? null), slot(3, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: meals });

    expect(feasibleChoices(session, plan, new Map([[3, [{ ...meals[3]!, prep_ahead: false }]]])).status).toBe('infeasible');
  });

  it('returns unknown with no usable choices when the search budget is exhausted', () => {
    const a = createMeal({ id: 'a' });
    const b = createMeal({ id: 'b' });
    const plan = [slot(0, null)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a, b] });

    expect(feasibleChoices(session, plan, new Map([[0, [a, b]]]), { nodeBudget: 0 })).toEqual({ status: 'unknown', choices: new Map([[0, []]]) });
    expect(feasibleChoices(session, plan, new Map([[0, [a, b]]]), { nodeBudget: 2 })).toEqual({ status: 'unknown', choices: new Map([[0, []]]) });
  });

  it('validates a plan with no remaining choices and rejects invalid slot shapes', () => {
    const a = createMeal({ id: 'a' });
    const plan = [slot(0, a)];
    const session = createMealPlanSession({ plan, meals_snapshot: [a] });

    expect(feasibleChoices(session, plan, new Map())).toEqual({ status: 'feasible', choices: new Map() });
    expect(feasibleChoices(session, [], new Map()).status).toBe('infeasible');
    expect(feasibleChoices(session, [slot(1, a)], new Map()).status).toBe('infeasible');
    expect(feasibleChoices(session, plan, new Map([[8, [a]]])).status).toBe('infeasible');
    expect(feasibleChoices(session, empty(plan), new Map([[0, []]])).status).toBe('infeasible');
  });
});
