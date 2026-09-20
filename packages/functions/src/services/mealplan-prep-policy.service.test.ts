import { describe, expect, it } from 'vitest';
import type { Meal, MealPlanEntry, MealTrack } from '../shared.js';
import { createMeal, createMealPlanEntry, createMealPlanSession } from '../__tests__/utils/index.js';
import { feasibleChoices } from './mealplan-feasibility.service.js';
import { generateMealPlan, validatePlan } from './mealplan-generation.service.js';
import { applyOperations } from './mealplan-operations.service.js';

function assignment(meal: Meal, day: number): MealPlanEntry {
  return createMealPlanEntry({ day_index: day, meal_track: meal.audience, meal_type: meal.meal_type, meal_id: meal.id, meal_name: meal.name });
}

describe('prep-ahead capacity by audience', () => {
  it('allows a new Wednesday family prep lunch without changing seven unique adult breakfasts, three of them prep', () => {
    const breakfasts = Array.from({ length: 7 }, (_, day) => createMeal({ id: `adult-${day}`, audience: 'adult', meal_type: 'breakfast', prep_ahead: [0, 3, 4].includes(day) }));
    const lunches = Array.from({ length: 7 }, (_, day) => createMeal({ id: `lunch-${day}`, meal_type: 'lunch', prep_ahead: false }));
    const replacement = createMeal({ id: 'new-lunch', meal_type: 'lunch', prep_ahead: true });
    const plan = [...breakfasts.map(assignment), ...lunches.map(assignment)];
    const meals = [...breakfasts, ...lunches, replacement];
    const before = structuredClone(plan);
    const result = applyOperations(plan, [{ day_index: 2, meal_track: 'family', meal_type: 'lunch', new_meal_id: replacement.id }], meals);

    expect(result.errors).toEqual([]);
    expect(result.updatedPlan).toEqual(plan.map((entry) => entry.day_index === 2 && entry.meal_type === 'lunch' ? assignment(replacement, 2) : entry));
    expect(plan).toEqual(before);

    const base = plan.map((entry, index) => index === 9 ? { ...entry, meal_id: null, meal_name: null } : entry);
    const possible = feasibleChoices(createMealPlanSession({ plan, meals_snapshot: meals }), base, new Map([[9, [replacement]]]));
    expect(possible.status).toBe('feasible');
    expect(possible.choices.get(9)).toEqual([replacement]);
  });

  it('generates and validates three prep meals in each track without duplicate fallbacks', () => {
    const meals = [
      ...Array.from({ length: 7 }, (_, day) => createMeal({ id: `family-breakfast-${day}`, meal_type: 'breakfast', effort: 1, prep_ahead: false })),
      ...Array.from({ length: 7 }, (_, day) => createMeal({ id: `adult-breakfast-${day}`, audience: 'adult', meal_type: 'breakfast', effort: 1, prep_ahead: day < 3 })),
      ...Array.from({ length: 7 }, (_, day) => createMeal({ id: `lunch-${day}`, meal_type: 'lunch', effort: 1, prep_ahead: day < 3 })),
      ...Array.from({ length: 6 }, (_, day) => createMeal({ id: `dinner-${day}`, meal_type: 'dinner', effort: 4, prep_ahead: false, has_red_meat: false })),
    ];
    const plan = generateMealPlan(meals, new Date('2026-09-20T12:00:00Z'));
    const prepIds = new Set(meals.filter((meal) => meal.prep_ahead).map((meal) => meal.id));

    for (const track of ['family', 'adult']) {
      expect(plan.filter((entry) => entry.meal_track === track && entry.meal_id !== null && prepIds.has(entry.meal_id))).toHaveLength(3);
    }
    expect(new Set(plan.flatMap((entry) => entry.meal_id === null ? [] : [entry.meal_id])).size).toBe(27);
    expect(validatePlan(plan, meals)).toEqual([]);
  });

  it.each<MealTrack>(['family', 'adult'])('rejects a fourth %s prep slot even when the other track has none', (track) => {
    const prep = Array.from({ length: 4 }, (_, day) => createMeal({ id: `prep-${day}`, audience: track, meal_type: 'breakfast', prep_ahead: true }));
    const normal = createMeal({ id: 'normal', audience: track, meal_type: 'breakfast', prep_ahead: false });
    const plan = [...prep.slice(0, 3).map(assignment), assignment(normal, 3)];
    const result = applyOperations(plan, [{ day_index: 3, meal_track: track, meal_type: 'breakfast', new_meal_id: prep[3]!.id }], [...prep, normal]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(track);
    expect(result.errors[0]).toContain('prep-ahead');
    expect(result.updatedPlan).toEqual(plan);
    const base = plan.map((entry, index) => index === 3 ? { ...entry, meal_id: null, meal_name: null } : entry);
    const possible = feasibleChoices(createMealPlanSession({ plan, meals_snapshot: [...prep, normal] }), base, new Map([[3, [prep[3]!]]]));
    expect(possible).toMatchObject({
      status: 'infeasible',
      explanation: expect.stringContaining(`${track} track requires at least 4 prep-ahead meals (limit 3; currently 3)`),
    });
  });

  it.each<MealTrack>(['family', 'adult'])('does not transfer another track’s legacy prep allowance into %s', (track) => {
    const other: MealTrack = track === 'family' ? 'adult' : 'family';
    const prep = Array.from({ length: 5 }, (_, day) => createMeal({ id: `${track}-${day}`, audience: track, meal_type: 'breakfast', prep_ahead: true }));
    const otherPrep = Array.from({ length: 4 }, (_, day) => createMeal({ id: `${other}-${day}`, audience: other, meal_type: 'breakfast', prep_ahead: true }));
    const normal = createMeal({ id: `${track}-normal`, audience: track, meal_type: 'breakfast', prep_ahead: false });
    const otherNormal = createMeal({ id: `${other}-normal`, audience: other, meal_type: 'breakfast', prep_ahead: false });
    const meals = [...prep, ...otherPrep, normal, otherNormal];
    const plan = [...prep.slice(0, 4).map(assignment), assignment(normal, 4), ...otherPrep.map(assignment)];

    const sameCount = applyOperations(plan, [{ day_index: 0, meal_track: track, meal_type: 'breakfast', new_meal_id: prep[4]!.id }], meals);
    expect(sameCount.errors).toEqual([]);
    const transferred = applyOperations(plan, [
      { day_index: 4, meal_track: track, meal_type: 'breakfast', new_meal_id: prep[4]!.id },
      { day_index: 0, meal_track: other, meal_type: 'breakfast', new_meal_id: otherNormal.id },
    ], meals);
    expect(transferred.errors).toHaveLength(1);
    expect(transferred.errors[0]).toContain(track);
    expect(transferred.updatedPlan).toEqual(plan);
  });

  it('counts occupied prep slots even when a small adult catalog permits repeated IDs', () => {
    const prep = createMeal({ id: 'prep', audience: 'adult', meal_type: 'breakfast', prep_ahead: true });
    const normal = createMeal({ id: 'normal', audience: 'adult', meal_type: 'breakfast', prep_ahead: false });
    const plan = [assignment(prep, 0), assignment(prep, 1), assignment(prep, 2), assignment(normal, 3)];
    const result = applyOperations(plan, [{ day_index: 3, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: prep.id }], [prep, normal]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('prep-ahead');
    expect(result.updatedPlan).toEqual(plan);
  });

  it('retains a non-prep alternative instead of declaring a mixed candidate pool infeasible', () => {
    const prep = Array.from({ length: 4 }, (_, day) => createMeal({ id: `prep-${day}`, meal_type: 'lunch', prep_ahead: true }));
    const normal = createMeal({ id: 'normal', meal_type: 'lunch', prep_ahead: false });
    const plan = [...prep.slice(0, 3).map(assignment), createMealPlanEntry({ day_index: 3, meal_type: 'lunch', meal_id: null, meal_name: null })];
    const session = createMealPlanSession({ plan, meals_snapshot: [...prep, normal] });
    const possible = feasibleChoices(session, plan, new Map([[3, [prep[3]!, normal]]]));

    expect(possible.status).toBe('feasible');
    expect(possible.choices.get(3)).toEqual([normal]);
    expect(possible.explanation).toBeUndefined();
  });
});
