import type { CritiqueOperation, Meal, MealPlanEntry, MealPlanSession } from '../shared.js';
import { applyOperations } from './mealplan-operations.service.js';

const DEFAULT_NODE_BUDGET = 100_000;

function sameSlot(left: MealPlanEntry, right: MealPlanEntry): boolean {
  return left.day_index === right.day_index &&
    (left.meal_track ?? 'family') === (right.meal_track ?? 'family') &&
    left.meal_type === right.meal_type;
}

function redMeatDays(plan: MealPlanEntry[], catalog: ReadonlyMap<string, Meal>): number[] {
  return plan.flatMap((entry) =>
    entry.meal_type === 'dinner' && entry.meal_id !== null && catalog.get(entry.meal_id)?.has_red_meat
      ? [entry.day_index]
      : []
  );
}

/**
 * Finds which candidate assignments admit a complete structurally valid plan.
 * It neither ranks meals nor chooses the user's final assignments. Each retained
 * candidate has a full-plan witness; unsuccessful bounded searches return unknown.
 *
 * basePlan must have every remaining target cleared. Earlier selected assignments
 * and intentional removals stay fixed. All exceptions are measured against the
 * original session plan, never against this temporarily cleared working plan.
 */
export function feasibleChoices(
  session: MealPlanSession,
  basePlan: MealPlanEntry[],
  remaining: Map<number, Meal[]>,
  options: { nodeBudget?: number } = {}
): { status: 'feasible' | 'infeasible' | 'unknown'; choices: Map<number, Meal[]> } {
  const emptyChoices = (): Map<number, Meal[]> => {
    const result = new Map<number, Meal[]>();
    for (const index of remaining.keys()) result.set(index, []);
    return result;
  };
  const unavailable = (status: 'infeasible' | 'unknown'): ReturnType<typeof feasibleChoices> =>
    ({ status, choices: emptyChoices() });
  if (basePlan.length !== session.plan.length || basePlan.some((entry, index) => {
    const original = session.plan[index];
    return original === undefined || !sameSlot(entry, original);
  })) return unavailable('infeasible');

  const catalog = new Map(session.meals_snapshot.map((meal) => [meal.id, meal]));
  const pools = new Map<number, Meal[]>();
  const witnessed = new Map<number, Set<string>>();
  for (const [index, candidates] of remaining) {
    const entry = basePlan[index];
    if (!Number.isInteger(index) || entry === undefined || entry.meal_id !== null) return unavailable('infeasible');
    const unique = new Map<string, Meal>();
    for (const candidate of candidates) {
      const meal = catalog.get(candidate.id);
      if (meal !== undefined && meal.meal_type === entry.meal_type && meal.audience === (entry.meal_track ?? 'family')) {
        unique.set(meal.id, meal);
      }
    }
    if (unique.size === 0) return unavailable('infeasible');
    pools.set(index, [...unique.values()]);
    witnessed.set(index, new Set());
  }

  const originalRedDays = redMeatDays(session.plan, catalog);
  const redLimit = Math.max(2, originalRedDays.length);
  const plan = basePlan.map((entry) => ({ ...entry }));
  const valid = (): boolean => {
    const operations: CritiqueOperation[] = [];
    for (let index = 0; index < plan.length; index++) {
      const next = plan[index];
      const original = session.plan[index];
      if (next === undefined || original === undefined) return false;
      if (next.meal_id === original.meal_id && (next.meal_id !== null || next.meal_name === original.meal_name)) continue;
      operations.push({
        day_index: next.day_index,
        meal_track: next.meal_track ?? 'family',
        meal_type: next.meal_type,
        new_meal_id: next.meal_id,
      });
    }
    if (applyOperations(session.plan, operations, session.meals_snapshot).errors.length > 0) return false;
    const days = redMeatDays(plan, catalog);
    if (days.length > redLimit) return false;
    return !days.some((day) => days.includes(day + 1) &&
      !(originalRedDays.includes(day) && originalRedDays.includes(day + 1)));
  };

  // With all unassigned slots empty, these constraints are monotonic: filling a
  // later slot cannot repair an already-invalid duplicate, count, or adjacency.
  if (!valid()) return unavailable('infeasible');
  if (remaining.size === 0) return { status: 'feasible', choices: emptyChoices() };

  const requestedBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  if (!Number.isSafeInteger(requestedBudget) || requestedBudget < 0) return unavailable('unknown');
  const budget = Math.min(requestedBudget, DEFAULT_NODE_BUDGET);
  let visited = 0;
  let exhausted = false;
  const order = [...pools.keys()].sort((left, right) =>
    (pools.get(left)?.length ?? 0) - (pools.get(right)?.length ?? 0) || left - right
  );
  const search = (pending: number[]): boolean => {
    if (visited >= budget) { exhausted = true; return false; }
    visited++;
    if (!valid()) return false;
    const index = pending[0];
    if (index === undefined) {
      for (const target of pools.keys()) {
        const mealId = plan[target]?.meal_id;
        if (mealId !== undefined && mealId !== null) witnessed.get(target)?.add(mealId);
      }
      return true;
    }
    const original = plan[index];
    if (original === undefined) return false;
    for (const meal of pools.get(index) ?? []) {
      plan[index] = { ...original, meal_id: meal.id, meal_name: meal.name };
      const found = search(pending.slice(1));
      plan[index] = original;
      if (found) return true;
      if (exhausted) return false;
    }
    return false;
  };

  if (!search(order)) return unavailable(exhausted ? 'unknown' : 'infeasible');

  // A single complete assignment proves one choice per slot. Pin each remaining
  // unproven choice in turn and search for any completion, recording all choices
  // witnessed together. This avoids enumerating interchangeable complete plans.
  for (const [index, candidates] of pools) {
    const original = plan[index];
    if (original === undefined) return unavailable('infeasible');
    for (const meal of candidates) {
      if (witnessed.get(index)?.has(meal.id)) continue;
      plan[index] = { ...original, meal_id: meal.id, meal_name: meal.name };
      search(order.filter((target) => target !== index));
      plan[index] = original;
      if (exhausted) return unavailable('unknown');
    }
  }
  const choices = new Map<number, Meal[]>();
  for (const [index, candidates] of pools) {
    choices.set(index, candidates.filter((meal) => witnessed.get(index)?.has(meal.id)));
  }
  return { status: 'feasible', choices };
}
