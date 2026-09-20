import type { Meal, MealPlanEntry, MealTrack } from '../shared.js';

export const MAX_PREP_AHEAD_MEALS_PER_TRACK = 3;
export const PREP_AHEAD_POLICY = `At most ${MAX_PREP_AHEAD_MEALS_PER_TRACK} prep-ahead occupied slots per audience track independently (family and adult). If a track already exceeds that limit, do not increase its count; an overage or reduction in one track never changes the other track's allowance.`;

/** Count occupied slots, including repeated meals, against their own audience. */
export function countPrepAheadByTrack(
  plan: ReadonlyArray<MealPlanEntry>,
  catalog: ReadonlyMap<string, Meal>
): Record<MealTrack, number> {
  const counts: Record<MealTrack, number> = { family: 0, adult: 0 };
  for (const entry of plan) {
    if (entry.meal_id !== null && catalog.get(entry.meal_id)?.prep_ahead === true) {
      counts[entry.meal_track ?? 'family']++;
    }
  }
  return counts;
}

export function prepAheadLimit(originalCount = 0): number {
  return Math.max(MAX_PREP_AHEAD_MEALS_PER_TRACK, originalCount);
}

function prepCountErrors(
  original: Record<MealTrack, number>,
  candidate: Record<MealTrack, number>,
  minimum: boolean
): string[] {
  return (['family', 'adult'] as const).flatMap((track) => {
    const limit = prepAheadLimit(original[track]);
    return candidate[track] <= limit ? [] : [
      `The ${track} track ${minimum ? 'requires at least' : 'would have'} ${candidate[track]} prep-ahead meals (limit ${limit}; currently ${original[track]}). Choose a non-prep replacement or explicitly request changing another ${track} prep-ahead slot to a non-prep meal. The other audience's allowance is independent.`,
    ];
  });
}

export function findPrepAheadErrors(
  originalPlan: ReadonlyArray<MealPlanEntry>,
  candidatePlan: ReadonlyArray<MealPlanEntry>,
  catalog: ReadonlyMap<string, Meal>
): string[] {
  return prepCountErrors(countPrepAheadByTrack(originalPlan, catalog), countPrepAheadByTrack(candidatePlan, catalog), false);
}

/** A lower-bound proof: count only pending slots whose every candidate needs prep. */
export function findMinimumPrepAheadErrors(
  originalPlan: ReadonlyArray<MealPlanEntry>,
  basePlan: ReadonlyArray<MealPlanEntry>,
  remaining: ReadonlyMap<number, ReadonlyArray<Meal>>,
  catalog: ReadonlyMap<string, Meal>
): string[] {
  const minimum = countPrepAheadByTrack(basePlan, catalog);
  for (const [index, meals] of remaining) {
    const entry = basePlan[index];
    if (entry?.meal_id === null && meals.length > 0 && meals.every((meal) => catalog.get(meal.id)?.prep_ahead === true)) {
      minimum[entry.meal_track ?? 'family']++;
    }
  }
  return prepCountErrors(countPrepAheadByTrack(originalPlan, catalog), minimum, true);
}
