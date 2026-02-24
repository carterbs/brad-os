import type { MealPlanEntry, CritiqueOperation, ApplyOperationsResult } from '../shared.js';
import type { Meal, MealType } from '../shared.js';

const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MAX_PREP_AHEAD_MEALS = 3;

/**
 * Applies a list of CritiqueOperations to a meal plan.
 * Invalid operations are skipped with error messages collected.
 */
export function applyOperations(
  plan: MealPlanEntry[],
  operations: CritiqueOperation[],
  mealsSnapshot: Meal[]
): ApplyOperationsResult {
  const updatedPlan = plan.map((entry) => ({ ...entry }));
  const errors: string[] = [];
  const mealMap = new Map<string, Meal>();
  for (const meal of mealsSnapshot) {
    mealMap.set(meal.id, meal);
  }

  for (const op of operations) {
    // Validate dayIndex
    if (op.day_index < 0 || op.day_index > 6) {
      errors.push(`Invalid day_index ${op.day_index}: must be 0-6`);
      continue;
    }

    // Validate mealType
    if (!VALID_MEAL_TYPES.includes(op.meal_type)) {
      errors.push(`Invalid meal_type "${op.meal_type}": must be breakfast, lunch, or dinner`);
      continue;
    }

    // Validate newMealId exists in snapshot (if not null)
    if (op.new_meal_id !== null && !mealMap.has(op.new_meal_id)) {
      errors.push(`Meal ID "${op.new_meal_id}" not found in meals snapshot`);
      continue;
    }

    // Check for duplicates if adding a meal
    if (op.new_meal_id !== null) {
      const alreadyUsed = updatedPlan.some(
        (entry) =>
          entry.meal_id === op.new_meal_id &&
          !(entry.day_index === op.day_index && entry.meal_type === op.meal_type)
      );
      if (alreadyUsed) {
        errors.push(`Meal ID "${op.new_meal_id}" already exists elsewhere in the plan`);
        continue;
      }
    }

    // Find the plan entry matching dayIndex + mealType
    const entryIndex = updatedPlan.findIndex(
      (entry) => entry.day_index === op.day_index && entry.meal_type === op.meal_type
    );

    if (entryIndex === -1) {
      errors.push(`No plan entry found for day_index ${op.day_index}, meal_type "${op.meal_type}"`);
      continue;
    }

    const entry = updatedPlan[entryIndex];
    if (entry === undefined) {
      continue;
    }

    // Check prep-ahead constraint before applying swap
    if (op.new_meal_id !== null) {
      const newMeal = mealMap.get(op.new_meal_id);
      if (newMeal?.prep_ahead === true) {
        // Count current prep-ahead meals, excluding the slot being replaced
        const currentPrepAhead = updatedPlan.filter((e) => {
          if (e.meal_id === null) return false;
          if (e.day_index === op.day_index && e.meal_type === op.meal_type) return false;
          const m = mealMap.get(e.meal_id);
          return m?.prep_ahead === true;
        }).length;

        if (currentPrepAhead >= MAX_PREP_AHEAD_MEALS) {
          errors.push(`Swapping to "${newMeal.name}" would exceed max ${MAX_PREP_AHEAD_MEALS} prep-ahead meals`);
          continue;
        }
      }
    }

    // Apply the operation
    if (op.new_meal_id === null) {
      entry.meal_id = null;
      entry.meal_name = null;
    } else {
      const meal = mealMap.get(op.new_meal_id);
      if (meal === undefined) {
        errors.push(`Meal ID "${op.new_meal_id}" not found in meals snapshot`);
        continue;
      }
      entry.meal_id = meal.id;
      entry.meal_name = meal.name;
    }
  }

  return { updatedPlan, errors };
}
