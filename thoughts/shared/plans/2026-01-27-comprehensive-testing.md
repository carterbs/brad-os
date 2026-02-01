# Comprehensive Testing Implementation Plan

## Overview

Eliminate all testing gaps in `packages/functions` by implementing ~250+ tests across all layers: services, handlers, repositories, and integration tests. Build proper testing infrastructure including mock repositories, test fixtures, and a vitest setup file.

## Current State Analysis

### What Exists
- **3 test files** with 10 total tests
- `shared.test.ts` (4 tests) - Tests utility functions
- `health.integration.test.ts` (1 test) - Health endpoint smoke test
- `exercises.integration.test.ts` (5 tests) - CRUD operations
- Vitest workspace config separating unit/integration tests
- `firebase-functions-test` installed but unused

### What's Missing
- **7 services** with 0 unit tests (progression, dynamic-progression, workout, workout-set, mesocycle, plan-modification, calendar)
- **9 handlers** with 0 unit tests (49 endpoints total)
- **10 repositories** with 0 unit tests
- **7 API domains** without integration tests
- No mock repository implementations
- No test fixtures or factories
- No vitest setup file

### Key Files
- Services: `packages/functions/src/services/*.ts`
- Handlers: `packages/functions/src/handlers/*.ts`
- Repositories: `packages/functions/src/repositories/*.ts`
- Types: `packages/functions/src/types/database.ts`, `packages/functions/src/types/progression.ts`

## Desired End State

- **100% service coverage** - All 7 services have comprehensive unit tests
- **100% handler coverage** - All 49 endpoints have unit tests
- **100% integration coverage** - All 9 API domains have integration tests
- **Repository tests** - All 10 repositories tested against emulator
- **Test infrastructure** - Reusable mocks, fixtures, and utilities
- **~250+ total tests** passing

## What We're NOT Doing

- CI/CD pipeline integration
- E2E tests with iOS app
- Performance/load testing
- Firestore security rules testing

---

## Phase 1: Pure Function Unit Tests

### Overview
Test the progression services which are pure functions with no external dependencies. These require no mocking and establish the testing patterns.

### Changes Required

#### File: `packages/functions/src/services/progression.service.test.ts` (NEW)

```typescript
// Test cases to implement:

describe('ProgressionService', () => {
  describe('calculateTargetsForWeek', () => {
    // Week 0 - Baseline
    it('should return base values for week 0')
    it('should return base values for week 0 regardless of completion status')

    // Odd weeks - Add rep
    it('should add 1 rep on week 1')
    it('should add 1 rep on week 3')
    it('should add 1 rep on week 5')

    // Even weeks - Add weight
    it('should add weight and reset reps on week 2')
    it('should add weight and reset reps on week 4')

    // Incomplete week handling
    it('should hold at previous week targets if previous week incomplete')
    it('should not progress from week 1 to week 2 if week 1 incomplete')

    // Deload week
    it('should calculate deload with 85% weight on week 6')
    it('should calculate deload with 50% volume on week 6')
    it('should round deload weight to nearest 2.5 lbs')
    it('should use week 4 reps if week 5 incomplete for deload')
    it('should ensure at least 1 set during deload')
  })

  describe('calculateProgressionHistory', () => {
    it('should generate 7 weeks of targets')
    it('should handle empty completion history')
    it('should carry forward incomplete weeks')
  })
})
```

**Test count: ~18 tests**

#### File: `packages/functions/src/services/dynamic-progression.service.test.ts` (NEW)

```typescript
// Test cases to implement:

describe('DynamicProgressionService', () => {
  describe('calculateNextWeekTargets', () => {
    // First week (no previous data)
    it('should return base values when no previous performance')
    it('should set reason to first_week when no previous performance')

    // Deload week
    it('should apply 85% weight on deload week')
    it('should apply 50% volume on deload week')
    it('should round deload weight to 2.5 lbs')
    it('should use minReps on deload week')
    it('should set reason to deload')

    // Hit max reps - progression
    it('should add weight when actualReps >= maxReps')
    it('should reset to minReps when adding weight')
    it('should set reason to hit_max_reps')

    // Hit target - increment reps
    it('should increment reps when hitting target')
    it('should cap reps at maxReps')
    it('should keep same weight when incrementing reps')
    it('should set reason to hit_target')

    // Hold - met minimum but not target
    it('should hold weight and target when between min and target reps')
    it('should set reason to hold')

    // Regression
    it('should regress after 2 consecutive failures')
    it('should not regress below baseWeight')
    it('should reset to minReps on regression')
    it('should set reason to regress')
    it('should not regress after only 1 failure')
  })

  describe('calculateConsecutiveFailures', () => {
    it('should return 0 for empty history')
    it('should count consecutive failures at same weight')
    it('should stop counting when weight changes')
    it('should stop counting at first success')
    it('should handle mixed success/failure history')
  })

  describe('buildPreviousWeekPerformance', () => {
    it('should return null for empty sets array')
    it('should select best set by weight first')
    it('should select best set by reps for same weight')
    it('should calculate hitTarget correctly')
    it('should calculate consecutive failures')
  })
})
```

**Test count: ~25 tests**

### Success Criteria
- [ ] All 43 progression tests pass
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Tests cover all progression pathways documented in research

### Confirmation Gate
Run `npm test` and verify all progression service tests pass before proceeding.

---

## Phase 2: Test Infrastructure

### Overview
Build the foundation for mocking: vitest setup, mock repository factory, test fixtures, and utilities.

### Changes Required

#### File: `packages/functions/vitest.setup.ts` (NEW)

```typescript
// Global test setup
import { beforeEach, vi } from 'vitest';

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Global test utilities available in all tests
```

#### File: `packages/functions/vitest.config.ts` (NEW)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
```

#### File: `packages/functions/src/__tests__/utils/mock-repository.ts` (NEW)

```typescript
// Generic mock repository factory
// Creates typed mocks for any repository with standard CRUD methods

export function createMockRepository<T, CreateDTO, UpdateDTO>() {
  return {
    create: vi.fn<[CreateDTO], Promise<T>>(),
    findById: vi.fn<[string], Promise<T | null>>(),
    findAll: vi.fn<[], Promise<T[]>>(),
    update: vi.fn<[string, UpdateDTO], Promise<T | null>>(),
    delete: vi.fn<[string], Promise<boolean>>(),
  };
}

// Specific repository mock factories
export function createMockExerciseRepository() { ... }
export function createMockWorkoutRepository() { ... }
export function createMockWorkoutSetRepository() { ... }
export function createMockMesocycleRepository() { ... }
export function createMockPlanRepository() { ... }
export function createMockPlanDayRepository() { ... }
export function createMockPlanDayExerciseRepository() { ... }
```

#### File: `packages/functions/src/__tests__/utils/fixtures.ts` (NEW)

```typescript
// Test data factories for all entity types

export function createExercise(overrides?: Partial<Exercise>): Exercise {
  return {
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2026-01-27T12:00:00Z',
    updated_at: '2026-01-27T12:00:00Z',
    ...overrides,
  };
}

export function createWorkout(overrides?: Partial<Workout>): Workout { ... }
export function createWorkoutSet(overrides?: Partial<WorkoutSet>): WorkoutSet { ... }
export function createPlan(overrides?: Partial<Plan>): Plan { ... }
export function createPlanDay(overrides?: Partial<PlanDay>): PlanDay { ... }
export function createPlanDayExercise(overrides?: Partial<PlanDayExercise>): PlanDayExercise { ... }
export function createMesocycle(overrides?: Partial<Mesocycle>): Mesocycle { ... }

// Progression-specific fixtures
export function createExerciseProgression(overrides?: Partial<ExerciseProgression>): ExerciseProgression { ... }
export function createPreviousWeekPerformance(overrides?: Partial<PreviousWeekPerformance>): PreviousWeekPerformance { ... }
export function createWeekTargets(overrides?: Partial<WeekTargets>): WeekTargets { ... }
```

#### File: `packages/functions/src/__tests__/utils/mock-firestore.ts` (NEW)

```typescript
// Mock Firestore for testing batch operations in MesocycleService

export function createMockFirestore() {
  const mockBatch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: vi.fn().mockReturnValue({
      id: 'generated-id',
    }),
  };

  return {
    batch: vi.fn().mockReturnValue(mockBatch),
    collection: vi.fn().mockReturnValue(mockCollection),
    _mockBatch: mockBatch,
    _mockCollection: mockCollection,
  };
}
```

#### File: `packages/functions/src/__tests__/utils/index.ts` (NEW)

```typescript
// Re-export all test utilities
export * from './mock-repository.js';
export * from './fixtures.js';
export * from './mock-firestore.js';
```

### Success Criteria
- [ ] `vitest.setup.ts` and `vitest.config.ts` created
- [ ] Mock repository factory works for all repository types
- [ ] All entity fixtures created and typed correctly
- [ ] Mock Firestore supports batch operations
- [ ] `npm run typecheck` passes

### Confirmation Gate
Create a simple test using the infrastructure to verify it works before proceeding.

---

## Phase 3: Service Unit Tests

### Overview
Test all service business logic using the mock infrastructure built in Phase 2.

### Changes Required

#### File: `packages/functions/src/services/workout.service.test.ts` (NEW)

```typescript
describe('WorkoutService', () => {
  describe('getById', () => {
    it('should return null if workout not found')
    it('should return workout with exercises grouped')
    it('should sort exercises by plan order')
  })

  describe('getTodaysWorkout', () => {
    it('should return null if no pending workouts')
    it('should return next pending workout')
    it('should return in_progress workout over pending')
  })

  describe('start', () => {
    // State transitions
    it('should throw if workout not found')
    it('should throw if workout already in_progress')
    it('should throw if workout already completed')
    it('should throw if workout already skipped')
    it('should transition pending to in_progress')
    it('should set started_at timestamp')

    // Dynamic progression
    it('should apply dynamic progression to sets')
    it('should use previous week performance for progression')
    it('should handle first week with no history')
  })

  describe('complete', () => {
    it('should throw if workout not found')
    it('should throw if workout is pending')
    it('should throw if workout already completed')
    it('should throw if workout already skipped')
    it('should transition in_progress to completed')
    it('should set completed_at timestamp')
  })

  describe('skip', () => {
    it('should throw if workout not found')
    it('should throw if workout already completed')
    it('should throw if workout already skipped')
    it('should allow skipping pending workout')
    it('should allow skipping in_progress workout')
    it('should mark all pending sets as skipped')
  })
})
```

**Test count: ~25 tests**

#### File: `packages/functions/src/services/workout-set.service.test.ts` (NEW)

```typescript
describe('WorkoutSetService', () => {
  describe('log', () => {
    it('should throw if set not found')
    it('should throw if reps is negative')
    it('should throw if weight is negative')
    it('should throw if workout is completed')
    it('should throw if workout is skipped')
    it('should auto-start pending workout on first log')
    it('should update set with actual values')
    it('should set status to completed')
  })

  describe('skip', () => {
    it('should throw if set not found')
    it('should throw if workout is completed')
    it('should throw if workout is skipped')
    it('should set status to skipped')
  })

  describe('unlog', () => {
    it('should throw if set not found')
    it('should throw if set is pending')
    it('should revert completed set to pending')
    it('should clear actual values')
  })

  describe('addSetToExercise', () => {
    it('should throw if workout not found')
    it('should throw if workout is completed')
    it('should copy targets from last set')
    it('should propagate to future workouts')
  })

  describe('removeSetFromExercise', () => {
    it('should throw if workout not found')
    it('should throw if only one set remains')
    it('should only remove pending sets')
    it('should propagate to future workouts')
  })
})
```

**Test count: ~20 tests**

#### File: `packages/functions/src/services/mesocycle.service.test.ts` (NEW)

```typescript
describe('MesocycleService', () => {
  describe('create', () => {
    it('should throw if plan not found')
    it('should throw if plan has no workout days')
    it('should create mesocycle in pending status')
    it('should set current_week to 1')
  })

  describe('start', () => {
    it('should throw if mesocycle not found')
    it('should throw if mesocycle is not pending')
    it('should throw if active mesocycle exists')
    it('should transition to active status')
    it('should generate workouts for all 7 weeks')
    it('should generate sets for each workout')
    it('should apply progressive overload to sets')
    it('should handle deload week (week 7)')
    it('should batch writes in groups of 500')
  })

  describe('getActive', () => {
    it('should return null if no active mesocycle')
    it('should return active mesocycle with details')
  })

  describe('getById', () => {
    it('should return null if not found')
    it('should include week summaries')
    it('should calculate workout counts')
  })

  describe('complete', () => {
    it('should throw if not found')
    it('should throw if not active')
    it('should transition to completed')
  })

  describe('cancel', () => {
    it('should throw if not found')
    it('should throw if not active')
    it('should transition to cancelled')
  })
})
```

**Test count: ~22 tests**

#### File: `packages/functions/src/services/plan-modification.service.test.ts` (NEW)

```typescript
describe('PlanModificationService', () => {
  describe('diffPlanDayExercises', () => {
    it('should detect added exercises')
    it('should detect removed exercises')
    it('should detect modified exercises')
    it('should detect set count changes')
    it('should detect rep changes')
    it('should detect weight changes')
    it('should handle no changes')
  })

  describe('addExerciseToFutureWorkouts', () => {
    it('should add sets to all pending workouts')
    it('should apply progression to each week')
    it('should skip completed workouts')
  })

  describe('removeExerciseFromFutureWorkouts', () => {
    it('should remove pending sets only')
    it('should preserve logged sets')
    it('should handle no matching sets')
  })

  describe('updateExerciseTargetsForFutureWorkouts', () => {
    it('should update targets for pending sets')
    it('should recalculate progression from new base')
    it('should handle set count increase')
    it('should handle set count decrease')
  })

  describe('syncPlanToMesocycle', () => {
    it('should apply full diff to mesocycle')
    it('should handle complex modifications')
  })
})
```

**Test count: ~18 tests**

#### File: `packages/functions/src/services/calendar.service.test.ts` (NEW)

```typescript
describe('CalendarService', () => {
  describe('getMonthData', () => {
    it('should return activities for the month')
    it('should group activities by date')
    it('should include workouts, stretches, and meditations')
    it('should sort by completion time within day')
    it('should handle empty month')
  })

  describe('utcToLocalDate', () => {
    it('should convert UTC to local date with positive offset')
    it('should convert UTC to local date with negative offset')
    it('should handle zero offset')
    it('should handle date boundary crossing')
  })
})
```

**Test count: ~10 tests**

### Success Criteria
- [ ] All 95 service tests pass
- [ ] Each service has >80% code coverage
- [ ] All state transitions tested
- [ ] All error cases tested
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

### Confirmation Gate
Run `npm test` and verify all service tests pass before proceeding.

---

## Phase 4: Handler Unit Tests

### Overview
Test all HTTP handlers for proper request validation, response formatting, and error handling.

### Changes Required

#### File: `packages/functions/src/__tests__/utils/mock-express.ts` (NEW)

```typescript
// Mock Express request/response for handler testing

export function createMockRequest(overrides?: Partial<Request>): Request {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as Request;
}

export function createMockResponse(): Response & { _json: unknown; _status: number } {
  const res = {
    _json: null,
    _status: 200,
    status: vi.fn().mockImplementation((code) => { res._status = code; return res; }),
    json: vi.fn().mockImplementation((data) => { res._json = data; return res; }),
    send: vi.fn().mockReturnThis(),
  };
  return res as any;
}
```

#### File: `packages/functions/src/handlers/exercises.test.ts` (NEW)

```typescript
describe('Exercises Handler', () => {
  describe('GET /exercises', () => {
    it('should return all exercises')
    it('should return 200 status')
  })

  describe('GET /exercises/default', () => {
    it('should return only default exercises')
  })

  describe('GET /exercises/custom', () => {
    it('should return only custom exercises')
  })

  describe('GET /exercises/:id', () => {
    it('should return exercise by id')
    it('should return 404 if not found')
  })

  describe('POST /exercises', () => {
    it('should create exercise with valid data')
    it('should return 201 status')
    it('should return 400 for invalid name')
    it('should return 400 for invalid weight_increment')
  })

  describe('PUT /exercises/:id', () => {
    it('should update exercise')
    it('should return 404 if not found')
    it('should return 400 for invalid data')
  })

  describe('DELETE /exercises/:id', () => {
    it('should delete exercise')
    it('should return 404 if not found')
    it('should return 409 if exercise in use')
  })
})
```

**Test count: ~15 tests**

#### File: `packages/functions/src/handlers/workouts.test.ts` (NEW)

```typescript
describe('Workouts Handler', () => {
  describe('GET /workouts/today', () => {
    it('should return today workout')
    it('should return null if none pending')
  })

  describe('GET /workouts', () => {
    it('should return all workouts')
  })

  describe('GET /workouts/:id', () => {
    it('should return workout with exercises')
    it('should return 404 if not found')
  })

  describe('PUT /workouts/:id/start', () => {
    it('should start workout')
    it('should return 400 if already started')
    it('should return 404 if not found')
  })

  describe('PUT /workouts/:id/complete', () => {
    it('should complete workout')
    it('should return 400 if not in_progress')
    it('should return 404 if not found')
  })

  describe('PUT /workouts/:id/skip', () => {
    it('should skip workout')
    it('should return 400 if already completed')
    it('should return 404 if not found')
  })

  // Set management endpoints
  describe('GET /workouts/:workoutId/sets', () => { ... })
  describe('POST /workouts/:workoutId/sets', () => { ... })
  describe('POST /workouts/:workoutId/exercises/:exerciseId/sets/add', () => { ... })
  describe('DELETE /workouts/:workoutId/exercises/:exerciseId/sets/remove', () => { ... })
})
```

**Test count: ~25 tests**

#### File: `packages/functions/src/handlers/workoutSets.test.ts` (NEW)

```typescript
describe('WorkoutSets Handler', () => {
  describe('PUT /workout-sets/:id/log', () => {
    it('should log set with valid data')
    it('should return 400 for missing reps')
    it('should return 400 for missing weight')
    it('should return 400 for negative values')
    it('should return 404 if not found')
  })

  describe('PUT /workout-sets/:id/skip', () => {
    it('should skip set')
    it('should return 404 if not found')
  })

  describe('PUT /workout-sets/:id/unlog', () => {
    it('should unlog set')
    it('should return 400 if set is pending')
    it('should return 404 if not found')
  })
})
```

**Test count: ~12 tests**

#### File: `packages/functions/src/handlers/plans.test.ts` (NEW)

```typescript
describe('Plans Handler', () => {
  describe('GET /plans', () => { ... })
  describe('GET /plans/:id', () => { ... })
  describe('POST /plans', () => { ... })
  describe('PUT /plans/:id', () => { ... })
  describe('DELETE /plans/:id', () => { ... })

  // Nested routes
  describe('GET /plans/:planId/days', () => { ... })
  describe('POST /plans/:planId/days', () => { ... })
  describe('PUT /plans/:planId/days/:dayId', () => { ... })
  describe('DELETE /plans/:planId/days/:dayId', () => { ... })

  describe('GET /plans/:planId/days/:dayId/exercises', () => { ... })
  describe('POST /plans/:planId/days/:dayId/exercises', () => { ... })
  describe('PUT /plans/:planId/days/:dayId/exercises/:exerciseId', () => { ... })
  describe('DELETE /plans/:planId/days/:dayId/exercises/:exerciseId', () => { ... })
})
```

**Test count: ~25 tests**

#### File: `packages/functions/src/handlers/mesocycles.test.ts` (NEW)

```typescript
describe('Mesocycles Handler', () => {
  describe('GET /mesocycles', () => { ... })
  describe('GET /mesocycles/active', () => { ... })
  describe('GET /mesocycles/:id', () => { ... })
  describe('POST /mesocycles', () => { ... })
  describe('PUT /mesocycles/:id/start', () => { ... })
  describe('PUT /mesocycles/:id/complete', () => { ... })
  describe('PUT /mesocycles/:id/cancel', () => { ... })
})
```

**Test count: ~15 tests**

#### File: `packages/functions/src/handlers/stretchSessions.test.ts` (NEW)

```typescript
describe('StretchSessions Handler', () => {
  describe('POST /stretch-sessions', () => { ... })
  describe('GET /stretch-sessions', () => { ... })
  describe('GET /stretch-sessions/latest', () => { ... })
  describe('GET /stretch-sessions/:id', () => { ... })
})
```

**Test count: ~8 tests**

#### File: `packages/functions/src/handlers/meditationSessions.test.ts` (NEW)

```typescript
describe('MeditationSessions Handler', () => {
  describe('POST /meditation-sessions', () => { ... })
  describe('GET /meditation-sessions', () => { ... })
  describe('GET /meditation-sessions/latest', () => { ... })
  describe('GET /meditation-sessions/:id', () => { ... })
})
```

**Test count: ~8 tests**

#### File: `packages/functions/src/handlers/calendar.test.ts` (NEW)

```typescript
describe('Calendar Handler', () => {
  describe('GET /calendar/:year/:month', () => {
    it('should return calendar data')
    it('should validate year range')
    it('should validate month range')
    it('should handle timezone offset')
  })
})
```

**Test count: ~5 tests**

#### File: `packages/functions/src/handlers/health.test.ts` (NEW)

```typescript
describe('Health Handler', () => {
  describe('GET /health', () => {
    it('should return healthy status')
    it('should include version')
    it('should include environment')
    it('should include timestamp')
  })
})
```

**Test count: ~4 tests**

### Success Criteria
- [ ] All 117 handler tests pass
- [ ] Every endpoint has at least one happy path test
- [ ] All validation errors tested
- [ ] All 404 cases tested
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

### Confirmation Gate
Run `npm test` and verify all handler tests pass before proceeding.

---

## Phase 5: Integration Tests

### Overview
Expand integration test coverage to all 9 API domains using the Firebase emulator.

### Changes Required

#### File: `packages/functions/src/__tests__/integration/plans.integration.test.ts` (NEW)

```typescript
describe('Plans API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should create and retrieve a plan')
  it('should list all plans')
  it('should update a plan')
  it('should delete a plan')
  it('should return 404 for non-existent plan')
  it('should validate plan creation')
  it('should return 409 when deleting plan in use')

  // Plan days
  it('should create plan day')
  it('should list plan days')
  it('should update plan day')
  it('should delete plan day')

  // Plan day exercises
  it('should add exercise to plan day')
  it('should update plan day exercise')
  it('should remove exercise from plan day')
})
```

**Test count: ~15 tests**

#### File: `packages/functions/src/__tests__/integration/mesocycles.integration.test.ts` (NEW)

```typescript
describe('Mesocycles API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should create mesocycle')
  it('should start mesocycle and generate workouts')
  it('should get active mesocycle')
  it('should get mesocycle by id with details')
  it('should list all mesocycles')
  it('should complete mesocycle')
  it('should cancel mesocycle')
  it('should prevent multiple active mesocycles')
  it('should return 404 for non-existent mesocycle')
})
```

**Test count: ~10 tests**

#### File: `packages/functions/src/__tests__/integration/workouts.integration.test.ts` (NEW)

```typescript
describe('Workouts API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should get today workout')
  it('should list all workouts')
  it('should get workout by id with exercises')
  it('should start workout')
  it('should complete workout')
  it('should skip workout')
  it('should log workout set')
  it('should skip workout set')
  it('should add set to exercise')
  it('should remove set from exercise')
})
```

**Test count: ~12 tests**

#### File: `packages/functions/src/__tests__/integration/workoutSets.integration.test.ts` (NEW)

```typescript
describe('WorkoutSets API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should log set with actual values')
  it('should skip set')
  it('should unlog completed set')
  it('should validate log input')
})
```

**Test count: ~5 tests**

#### File: `packages/functions/src/__tests__/integration/stretchSessions.integration.test.ts` (NEW)

```typescript
describe('StretchSessions API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should create stretch session')
  it('should list all sessions')
  it('should get latest session')
  it('should get session by id')
  it('should return 404 for non-existent session')
})
```

**Test count: ~6 tests**

#### File: `packages/functions/src/__tests__/integration/meditationSessions.integration.test.ts` (NEW)

```typescript
describe('MeditationSessions API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should create meditation session')
  it('should list all sessions')
  it('should get latest session')
  it('should get session by id')
  it('should return 404 for non-existent session')
})
```

**Test count: ~6 tests**

#### File: `packages/functions/src/__tests__/integration/calendar.integration.test.ts` (NEW)

```typescript
describe('Calendar API (Integration)', () => {
  beforeAll(async () => { /* check emulator */ })

  it('should get calendar data for month')
  it('should include all activity types')
  it('should handle timezone offset')
  it('should return empty for future month')
})
```

**Test count: ~5 tests**

### Success Criteria
- [ ] All 59 integration tests pass
- [ ] All API domains covered
- [ ] Tests run against Firebase emulator
- [ ] Tests clean up created data
- [ ] `npm run test:integration` passes

### Confirmation Gate
Run `npm run test:integration` and verify all tests pass.

---

## Phase 6: Repository Tests

### Overview
Test all 10 repositories against the Firebase emulator to verify data layer operations.

### Changes Required

#### File: `packages/functions/src/repositories/exercise.repository.test.ts` (NEW)

```typescript
describe('ExerciseRepository', () => {
  // Run against emulator
  beforeAll(async () => { /* init emulator connection */ })
  afterEach(async () => { /* clean up test data */ })

  describe('create', () => {
    it('should create exercise with defaults')
    it('should generate id')
    it('should set timestamps')
  })

  describe('findById', () => {
    it('should find existing exercise')
    it('should return null for non-existent')
  })

  describe('findAll', () => {
    it('should return all exercises ordered by name')
  })

  describe('update', () => {
    it('should update specified fields')
    it('should update timestamp')
    it('should return null for non-existent')
  })

  describe('delete', () => {
    it('should delete exercise')
    it('should return false for non-existent')
  })

  describe('findByName', () => {
    it('should find by exact name')
    it('should return null if not found')
  })

  describe('isInUse', () => {
    it('should return true if referenced')
    it('should return false if not referenced')
  })
})
```

**Similar test files for all 10 repositories:**
- `workout.repository.test.ts` (~15 tests)
- `workout-set.repository.test.ts` (~12 tests)
- `mesocycle.repository.test.ts` (~10 tests)
- `plan.repository.test.ts` (~10 tests)
- `plan-day.repository.test.ts` (~8 tests)
- `plan-day-exercise.repository.test.ts` (~8 tests)
- `stretchSession.repository.test.ts` (~8 tests)
- `meditationSession.repository.test.ts` (~8 tests)

**Total test count: ~95 tests**

### Success Criteria
- [ ] All 95 repository tests pass
- [ ] Tests run against Firebase emulator
- [ ] Each repository method tested
- [ ] `npm run test:integration` passes (repos run with integration tests)

### Confirmation Gate
Run `npm run test:integration` and verify all repository tests pass.

---

## Testing Strategy Summary

### Unit Tests (Phases 1, 3, 4)
- Run with `npm test`
- No external dependencies
- Use mock repositories and fixtures
- Fast execution (~5 seconds)

### Integration Tests (Phases 5, 6)
- Run with `npm run test:integration`
- Require Firebase emulator running
- Test real Firestore operations
- Slower execution (~30 seconds)

### Test Count Summary

| Phase | Category | Tests |
|-------|----------|-------|
| 1 | Progression Services | 43 |
| 2 | Infrastructure | - |
| 3 | Service Unit Tests | 95 |
| 4 | Handler Unit Tests | 117 |
| 5 | Integration Tests | 59 |
| 6 | Repository Tests | 95 |
| **Total** | | **~409 tests** |

---

## References

- Research: `thoughts/shared/research/2026-01-27-testing-gaps-analysis.md`
- Vitest docs: https://vitest.dev/
- Existing tests: `packages/functions/src/__tests__/integration/`
- Types: `packages/functions/src/types/database.ts`
- Services: `packages/functions/src/services/`
- Handlers: `packages/functions/src/handlers/`
