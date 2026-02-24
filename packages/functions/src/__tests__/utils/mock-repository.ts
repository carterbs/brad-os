/**
 * Mock repository factories for unit testing.
 *
 * These factories create typed mocks for all repository methods,
 * allowing tests to control repository behavior without hitting the database.
 *
 * Usage:
 * ```typescript
 * const repo = createMockExerciseRepository();
 * repo.findById.mockResolvedValue(createExercise());
 * ```
 */

import { vi } from 'vitest';

// Simple mock function type - compatible with all vitest versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<any, any>>;

// ============ Base Repository Mock Interface ============

export interface MockBaseRepository {
  create: MockFn;
  findById: MockFn;
  findAll: MockFn;
  update: MockFn;
  delete: MockFn;
}

// ============ Exercise Repository Mock ============

export interface MockExerciseRepository extends MockBaseRepository {
  findByName: MockFn;
  findDefaultExercises: MockFn;
  findCustomExercises: MockFn;
  isInUse: MockFn;
}

export function createMockExerciseRepository(): MockExerciseRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByName: vi.fn(),
    findDefaultExercises: vi.fn(),
    findCustomExercises: vi.fn(),
    isInUse: vi.fn(),
  };
}

// ============ Workout Repository Mock ============

export interface MockWorkoutRepository extends MockBaseRepository {
  findByMesocycleId: MockFn;
  findByStatus: MockFn;
  findByDate: MockFn;
  findPreviousWeekWorkout: MockFn;
  findNextPending: MockFn;
  findCompletedInDateRange: MockFn;
}

export function createMockWorkoutRepository(): MockWorkoutRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByMesocycleId: vi.fn(),
    findByStatus: vi.fn(),
    findByDate: vi.fn(),
    findPreviousWeekWorkout: vi.fn(),
    findNextPending: vi.fn(),
    findCompletedInDateRange: vi.fn(),
  };
}

// ============ Workout Set Repository Mock ============

export interface MockWorkoutSetRepository extends MockBaseRepository {
  findByWorkoutId: MockFn;
  findByWorkoutAndExercise: MockFn;
  findByStatus: MockFn;
  findCompletedByExerciseId: MockFn;
}

export function createMockWorkoutSetRepository(): MockWorkoutSetRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByWorkoutId: vi.fn(),
    findByWorkoutAndExercise: vi.fn(),
    findByStatus: vi.fn(),
    findCompletedByExerciseId: vi.fn(),
  };
}

// ============ Mesocycle Repository Mock ============

export interface MockMesocycleRepository extends MockBaseRepository {
  findByPlanId: MockFn;
  findActive: MockFn;
}

export function createMockMesocycleRepository(): MockMesocycleRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByPlanId: vi.fn(),
    findActive: vi.fn(),
  };
}

// ============ Plan Repository Mock ============

export interface MockPlanRepository extends MockBaseRepository {
  isInUse: MockFn;
}

export function createMockPlanRepository(): MockPlanRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    isInUse: vi.fn(),
  };
}

// ============ Plan Day Repository Mock ============

export interface MockPlanDayRepository extends MockBaseRepository {
  findByPlanId: MockFn;
}

export function createMockPlanDayRepository(): MockPlanDayRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByPlanId: vi.fn(),
  };
}

// ============ Plan Day Exercise Repository Mock ============

export interface MockPlanDayExerciseRepository extends MockBaseRepository {
  findByPlanDayId: MockFn;
}

export function createMockPlanDayExerciseRepository(): MockPlanDayExerciseRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByPlanDayId: vi.fn(),
  };
}

// ============ Stretch Session Repository Mock ============

export interface MockStretchSessionRepository {
  create: MockFn;
  findById: MockFn;
  findLatest: MockFn;
  findAll: MockFn;
  delete: MockFn;
  findInDateRange: MockFn;
}

export function createMockStretchSessionRepository(): MockStretchSessionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findLatest: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    findInDateRange: vi.fn(),
  };
}

// ============ Meditation Session Repository Mock ============

export interface MockMeditationSessionRepository {
  create: MockFn;
  findById: MockFn;
  findLatest: MockFn;
  findAll: MockFn;
  findInDateRange: MockFn;
  getStats: MockFn;
  delete: MockFn;
}

export function createMockMeditationSessionRepository(): MockMeditationSessionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findLatest: vi.fn(),
    findAll: vi.fn(),
    findInDateRange: vi.fn(),
    getStats: vi.fn(),
    delete: vi.fn(),
  };
}

// ============ Meal Repository Mock ============

export interface MockMealRepository extends MockBaseRepository {
  findByType: MockFn;
  updateLastPlanned: MockFn;
}

export function createMockMealRepository(): MockMealRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByType: vi.fn(),
    updateLastPlanned: vi.fn(),
  };
}

// ============ Recipe Repository Mock ============

export interface MockRecipeRepository extends MockBaseRepository {
  findByMealIds: MockFn;
}

export function createMockRecipeRepository(): MockRecipeRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByMealIds: vi.fn(),
  };
}

// ============ Ingredient Repository Mock ============

export interface MockIngredientRepository extends MockBaseRepository {}

export function createMockIngredientRepository(): MockIngredientRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

// ============ MealPlan Session Repository Mock ============

export interface MockMealPlanSessionRepository extends MockBaseRepository {
  appendHistory: MockFn;
  updatePlan: MockFn;
  applyCritiqueUpdates: MockFn;
}

export function createMockMealPlanSessionRepository(): MockMealPlanSessionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    appendHistory: vi.fn(),
    updatePlan: vi.fn(),
    applyCritiqueUpdates: vi.fn(),
  };
}

// ============ Guided Meditation Repository Mock ============

export interface MockGuidedMeditationRepository extends MockBaseRepository {
  getCategories: MockFn;
  findAllByCategory: MockFn;
  seed: MockFn;
}

export function createMockGuidedMeditationRepository(): MockGuidedMeditationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getCategories: vi.fn(),
    findAllByCategory: vi.fn(),
    seed: vi.fn(),
  };
}

// ============ All Repositories Mock ============

export interface MockRepositories {
  exerciseRepository: MockExerciseRepository;
  workoutRepository: MockWorkoutRepository;
  workoutSetRepository: MockWorkoutSetRepository;
  mesocycleRepository: MockMesocycleRepository;
  planRepository: MockPlanRepository;
  planDayRepository: MockPlanDayRepository;
  planDayExerciseRepository: MockPlanDayExerciseRepository;
  stretchSessionRepository: MockStretchSessionRepository;
  meditationSessionRepository: MockMeditationSessionRepository;
  mealRepository: MockMealRepository;
  recipeRepository: MockRecipeRepository;
  ingredientRepository: MockIngredientRepository;
  mealPlanSessionRepository: MockMealPlanSessionRepository;
}

export function createMockRepositories(): MockRepositories {
  return {
    exerciseRepository: createMockExerciseRepository(),
    workoutRepository: createMockWorkoutRepository(),
    workoutSetRepository: createMockWorkoutSetRepository(),
    mesocycleRepository: createMockMesocycleRepository(),
    planRepository: createMockPlanRepository(),
    planDayRepository: createMockPlanDayRepository(),
    planDayExerciseRepository: createMockPlanDayExerciseRepository(),
    stretchSessionRepository: createMockStretchSessionRepository(),
    meditationSessionRepository: createMockMeditationSessionRepository(),
    mealRepository: createMockMealRepository(),
    recipeRepository: createMockRecipeRepository(),
    ingredientRepository: createMockIngredientRepository(),
    mealPlanSessionRepository: createMockMealPlanSessionRepository(),
  };
}
