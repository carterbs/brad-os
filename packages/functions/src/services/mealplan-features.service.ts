import type { Meal, MealPlanEntry, MealPlanSession, CritiqueOperation } from '../shared.js';

/** Runtime deployment flag; absence keeps externally prepared adult breakfasts out of planning. */
export function adultBreakfastEnabled(): boolean {
  return process.env['ADULT_BREAKFAST_ENABLED'] === 'true';
}

export function mealPlanFeatureFlags(): { adult_breakfast_enabled: boolean } {
  return { adult_breakfast_enabled: adultBreakfastEnabled() };
}

export function mealPlanSlotEnabled(entry: MealPlanEntry | CritiqueOperation): boolean {
  return adultBreakfastEnabled() || entry.meal_track !== 'adult' || entry.meal_type !== 'breakfast';
}

export function activeMealPlan(plan: ReadonlyArray<MealPlanEntry>): MealPlanEntry[] {
  return plan.filter(mealPlanSlotEnabled);
}

export function activePlanningMeals(meals: ReadonlyArray<Meal>): Meal[] {
  return meals.filter((meal) => adultBreakfastEnabled() || meal.audience !== 'adult' || meal.meal_type !== 'breakfast');
}

/** An API/AI view only. Persist the original session for optimistic concurrency and reversibility. */
export function activeMealPlanSession(session: MealPlanSession): MealPlanSession {
  return {
    ...session,
    plan: activeMealPlan(session.plan),
    meals_snapshot: activePlanningMeals(session.meals_snapshot),
    history: session.history.map((message) => ({
      ...message,
      ...(message.operations === undefined ? {} : { operations: message.operations.filter(mealPlanSlotEnabled) }),
      ...(message.previous_assignments === undefined ? {} : { previous_assignments: activeMealPlan(message.previous_assignments) }),
    })),
  };
}

/** Merge active edits into the original ordering without deleting disabled saved assignments. */
export function preserveDisabledEntries(original: MealPlanEntry[], active: MealPlanEntry[]): MealPlanEntry[] {
  const key = (entry: MealPlanEntry): string => `${entry.day_index}:${entry.meal_track ?? 'family'}:${entry.meal_type}`;
  const changes = new Map(active.map((entry) => [key(entry), entry]));
  return original.map((entry) => mealPlanSlotEnabled(entry) ? changes.get(key(entry)) ?? entry : entry);
}
