import type { Meal, MealType, MealPlanEntry } from '../shared.js';

/** Effort range per dinner day (day_index 0=Monday through 6=Sunday) */
interface EffortRange {
  min: number;
  max: number;
}

const DINNER_EFFORT_BY_DAY: Record<number, EffortRange | null> = {
  0: { min: 3, max: 5 },   // Monday
  1: { min: 3, max: 6 },   // Tuesday
  2: { min: 3, max: 6 },   // Wednesday
  3: { min: 3, max: 6 },   // Thursday
  4: null,                  // Friday (eating out)
  5: { min: 4, max: 8 },   // Saturday
  6: { min: 4, max: 10 },  // Sunday
};

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const RECENCY_EXCLUSION_WEEKS = 3;
const MAX_RED_MEAT_DINNERS = 2;
const MAX_BREAKFAST_LUNCH_EFFORT = 2;

export class InsufficientMealsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientMealsError';
  }
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm.
 * Returns the array for chaining.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    const swapVal = array[j];
    if (temp !== undefined && swapVal !== undefined) {
      array[i] = swapVal;
      array[j] = temp;
    }
  }
  return array;
}

/**
 * Filters out meals planned within the recency window.
 */
function filterByRecency(meals: Meal[], now: Date): Meal[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECENCY_EXCLUSION_WEEKS * 7);
  const cutoffTimestamp = cutoff.getTime();

  return meals.filter((meal) => {
    if (meal.last_planned === null) {
      return true;
    }
    const lastPlannedTime = new Date(meal.last_planned).getTime();
    return lastPlannedTime <= cutoffTimestamp;
  });
}

/**
 * Generates a complete 7-day meal plan following all constraints.
 *
 * Constraints:
 * 1. 7 days (Mon=0 .. Sun=6) x 3 meal types = 21 slots
 * 2. Breakfast/lunch: effort <= 2
 * 3. Dinner effort varies by day (see DINNER_EFFORT_BY_DAY)
 * 4. Friday dinner is always "Eating out" (null meal)
 * 5. Exclude meals planned within 3 weeks
 * 6. Red meat: non-consecutive dinner days AND max 2 per week
 * 7. No meal repeated (no meal ID appears twice in entire plan)
 */
export function generateMealPlan(meals: Meal[], now?: Date): MealPlanEntry[] {
  const currentDate = now ?? new Date();
  const eligibleMeals = filterByRecency(meals, currentDate);
  const plan: MealPlanEntry[] = [];
  const usedMealIds = new Set<string>();

  // Track which dinner day indices have red meat (for consecutive check)
  const redMeatDinnerDays: number[] = [];

  // Step 1: Assign breakfast and lunch for all 7 days
  for (const mealType of ['breakfast', 'lunch'] as MealType[]) {
    const candidates = eligibleMeals.filter(
      (m) => m.meal_type === mealType && m.effort <= MAX_BREAKFAST_LUNCH_EFFORT
    );

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const available = shuffle(
        candidates.filter((m) => !usedMealIds.has(m.id))
      );

      if (available.length === 0) {
        throw new InsufficientMealsError(
          `Not enough ${mealType} meals with effort <= ${MAX_BREAKFAST_LUNCH_EFFORT} for day ${dayIndex}. Need more unique meals.`
        );
      }

      const selected = available[0];
      if (selected === undefined) {
        throw new InsufficientMealsError(
          `Not enough ${mealType} meals with effort <= ${MAX_BREAKFAST_LUNCH_EFFORT} for day ${dayIndex}. Need more unique meals.`
        );
      }
      usedMealIds.add(selected.id);
      plan.push({
        day_index: dayIndex,
        meal_type: mealType,
        meal_id: selected.id,
        meal_name: selected.name,
      });
    }
  }

  // Step 2: Assign dinners for each day
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // Friday = eating out
    if (dayIndex === 4) {
      plan.push({
        day_index: dayIndex,
        meal_type: 'dinner',
        meal_id: null,
        meal_name: 'Eating out',
      });
      continue;
    }

    const effortRange = DINNER_EFFORT_BY_DAY[dayIndex];
    if (effortRange === null || effortRange === undefined) {
      continue;
    }

    const candidates = eligibleMeals.filter(
      (m) =>
        m.meal_type === 'dinner' &&
        m.effort >= effortRange.min &&
        m.effort <= effortRange.max &&
        !usedMealIds.has(m.id)
    );

    // Filter by red meat constraints
    const validCandidates = shuffle(
      candidates.filter((m) => {
        if (!m.has_red_meat) {
          return true;
        }

        // Check max 2 red meat dinners per week
        if (redMeatDinnerDays.length >= MAX_RED_MEAT_DINNERS) {
          return false;
        }

        // Check non-consecutive: no red meat on adjacent day
        for (const rmDay of redMeatDinnerDays) {
          if (Math.abs(rmDay - dayIndex) === 1) {
            return false;
          }
        }

        return true;
      })
    );

    if (validCandidates.length === 0) {
      throw new InsufficientMealsError(
        `Not enough dinner meals for day ${dayIndex} (effort ${effortRange.min}-${effortRange.max}) after applying red meat and uniqueness constraints.`
      );
    }

    const selected = validCandidates[0];
    if (selected === undefined) {
      throw new InsufficientMealsError(
        `Not enough dinner meals for day ${dayIndex} after applying constraints.`
      );
    }
    usedMealIds.add(selected.id);

    if (selected.has_red_meat) {
      redMeatDinnerDays.push(dayIndex);
    }

    plan.push({
      day_index: dayIndex,
      meal_type: 'dinner',
      meal_id: selected.id,
      meal_name: selected.name,
    });
  }

  // Sort plan by day_index, then by meal_type order (breakfast, lunch, dinner)
  const mealTypeOrder: Record<string, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
  };

  plan.sort((a, b) => {
    if (a.day_index !== b.day_index) {
      return a.day_index - b.day_index;
    }
    return (mealTypeOrder[a.meal_type] ?? 0) - (mealTypeOrder[b.meal_type] ?? 0);
  });

  return plan;
}

/**
 * Validates that a generated plan satisfies all constraints.
 * Used for testing and verification.
 */
export function validatePlan(plan: MealPlanEntry[], meals: Meal[]): string[] {
  const errors: string[] = [];
  const mealMap = new Map<string, Meal>();
  for (const meal of meals) {
    mealMap.set(meal.id, meal);
  }

  // Check 21 slots
  if (plan.length !== 21) {
    errors.push(`Expected 21 slots, got ${plan.length}`);
  }

  // Check each day has 3 meal types
  for (let day = 0; day < 7; day++) {
    for (const mt of MEAL_TYPES) {
      const entry = plan.find((e) => e.day_index === day && e.meal_type === mt);
      if (!entry) {
        errors.push(`Missing ${mt} for day ${day}`);
      }
    }
  }

  // Check no duplicate meal IDs
  const usedIds = new Set<string>();
  for (const entry of plan) {
    if (entry.meal_id !== null) {
      if (usedIds.has(entry.meal_id)) {
        errors.push(`Duplicate meal ID: ${entry.meal_id}`);
      }
      usedIds.add(entry.meal_id);
    }
  }

  // Check breakfast/lunch effort
  for (const entry of plan) {
    if (entry.meal_type === 'breakfast' || entry.meal_type === 'lunch') {
      if (entry.meal_id !== null) {
        const meal = mealMap.get(entry.meal_id);
        if (meal && meal.effort > MAX_BREAKFAST_LUNCH_EFFORT) {
          errors.push(`${entry.meal_type} on day ${entry.day_index} has effort ${meal.effort} (max ${MAX_BREAKFAST_LUNCH_EFFORT})`);
        }
      }
    }
  }

  // Check dinner effort ranges
  for (const entry of plan) {
    if (entry.meal_type === 'dinner' && entry.meal_id !== null) {
      const range = DINNER_EFFORT_BY_DAY[entry.day_index];
      if (range !== null && range !== undefined) {
        const meal = mealMap.get(entry.meal_id);
        if (meal && (meal.effort < range.min || meal.effort > range.max)) {
          errors.push(`Dinner on day ${entry.day_index} has effort ${meal.effort} (expected ${range.min}-${range.max})`);
        }
      }
    }
  }

  // Check Friday dinner
  const fridayDinner = plan.find((e) => e.day_index === 4 && e.meal_type === 'dinner');
  if (fridayDinner) {
    if (fridayDinner.meal_id !== null) {
      errors.push('Friday dinner should have null meal_id');
    }
    if (fridayDinner.meal_name !== 'Eating out') {
      errors.push(`Friday dinner meal_name should be "Eating out", got "${fridayDinner.meal_name ?? 'null'}"`);
    }
  }

  // Check red meat constraints
  const redMeatDinnerDays: number[] = [];
  for (const entry of plan) {
    if (entry.meal_type === 'dinner' && entry.meal_id !== null) {
      const meal = mealMap.get(entry.meal_id);
      if (meal !== undefined && meal.has_red_meat === true) {
        redMeatDinnerDays.push(entry.day_index);
      }
    }
  }

  if (redMeatDinnerDays.length > MAX_RED_MEAT_DINNERS) {
    errors.push(`Too many red meat dinners: ${redMeatDinnerDays.length} (max ${MAX_RED_MEAT_DINNERS})`);
  }

  // Check non-consecutive red meat
  const sortedRMDays = [...redMeatDinnerDays].sort((a, b) => a - b);
  for (let i = 1; i < sortedRMDays.length; i++) {
    const prev = sortedRMDays[i - 1];
    const curr = sortedRMDays[i];
    if (prev !== undefined && curr !== undefined && curr - prev === 1) {
      errors.push(`Consecutive red meat dinners on days ${prev} and ${curr}`);
    }
  }

  return errors;
}
