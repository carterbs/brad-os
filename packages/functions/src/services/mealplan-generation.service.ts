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
const MAX_PREP_AHEAD_MEALS = 3;
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
 * Selects a meal from progressively relaxed candidate pools.
 * Returns the first match, or undefined if nothing works.
 */
function selectFromPools(pools: Meal[][], usedMealIds: Set<string>): Meal | undefined {
  for (const pool of pools) {
    // Prefer unused meals
    const unused = shuffle(pool.filter((m) => !usedMealIds.has(m.id)));
    if (unused.length > 0 && unused[0] !== undefined) {
      return unused[0];
    }
  }
  // Last resort: allow reuse from the last (most relaxed) pool
  const lastPool = pools[pools.length - 1];
  if (lastPool !== undefined && lastPool.length > 0) {
    const shuffled = shuffle([...lastPool]);
    return shuffled[0];
  }
  return undefined;
}

/**
 * Generates a complete 7-day meal plan using best-effort constraint satisfaction.
 *
 * Constraints (applied in priority order, relaxed as needed):
 * 1. 7 days (Mon=0 .. Sun=6) x 3 meal types = 21 slots
 * 2. Breakfast/lunch: prefer effort <= 2, fall back to any effort
 * 3. Dinner effort varies by day (see DINNER_EFFORT_BY_DAY), relaxed if needed
 * 4. Friday dinner is always "Eating out" (null meal)
 * 5. Prefer meals not planned within 3 weeks, fall back to recent meals
 * 6. Red meat: prefer non-consecutive AND max 2/week, relaxed if needed
 * 7. Prep-ahead: max 3/week across all meal types, prefer repeats over overflow
 * 8. Prefer no repeated meals, allow reuse as last resort
 */
export function generateMealPlan(meals: Meal[], now?: Date): MealPlanEntry[] {
  const currentDate = now ?? new Date();
  const eligibleMeals = filterByRecency(meals, currentDate);
  const plan: MealPlanEntry[] = [];
  const usedMealIds = new Set<string>();

  const redMeatDinnerDays: number[] = [];
  let prepAheadCount = 0;

  // Helper to filter by prep-ahead constraint
  const applyPrepAheadFilter = (m: Meal): boolean => {
    if (!m.prep_ahead) return true;
    return prepAheadCount < MAX_PREP_AHEAD_MEALS;
  };

  // Step 1: Assign breakfast and lunch for all 7 days
  for (const mealType of ['breakfast', 'lunch'] as MealType[]) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      // Build progressively relaxed candidate pools.
      // Key invariant: the LAST pool must be non-prep, because selectFromPools
      // reuses meals from the last pool when all options are exhausted.
      // This ensures we repeat a non-prep meal rather than exceed the prep-ahead limit.
      const typeMatch = (m: Meal): boolean => m.meal_type === mealType;
      const lowEffort = (m: Meal): boolean => m.effort <= MAX_BREAKFAST_LUNCH_EFFORT;
      const prepOk = (m: Meal): boolean => applyPrepAheadFilter(m);
      const notPrep = (m: Meal): boolean => !m.prep_ahead;

      const pools: Meal[][] = [
        // Pool 1: eligible (not recent) + low effort + prep-ahead limit
        eligibleMeals.filter((m) => typeMatch(m) && lowEffort(m) && prepOk(m)),
        // Pool 2: all meals + low effort + prep-ahead limit (relax recency)
        meals.filter((m) => typeMatch(m) && lowEffort(m) && prepOk(m)),
        // Pool 3: all meals + any effort + prep-ahead limit (relax effort)
        meals.filter((m) => typeMatch(m) && prepOk(m)),
        // Pool 4: all meals + low effort + non-prep only (hard exclude prep-ahead)
        meals.filter((m) => typeMatch(m) && lowEffort(m) && notPrep(m)),
        // Pool 5 (last): all meals + any effort + non-prep only
        // Being last means reuse will pick from here — repeating a non-prep meal
        // rather than overflowing prep-ahead
        meals.filter((m) => typeMatch(m) && notPrep(m)),
      ];

      const selected = selectFromPools(pools, usedMealIds);
      if (selected !== undefined) {
        usedMealIds.add(selected.id);
        if (selected.prep_ahead) {
          prepAheadCount++;
        }
        plan.push({
          day_index: dayIndex,
          meal_type: mealType,
          meal_id: selected.id,
          meal_name: selected.name,
        });
      }
    }
  }

  // Step 2: Assign dinners for each day
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
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

    // Helper to filter by red meat constraints
    const applyRedMeatFilter = (m: Meal): boolean => {
      if (!m.has_red_meat) return true;
      if (redMeatDinnerDays.length >= MAX_RED_MEAT_DINNERS) return false;
      for (const rmDay of redMeatDinnerDays) {
        if (Math.abs(rmDay - dayIndex) === 1) return false;
      }
      return true;
    };

    // Build progressively relaxed candidate pools.
    // Key invariant: the LAST pool must be non-prep for safe reuse.
    const isDinner = (m: Meal): boolean => m.meal_type === 'dinner';
    const inRange = (m: Meal): boolean => m.effort >= effortRange.min && m.effort <= effortRange.max;
    const rmOk = (m: Meal): boolean => applyRedMeatFilter(m);
    const prepOk = (m: Meal): boolean => applyPrepAheadFilter(m);
    const notPrep = (m: Meal): boolean => !m.prep_ahead;

    const pools: Meal[][] = [
      // Pool 1: eligible + effort range + red meat ok + prep-ahead ok
      eligibleMeals.filter((m) => isDinner(m) && inRange(m) && rmOk(m) && prepOk(m)),
      // Pool 2: all meals + effort range + red meat ok + prep-ahead ok (relax recency)
      meals.filter((m) => isDinner(m) && inRange(m) && rmOk(m) && prepOk(m)),
      // Pool 3: all meals + effort range + prep-ahead ok (relax red meat)
      meals.filter((m) => isDinner(m) && inRange(m) && prepOk(m)),
      // Pool 4: all meals + effort range + non-prep only (hard exclude prep-ahead)
      meals.filter((m) => isDinner(m) && inRange(m) && notPrep(m)),
      // Pool 5 (last): all meals + any effort + non-prep only
      // Being last means reuse will pick from here — repeating a non-prep dinner
      // rather than overflowing prep-ahead
      meals.filter((m) => isDinner(m) && notPrep(m)),
    ];

    const selected = selectFromPools(pools, usedMealIds);
    if (selected !== undefined) {
      usedMealIds.add(selected.id);
      if (selected.has_red_meat) {
        redMeatDinnerDays.push(dayIndex);
      }
      if (selected.prep_ahead) {
        prepAheadCount++;
      }
      plan.push({
        day_index: dayIndex,
        meal_type: 'dinner',
        meal_id: selected.id,
        meal_name: selected.name,
      });
    }
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

  // Check prep-ahead constraint (max 3 across all meal types)
  let prepAheadCount = 0;
  for (const entry of plan) {
    if (entry.meal_id !== null) {
      const meal = mealMap.get(entry.meal_id);
      if (meal !== undefined && meal.prep_ahead === true) {
        prepAheadCount++;
      }
    }
  }
  if (prepAheadCount > MAX_PREP_AHEAD_MEALS) {
    errors.push(`Too many prep-ahead meals: ${prepAheadCount} (max ${MAX_PREP_AHEAD_MEALS})`);
  }

  return errors;
}
