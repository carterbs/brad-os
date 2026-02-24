/**
 * Test data fixtures and factory functions.
 *
 * These functions create properly typed test data with sensible defaults
 * that can be overridden for specific test scenarios.
 */

import type {
  Exercise,
  Workout,
  WorkoutSet,
  Plan,
  PlanDay,
  PlanDayExercise,
  Mesocycle,
  StretchSessionRecord,
  MeditationSessionRecord,
  CompletedStretch,
  DayOfWeek,
  WorkoutStatus,
  WorkoutSetStatus,
  MesocycleStatus,
  Meal,
  Recipe,
  Ingredient,
  MealPlanSession,
  MealPlanEntry,
  Barcode,
} from '../../shared.js';
import type {
  ExerciseProgression,
  PreviousWeekPerformance,
  WeekTargets,
} from '../../types/progression.js';

// ============ Counter for unique IDs ============

let idCounter = 0;

function generateId(prefix: string = 'test'): string {
  idCounter++;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

/**
 * Reset the ID counter between test runs.
 * Call this in beforeEach to ensure deterministic IDs.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ============ Timestamp helpers ============

function createTimestamps(): { created_at: string; updated_at: string } {
  const now = new Date().toISOString();
  return { created_at: now, updated_at: now };
}

function todayDateString(): string {
  return new Date().toISOString().split('T')[0] ?? '2024-01-01';
}

// ============ Exercise Fixtures ============

export function createExercise(overrides?: Partial<Exercise>): Exercise {
  return {
    id: generateId('exercise'),
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    ...createTimestamps(),
    ...overrides,
  };
}

// ============ Workout Fixtures ============

export function createWorkout(overrides?: Partial<Workout>): Workout {
  return {
    id: generateId('workout'),
    mesocycle_id: generateId('mesocycle'),
    plan_day_id: generateId('plan-day'),
    week_number: 1,
    scheduled_date: todayDateString(),
    status: 'pending' as WorkoutStatus,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

// ============ Workout Set Fixtures ============

export function createWorkoutSet(overrides?: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: generateId('workout-set'),
    workout_id: generateId('workout'),
    exercise_id: generateId('exercise'),
    set_number: 1,
    target_reps: 10,
    target_weight: 135,
    actual_reps: null,
    actual_weight: null,
    status: 'pending' as WorkoutSetStatus,
    ...overrides,
  };
}

// ============ Plan Fixtures ============

export function createPlan(overrides?: Partial<Plan>): Plan {
  return {
    id: generateId('plan'),
    name: 'Test Plan',
    duration_weeks: 6,
    ...createTimestamps(),
    ...overrides,
  };
}

// ============ Plan Day Fixtures ============

export function createPlanDay(overrides?: Partial<PlanDay>): PlanDay {
  return {
    id: generateId('plan-day'),
    plan_id: generateId('plan'),
    day_of_week: 1 as DayOfWeek,
    name: 'Push Day',
    sort_order: 0,
    ...overrides,
  };
}

// ============ Plan Day Exercise Fixtures ============

export function createPlanDayExercise(
  overrides?: Partial<PlanDayExercise>
): PlanDayExercise {
  return {
    id: generateId('plan-day-exercise'),
    plan_day_id: generateId('plan-day'),
    exercise_id: generateId('exercise'),
    sets: 3,
    reps: 10,
    weight: 135,
    rest_seconds: 90,
    sort_order: 0,
    min_reps: 8,
    max_reps: 12,
    ...overrides,
  };
}

// ============ Mesocycle Fixtures ============

export function createMesocycle(overrides?: Partial<Mesocycle>): Mesocycle {
  return {
    id: generateId('mesocycle'),
    plan_id: generateId('plan'),
    start_date: todayDateString(),
    current_week: 1,
    status: 'active' as MesocycleStatus,
    ...createTimestamps(),
    ...overrides,
  };
}

// ============ Stretch Session Fixtures ============

export function createCompletedStretch(
  overrides?: Partial<CompletedStretch>
): CompletedStretch {
  return {
    region: 'neck',
    stretchId: 'neck-forward-tilt',
    stretchName: 'Neck Forward Tilt',
    durationSeconds: 60,
    skippedSegments: 0,
    ...overrides,
  };
}

export function createStretchSession(
  overrides?: Partial<StretchSessionRecord>
): StretchSessionRecord {
  return {
    id: generateId('stretch-session'),
    completedAt: new Date().toISOString(),
    totalDurationSeconds: 480,
    regionsCompleted: 8,
    regionsSkipped: 0,
    stretches: [
      createCompletedStretch({ region: 'neck' }),
      createCompletedStretch({ region: 'shoulders' }),
      createCompletedStretch({ region: 'back', durationSeconds: 120 }),
      createCompletedStretch({ region: 'hip_flexors' }),
      createCompletedStretch({ region: 'glutes', durationSeconds: 120 }),
      createCompletedStretch({ region: 'hamstrings' }),
      createCompletedStretch({ region: 'quads' }),
      createCompletedStretch({ region: 'calves' }),
    ],
    ...overrides,
  };
}

// ============ Meditation Session Fixtures ============

export function createMeditationSession(
  overrides?: Partial<MeditationSessionRecord>
): MeditationSessionRecord {
  return {
    id: generateId('meditation-session'),
    completedAt: new Date().toISOString(),
    sessionType: 'basic-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 600,
    completedFully: true,
    ...overrides,
  };
}

// ============ Meal Fixtures ============

export function createMeal(overrides?: Partial<Meal>): Meal {
  return {
    id: generateId('meal'),
    name: 'Chicken Stir Fry',
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    prep_ahead: false,
    url: 'https://example.com/recipe',
    last_planned: null,
    ...createTimestamps(),
    ...overrides,
  };
}

export function createRecipe(overrides?: Partial<Recipe>): Recipe {
  return {
    id: generateId('recipe'),
    meal_id: generateId('meal'),
    ingredients: [
      { ingredient_id: 'ing-1', quantity: 200, unit: 'g' },
    ],
    steps: [
      { step_number: 1, instruction: 'Cook the chicken' },
    ],
    ...createTimestamps(),
    ...overrides,
  };
}

export function createIngredient(overrides?: Partial<Ingredient>): Ingredient {
  return {
    id: generateId('ingredient'),
    name: 'Chicken Breast',
    store_section: 'Meat',
    ...createTimestamps(),
    ...overrides,
  };
}

// ============ Barcode Fixtures ============

export function createBarcode(overrides?: Partial<Barcode>): Barcode {
  return {
    id: generateId('barcode'),
    label: 'Costco Membership',
    value: '123456789012',
    barcode_type: 'code128',
    color: '#3B82F6',
    sort_order: 0,
    ...createTimestamps(),
    ...overrides,
  };
}

export function createMealPlanEntry(overrides?: Partial<MealPlanEntry>): MealPlanEntry {
  return {
    day_index: 0,
    meal_type: 'dinner',
    meal_id: generateId('meal'),
    meal_name: 'Chicken Stir Fry',
    ...overrides,
  };
}

export function createMealPlanSession(overrides?: Partial<MealPlanSession>): MealPlanSession {
  return {
    id: generateId('session'),
    plan: [
      createMealPlanEntry({ day_index: 0, meal_type: 'breakfast', meal_name: 'Oatmeal' }),
      createMealPlanEntry({ day_index: 0, meal_type: 'lunch', meal_name: 'Sandwich' }),
      createMealPlanEntry({ day_index: 0, meal_type: 'dinner', meal_name: 'Chicken Stir Fry' }),
    ],
    meals_snapshot: [],
    history: [],
    is_finalized: false,
    ...createTimestamps(),
    ...overrides,
  };
}

// ============ Progression Type Fixtures ============

export function createExerciseProgression(
  overrides?: Partial<ExerciseProgression>
): ExerciseProgression {
  return {
    exerciseId: generateId('exercise'),
    planExerciseId: generateId('plan-exercise'),
    baseWeight: 135,
    baseReps: 10,
    baseSets: 3,
    weightIncrement: 5,
    minReps: 8,
    maxReps: 12,
    ...overrides,
  };
}

export function createPreviousWeekPerformance(
  overrides?: Partial<PreviousWeekPerformance>
): PreviousWeekPerformance {
  return {
    exerciseId: generateId('exercise'),
    weekNumber: 1,
    targetWeight: 135,
    targetReps: 10,
    actualWeight: 135,
    actualReps: 10,
    hitTarget: true,
    consecutiveFailures: 0,
    ...overrides,
  };
}

export function createWeekTargets(overrides?: Partial<WeekTargets>): WeekTargets {
  return {
    exerciseId: generateId('exercise'),
    planExerciseId: generateId('plan-exercise'),
    targetWeight: 135,
    targetReps: 10,
    targetSets: 3,
    weekNumber: 1,
    isDeload: false,
    ...overrides,
  };
}

// ============ Bulk Creation Helpers ============

/**
 * Create multiple workout sets for a single workout/exercise combination.
 */
export function createWorkoutSets(
  count: number,
  workoutId: string,
  exerciseId: string,
  overrides?: Partial<WorkoutSet>
): WorkoutSet[] {
  return Array.from({ length: count }, (_, index) =>
    createWorkoutSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_number: index + 1,
      ...overrides,
    })
  );
}

/**
 * Create a complete workout scenario with exercise, workout, and sets.
 */
export interface WorkoutScenario {
  exercise: Exercise;
  workout: Workout;
  sets: WorkoutSet[];
}

export function createWorkoutScenario(
  setCount: number = 3,
  overrides?: {
    exercise?: Partial<Exercise>;
    workout?: Partial<Workout>;
    set?: Partial<WorkoutSet>;
  }
): WorkoutScenario {
  const exercise = createExercise(overrides?.exercise);
  const workout = createWorkout(overrides?.workout);
  const sets = createWorkoutSets(setCount, workout.id, exercise.id, overrides?.set);

  return { exercise, workout, sets };
}

/**
 * Create a complete plan scenario with plan, days, and exercises.
 */
export interface PlanScenario {
  plan: Plan;
  days: Array<{
    day: PlanDay;
    exercises: PlanDayExercise[];
  }>;
}

export function createPlanScenario(
  dayCount: number = 3,
  exercisesPerDay: number = 4
): PlanScenario {
  const plan = createPlan();
  const days = Array.from({ length: dayCount }, (_, dayIndex) => {
    const day = createPlanDay({
      plan_id: plan.id,
      day_of_week: ((dayIndex + 1) % 7) as DayOfWeek,
      name: `Day ${dayIndex + 1}`,
      sort_order: dayIndex,
    });

    const exercises = Array.from({ length: exercisesPerDay }, (_, exerciseIndex) =>
      createPlanDayExercise({
        plan_day_id: day.id,
        sort_order: exerciseIndex,
      })
    );

    return { day, exercises };
  });

  return { plan, days };
}

/**
 * Create a mesocycle scenario with mesocycle and workouts.
 */
export interface MesocycleScenario {
  mesocycle: Mesocycle;
  plan: Plan;
  workouts: Workout[];
}

export function createMesocycleScenario(
  weekCount: number = 6,
  workoutsPerWeek: number = 3
): MesocycleScenario {
  const plan = createPlan({ duration_weeks: weekCount });
  const mesocycle = createMesocycle({ plan_id: plan.id });

  const workouts: Workout[] = [];
  for (let week = 1; week <= weekCount; week++) {
    for (let day = 0; day < workoutsPerWeek; day++) {
      workouts.push(
        createWorkout({
          mesocycle_id: mesocycle.id,
          week_number: week,
        })
      );
    }
  }

  return { mesocycle, plan, workouts };
}
