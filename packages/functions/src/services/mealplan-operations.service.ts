import type { MealPlanEntry, CritiqueOperation, ApplyOperationsResult } from '../shared.js';
import type { Meal, MealTrack, MealType } from '../shared.js';

const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const VALID_MEAL_TRACKS: MealTrack[] = ['family', 'adult'];
const MAX_PREP_AHEAD_MEALS = 3;
const REQUIRED_ADULT_BREAKFAST_SLOTS = 7;

interface ValidatedOperation {
  entryIndex: number;
  newMeal: Meal | null;
}

function getMealTrack(entry: MealPlanEntry | CritiqueOperation): MealTrack {
  return entry.meal_track ?? 'family';
}

function getSlotKey(
  dayIndex: number,
  mealTrack: MealTrack,
  mealType: MealType
): string {
  return `${dayIndex}:${mealTrack}:${mealType}`;
}

function findDuplicateMealErrors(
  originalPlan: ReadonlyArray<MealPlanEntry>,
  candidatePlan: ReadonlyArray<MealPlanEntry>,
  mealsSnapshot: ReadonlyArray<Meal>
): string[] {
  const groupEntriesByMealId = (
    plan: ReadonlyArray<MealPlanEntry>
  ): Map<string, MealPlanEntry[]> => {
    const entriesByMealId = new Map<string, MealPlanEntry[]>();
    for (const entry of plan) {
      if (entry.meal_id === null) continue;
      const entries = entriesByMealId.get(entry.meal_id) ?? [];
      entries.push(entry);
      entriesByMealId.set(entry.meal_id, entries);
    }
    return entriesByMealId;
  };

  const originalEntriesByMealId = groupEntriesByMealId(originalPlan);
  const candidateEntriesByMealId = groupEntriesByMealId(candidatePlan);

  const adultBreakfastCount = new Set(
    mealsSnapshot
      .filter(
        (meal) =>
          meal.meal_type === 'breakfast' && meal.audience === 'adult'
      )
      .map((meal) => meal.id)
  ).size;
  const errors: string[] = [];

  for (const [mealId, entries] of candidateEntriesByMealId) {
    if (entries.length <= 1) continue;
    const allowedAdultBreakfastRepeat =
      adultBreakfastCount < REQUIRED_ADULT_BREAKFAST_SLOTS &&
      entries.every(
        (entry) =>
          getMealTrack(entry) === 'adult' && entry.meal_type === 'breakfast'
      );
    if (allowedAdultBreakfastRepeat) continue;

    const originalSlotKeys = new Set(
      (originalEntriesByMealId.get(mealId) ?? []).map((entry) =>
        getSlotKey(entry.day_index, getMealTrack(entry), entry.meal_type)
      )
    );
    const preservesExistingDuplicate = entries.every((entry) =>
      originalSlotKeys.has(
        getSlotKey(entry.day_index, getMealTrack(entry), entry.meal_type)
      )
    );
    if (preservesExistingDuplicate) continue;

    errors.push(`Meal ID "${mealId}" already exists elsewhere in the plan`);
  }

  return errors;
}

function findPrepAheadErrors(
  originalPlan: ReadonlyArray<MealPlanEntry>,
  candidatePlan: ReadonlyArray<MealPlanEntry>,
  mealMap: ReadonlyMap<string, Meal>
): string[] {
  const countPrepAhead = (plan: ReadonlyArray<MealPlanEntry>): number =>
    plan.filter((entry) => {
      if (entry.meal_id === null) return false;
      return mealMap.get(entry.meal_id)?.prep_ahead === true;
    }).length;
  const originalPrepAheadCount = countPrepAhead(originalPlan);
  const candidatePrepAheadCount = countPrepAhead(candidatePlan);

  if (
    candidatePrepAheadCount <= MAX_PREP_AHEAD_MEALS ||
    candidatePrepAheadCount <= originalPrepAheadCount
  ) {
    return [];
  }
  return [
    `Plan would exceed max ${MAX_PREP_AHEAD_MEALS} prep-ahead meals`,
  ];
}

/**
 * Applies a list of CritiqueOperations to a meal plan atomically.
 * The batch is evaluated against its final state so simultaneous swaps work.
 * If any operation or final-state constraint is invalid, an unchanged clone of
 * the original plan is returned with the collected errors.
 */
export function applyOperations(
  plan: MealPlanEntry[],
  operations: CritiqueOperation[],
  mealsSnapshot: Meal[]
): ApplyOperationsResult {
  const originalPlan = plan.map((entry) => ({ ...entry }));
  const candidatePlan = originalPlan.map((entry) => ({ ...entry }));
  const errors: string[] = [];
  const mealMap = new Map<string, Meal>();
  for (const meal of mealsSnapshot) {
    mealMap.set(meal.id, meal);
  }
  const validatedOperations: ValidatedOperation[] = [];
  const targetedSlots = new Set<string>();

  for (const op of operations) {
    const mealTrack = getMealTrack(op);

    // Validate dayIndex
    if (!Number.isInteger(op.day_index) || op.day_index < 0 || op.day_index > 6) {
      errors.push(`Invalid day_index ${op.day_index}: must be 0-6`);
      continue;
    }

    // Validate mealType
    if (!VALID_MEAL_TYPES.includes(op.meal_type)) {
      errors.push(`Invalid meal_type "${op.meal_type}": must be breakfast, lunch, or dinner`);
      continue;
    }

    if (!VALID_MEAL_TRACKS.includes(mealTrack)) {
      errors.push(`Invalid meal_track "${mealTrack}": must be family or adult`);
      continue;
    }

    const slotKey = getSlotKey(op.day_index, mealTrack, op.meal_type);
    if (targetedSlots.has(slotKey)) {
      errors.push(`Multiple operations target slot ${slotKey}`);
      continue;
    }
    targetedSlots.add(slotKey);

    const matchingEntryIndexes = originalPlan.flatMap((entry, index) =>
      entry.day_index === op.day_index &&
      getMealTrack(entry) === mealTrack &&
      entry.meal_type === op.meal_type
        ? [index]
        : []
    );
    if (matchingEntryIndexes.length === 0) {
      errors.push(`No plan entry found for day_index ${op.day_index}, meal_track "${mealTrack}", meal_type "${op.meal_type}"`);
      continue;
    }
    if (matchingEntryIndexes.length > 1) {
      errors.push(`Multiple plan entries found for day_index ${op.day_index}, meal_track "${mealTrack}", meal_type "${op.meal_type}"`);
      continue;
    }

    let replacementMeal: Meal | null = null;
    if (op.new_meal_id !== null) {
      const matchingMeal = mealMap.get(op.new_meal_id);
      if (matchingMeal === undefined) {
        errors.push(`Meal ID "${op.new_meal_id}" not found in meals snapshot`);
        continue;
      }
      replacementMeal = matchingMeal;
    }

    if (replacementMeal !== null) {
      if (replacementMeal.meal_type !== op.meal_type) {
        errors.push(`Meal ID "${op.new_meal_id}" is ${replacementMeal.meal_type}, not ${op.meal_type}`);
        continue;
      }
      if (replacementMeal.audience !== mealTrack) {
        errors.push(`Meal ID "${op.new_meal_id}" is for ${replacementMeal.audience}, not ${mealTrack}`);
        continue;
      }
    }

    const entryIndex = matchingEntryIndexes[0];
    if (entryIndex !== undefined) {
      validatedOperations.push({ entryIndex, newMeal: replacementMeal });
    }
  }

  if (errors.length > 0) {
    return { updatedPlan: originalPlan, errors };
  }

  for (const operation of validatedOperations) {
    const entry = candidatePlan[operation.entryIndex];
    if (entry === undefined) continue;
    entry.meal_id = operation.newMeal?.id ?? null;
    entry.meal_name = operation.newMeal?.name ?? null;
  }

  errors.push(
    ...findDuplicateMealErrors(originalPlan, candidatePlan, mealsSnapshot)
  );
  errors.push(...findPrepAheadErrors(originalPlan, candidatePlan, mealMap));

  if (errors.length > 0) {
    return { updatedPlan: originalPlan, errors };
  }

  return { updatedPlan: candidatePlan, errors };
}
