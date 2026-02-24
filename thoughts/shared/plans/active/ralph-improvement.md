# Shared Test Bootstrap: Centralize Test Boilerplate and Graduate Lint Enforcement

## Why

This is the highest-leverage harness improvement because it addresses the **most pervasive code duplication in the entire codebase** and follows the project's own principle-to-linter graduation pipeline.

Current state (measured):
- **26 files** define an identical inline `ApiResponse<T>` interface (~8 lines each = 208 duplicated lines)
- **23 files** define inline `createTest*`/`createMock*` factory functions (~15-20 lines each = 350+ duplicated lines)
- **18 files** define identical `vi.mock('../firebase.js')` boilerplate
- **18 files** define identical `vi.mock('../middleware/app-check.js')` boilerplate
- **ZERO handler or service test files** import from the shared `__tests__/utils/` directory
- Architecture lint check #15 detects this as a **warning only** and reports 16 violations — but the golden principles document explicitly says conventions graduate to lint errors after repeated violations

The shared test utilities already exist in `__tests__/utils/` (fixtures.ts, mock-repository.ts, mock-express.ts) but are unused. This improvement:
1. Fills gaps in the shared utilities (missing `ApiResponse`, missing meal planning fixtures/mocks)
2. Migrates all 31 test files to use shared utilities
3. Graduates lint check #15 from warning to error
4. Adds a new check for inline `ApiResponse<T>` duplication
5. Eliminates ~550+ lines of duplicated code

After this improvement:
- Agents writing new tests have ONE canonical pattern to follow
- The lint error catches any regression to inline patterns
- Test files are shorter and more focused on test logic, not boilerplate

## What

### Phase 1: Add Missing Shared Test Utilities

#### 1a. Create `packages/functions/src/__tests__/utils/api-types.ts`

The test-specific `ApiResponse<T>` type. This differs from `types/api.ts` (which uses discriminated unions with `success: true` / `success: false`) — tests need a "loose" combined type for assertion convenience.

```typescript
/**
 * Test-specific API response type for supertest assertions.
 *
 * This intentionally differs from the production ApiResponse/ApiError discriminated
 * union in types/api.ts. Tests need a single combined type because supertest responses
 * are parsed as unknown JSON — we can't use discriminated union narrowing.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

No vitest import needed — this is a pure type file.

#### 1b. Add meal planning fixtures to `packages/functions/src/__tests__/utils/fixtures.ts`

Add factory functions for the 4 meal planning domain types used in handler tests. Add these after the existing meditation section (~line 220):

```typescript
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
    name: 'Garlic Chicken',
    description: 'A simple garlic chicken recipe',
    prep_time: 15,
    cook_time: 30,
    servings: 4,
    ingredients: [],
    steps: [],
    ...createTimestamps(),
    ...overrides,
  };
}

export function createIngredient(overrides?: Partial<Ingredient>): Ingredient {
  return {
    id: generateId('ingredient'),
    name: 'Chicken Breast',
    category: 'protein',
    unit: 'lbs',
    ...createTimestamps(),
    ...overrides,
  };
}
```

Import the required types at the top of the file:
```typescript
import type { Meal } from '../../types/meal.js';
import type { Recipe } from '../../types/recipe.js';
import type { Ingredient } from '../../types/ingredient.js';
```

**Important**: Check the actual type definitions in `types/meal.ts`, `types/recipe.ts`, and `types/ingredient.ts` when implementing. The factory defaults above are based on the inline factories in handler tests — verify all required fields are covered.

#### 1c. Add meal planning mock repos to `packages/functions/src/__tests__/utils/mock-repository.ts`

Add after the existing MeditationSession section (~line 217):

```typescript
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
  findByMealId: MockFn;
}

export function createMockRecipeRepository(): MockRecipeRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByMealId: vi.fn(),
  };
}

// ============ Ingredient Repository Mock ============

export interface MockIngredientRepository extends MockBaseRepository {
  findByCategory: MockFn;
}

export function createMockIngredientRepository(): MockIngredientRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByCategory: vi.fn(),
  };
}

// ============ MealPlan Session Repository Mock ============

export interface MockMealPlanSessionRepository extends MockBaseRepository {
  findByStatus: MockFn;
}

export function createMockMealPlanSessionRepository(): MockMealPlanSessionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByStatus: vi.fn(),
  };
}
```

**Important**: Verify the actual repository interfaces by reading the repository source files (`repositories/meal.repository.ts`, etc.) before implementing. The mock must cover all methods the handler tests exercise.

Also add these to the `MockRepositories` interface and `createMockRepositories()` function:
```typescript
export interface MockRepositories {
  // ... existing repos ...
  mealRepository: MockMealRepository;
  recipeRepository: MockRecipeRepository;
  ingredientRepository: MockIngredientRepository;
  mealPlanSessionRepository: MockMealPlanSessionRepository;
}
```

#### 1d. Update barrel export in `packages/functions/src/__tests__/utils/index.ts`

Add the new module:
```typescript
// Test-specific API types
export * from './api-types.js';
```

### Phase 2: Migrate Handler Tests (14 files)

Each handler test file follows the same migration pattern. Here is the canonical **before/after** using `exercises.test.ts` as the example:

**Before** (~65 lines of boilerplate):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Exercise } from '../shared.js';

// Type for API response body
interface ApiResponse<T = unknown> {              // ← INLINE: remove
  success: boolean;
  data?: T;
  error?: { code: string; message: string; };
}

vi.mock('../firebase.js', () => ({                // ← KEEP: vitest hoisting
  getFirestoreDb: vi.fn(),
}));

vi.mock('../middleware/app-check.js', () => ({     // ← KEEP: vitest hoisting
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

const mockExerciseRepo = {                        // ← INLINE: replace
  findAll: vi.fn(),
  findDefaultExercises: vi.fn(),
  // ... 6 more methods
};

const mockWorkoutSetRepo = {                      // ← INLINE: replace
  findCompletedByExerciseId: vi.fn(),
};

vi.mock('../repositories/exercise.repository.js', () => ({
  ExerciseRepository: vi.fn().mockImplementation(() => mockExerciseRepo),
}));

vi.mock('../repositories/workout-set.repository.js', () => ({
  WorkoutSetRepository: vi.fn().mockImplementation(() => mockWorkoutSetRepo),
}));

import { exercisesApp } from './exercises.js';

function createTestExercise(overrides: Partial<Exercise> = {}): Exercise {  // ← INLINE: replace
  return {
    id: 'exercise-1',
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

**After** (~25 lines of boilerplate):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  type ApiResponse,
  createExercise,
  createMockExerciseRepository,
  createMockWorkoutSetRepository,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repositories
const mockExerciseRepo = createMockExerciseRepository();
const mockWorkoutSetRepo = createMockWorkoutSetRepository();

vi.mock('../repositories/exercise.repository.js', () => ({
  ExerciseRepository: vi.fn().mockImplementation(() => mockExerciseRepo),
}));

vi.mock('../repositories/workout-set.repository.js', () => ({
  WorkoutSetRepository: vi.fn().mockImplementation(() => mockWorkoutSetRepo),
}));

// Import after mocks
import { exercisesApp } from './exercises.js';
```

**Key migration rules:**

1. **`ApiResponse<T>`**: Remove inline interface → import `type ApiResponse` from `..//__tests__/utils/index.js`
2. **`vi.mock()` calls**: KEEP inline. Vitest hoists these — they cannot be extracted to shared modules.
3. **Mock repo objects**: Replace inline object literals → call shared `createMock*Repository()`. The `vi.mock()` factory still references the local variable.
4. **`createTest*` factories**: Replace → import `create*` from shared fixtures. If tests assert on hardcoded IDs like `'exercise-1'`, pass `{ id: 'exercise-1' }` as an override.
5. **Type-only imports from `../shared.js`**: Remove if the test only used the type for factory typing. The shared `createExercise()` already returns `Exercise`.

**Files to migrate (14 handler test files):**

| File | ApiResponse | Factory Replacement | Mock Repo Replacement |
|------|------------|--------------------|-----------------------|
| `handlers/exercises.test.ts` | Yes | `createTestExercise` → `createExercise` | `mockExerciseRepo` → `createMockExerciseRepository()`, `mockWorkoutSetRepo` → `createMockWorkoutSetRepository()` |
| `handlers/workouts.test.ts` | Yes | `createTestWorkout`, `createTestWorkoutSet` → shared | `mockWorkoutRepo` → `createMockWorkoutRepository()`, `mockWorkoutSetRepo` → `createMockWorkoutSetRepository()` |
| `handlers/plans.test.ts` | Yes | `createTestPlan`, `createTestPlanDay`, `createTestPlanDayExercise`, `createTestMesocycle`, `createTestExercise` → shared | All 5 mock repos → shared factories |
| `handlers/mesocycles.test.ts` | Yes | `createTestMesocycle` → `createMesocycle` | `mockMesocycleRepo` → `createMockMesocycleRepository()` |
| `handlers/workoutSets.test.ts` | Yes | `createTestWorkoutSet` → `createWorkoutSet` | Mock repos → shared |
| `handlers/stretchSessions.test.ts` | Yes | `createTestStretchSession` → `createStretchSession` | `mockStretchSessionRepo` → `createMockStretchSessionRepository()` |
| `handlers/stretches.test.ts` | Yes | Inline stretch factories → shared | Mock repos → check if covered |
| `handlers/meditationSessions.test.ts` | Yes | `createTestMeditationSession` → `createMeditationSession` | `mockMeditationSessionRepo` → `createMockMeditationSessionRepository()` |
| `handlers/meals.test.ts` | Yes | `createTestMeal` → `createMeal` (new in Phase 1) | `mockMealRepo` → `createMockMealRepository()` (new in Phase 1) |
| `handlers/ingredients.test.ts` | Yes | Inline factories → `createIngredient` (new) | `mockIngredientRepo` → `createMockIngredientRepository()` (new) |
| `handlers/recipes.test.ts` | Yes | Inline factories → `createRecipe` (new) | `mockRecipeRepo` → `createMockRecipeRepository()` (new) |
| `handlers/mealplans.test.ts` | Yes | Inline factories → shared | Mock repos → shared |
| `handlers/calendar.test.ts` | Yes | Inline factories → shared where available | Service mocks stay inline |
| `handlers/cycling.test.ts` | Yes | Inline `createTestActivity` etc. → shared if added, else keep | Service mocks stay inline (uses `vi.hoisted()`) |

**Note on cycling/health/today-coach handler tests**: These tests mock **services** rather than repositories (e.g., `mockCyclingService` via `vi.hoisted()`). Service mocks are handler-specific and stay inline. Only the `ApiResponse<T>` and any `createTest*` factories should be migrated. If the inline factory creates domain objects that don't have shared fixtures yet, either:
- Add the fixture to `fixtures.ts` if the type is reusable (e.g., `CyclingActivity`)
- Leave the factory inline if it's truly handler-specific

Also migrate `handlers/health.test.ts`, `handlers/health-sync.test.ts`, `handlers/cycling-coach.test.ts`, and `handlers/today-coach.test.ts` — at minimum replace their inline `ApiResponse<T>`.

### Phase 3: Migrate Service Tests (9 files)

Same pattern as handler tests. Service tests are in `packages/functions/src/services/`:

| File | ApiResponse | Factory | Notes |
|------|------------|---------|-------|
| `workout-set.service.test.ts` | Check | `createTest*` → shared | Lifting fixtures exist |
| `workout.service.test.ts` | Check | `createTest*` → shared | Lifting fixtures exist |
| `progression.service.test.ts` | Check | `createTest*` → shared | Progression fixtures exist |
| `dynamic-progression.service.test.ts` | Check | `createTest*` → shared | Progression fixtures exist |
| `plan-modification.service.test.ts` | Check | `createTest*` → shared | Lifting fixtures exist |
| `mesocycle.service.test.ts` | Check | `createTest*` → shared; also has `vi.mock('../firebase.js')` | |
| `calendar.service.test.ts` | Check | `createTest*` → shared where available | Calendar fixtures may be handler-specific |
| `mealplan-critique.service.test.ts` | Check | `createTest*` → shared | Meal planning fixtures new in Phase 1 |
| `mealplan-operations.service.test.ts` | Check | `createTest*` → shared | Meal planning fixtures new in Phase 1 |

For each file: read it first, identify which inline patterns can be replaced with shared imports, and apply the same migration rules from Phase 2.

### Phase 4: Migrate Integration Tests — ApiResponse Only (8 files)

Integration tests in `packages/functions/src/__tests__/integration/` use `supertest` against the real emulator. They don't mock firebase or repos. They DO have:
- Inline `ApiResponse<T>` interface (same as handler tests)
- Sometimes inline `Exercise`/`Workout` interfaces that duplicate `types/*.ts`

Migration: Replace inline `ApiResponse<T>` with import from `../utils/index.js`. For inline domain type interfaces, replace with imports from `../../shared.js`.

Files:
- `__tests__/integration/exercises.integration.test.ts`
- `__tests__/integration/workouts.integration.test.ts`
- `__tests__/integration/plans.integration.test.ts`
- `__tests__/integration/mesocycles.integration.test.ts`
- `__tests__/integration/workoutSets.integration.test.ts`
- `__tests__/integration/stretchSessions.integration.test.ts`
- `__tests__/integration/meditationSessions.integration.test.ts`
- `__tests__/integration/calendar.integration.test.ts`

(Also check `health.integration.test.ts` if it exists.)

### Phase 5: Graduate Architecture Lint Check

#### 5a. Move check from warning to error in `scripts/lint-architecture.ts`

At line ~1369-1371, move `checkTestFactoryUsage` from the `warningChecks` array to the `checks` array:

```typescript
// Before (line 1332-1348):
const checks: Array<() => CheckResult> = [
  // ... 15 existing checks ...
  checkUntestedHighRisk,
];

// After:
const checks: Array<() => CheckResult> = [
  // ... 15 existing checks ...
  checkUntestedHighRisk,
  checkTestFactoryUsage,  // Graduated from warning to error
];
```

Remove it from `warningChecks` (line 1369-1371):
```typescript
// Before:
const warningChecks: Array<() => CheckResult> = [
  checkTestFactoryUsage,
];

// After:
const warningChecks: Array<() => CheckResult> = [];
```

#### 5b. Add new check for inline ApiResponse in test files

Add a new check function after `checkTestFactoryUsage` (~line 1323):

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Check 17: No inline ApiResponse in test files
//
// Test files should import ApiResponse from __tests__/utils/api-types.ts
// rather than defining their own inline interface.
// ─────────────────────────────────────────────────────────────────────────────

function checkNoInlineApiResponse(): CheckResult {
  const name = 'No inline ApiResponse in tests';
  const violations: string[] = [];

  const testDirs = [
    path.join(FUNCTIONS_SRC, 'handlers'),
    path.join(FUNCTIONS_SRC, 'services'),
    path.join(FUNCTIONS_SRC, 'repositories'),
    path.join(FUNCTIONS_SRC, '__tests__', 'integration'),
  ];

  const inlinePattern = /^interface ApiResponse/m;

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) continue;

    const testFiles = fs.readdirSync(dir).filter(
      (f) => f.endsWith('.test.ts') || f.endsWith('.spec.ts')
    );

    for (const file of testFiles) {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      if (inlinePattern.test(content)) {
        const relPath = path.relative(ROOT_DIR, fullPath);
        violations.push(
          `${relPath} defines inline ApiResponse interface.\n` +
          `    Import from __tests__/utils/api-types.ts instead.`
        );
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}
```

Add `checkNoInlineApiResponse` to the `checks` array.

### Phase 6: Update Documentation

#### 6a. Update `docs/conventions/testing.md`

Add a "Handler Test Pattern" section after the existing "Unit Tests" section:

```markdown
## Handler Test Pattern (Canonical)

All handler tests follow this structure. Import shared utilities instead of defining inline boilerplate.

\`\`\`typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  type ApiResponse,
  createExercise,
  createMockExerciseRepository,
} from '../__tests__/utils/index.js';

// Firebase and app-check mocks MUST be inline (vitest hoists vi.mock calls)
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Repository mocks — use shared factory, keep vi.mock inline
const mockExerciseRepo = createMockExerciseRepository();
vi.mock('../repositories/exercise.repository.js', () => ({
  ExerciseRepository: vi.fn().mockImplementation(() => mockExerciseRepo),
}));

// Import handler AFTER mocks
import { exercisesApp } from './exercises.js';

describe('Exercises Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all exercises', async () => {
    const exercises = [createExercise({ id: '1' }), createExercise({ id: '2' })];
    mockExerciseRepo.findAll.mockResolvedValue(exercises);

    const response = await request(exercisesApp).get('/');
    const body = response.body as ApiResponse<Exercise[]>;

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});
\`\`\`

**Key rules:**
- **ApiResponse<T>**: Import from \`__tests__/utils/\`, never define inline
- **vi.mock()**: MUST be inline in each test file (vitest hoisting — cannot be shared)
- **Mock repos**: Use \`createMock*Repository()\` from shared utils, not inline objects
- **Test fixtures**: Use \`create*\` from shared fixtures, not inline \`createTest*\` factories
- **Handler import**: Must come AFTER all \`vi.mock()\` calls

The architecture linter (check 16) enforces shared factory usage. Inline factories that match \`createMock*/createTest*/mock*Factory\` cause a build failure.
```

#### 6b. Update `docs/golden-principles.md`

Move the test factory principle from "Enforced (by convention)" to "Enforced (linter/hook exists)":

Under `### Architecture [lint-architecture]`, add:
```
- Prefer shared test factories from `__tests__/utils/` over inline `createMock*`/`createTest*` definitions
- No inline `ApiResponse` interface in test files — import from `__tests__/utils/api-types.ts`
```

Remove from the "Enforced (by convention)" section:
```
- Prefer shared test factories from `__tests__/utils/` over inline `createMock*` definitions (warning-only lint, graduating)
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `packages/functions/src/__tests__/utils/api-types.ts` | **Create** | Test-friendly `ApiResponse<T>` interface (~15 lines) |
| `packages/functions/src/__tests__/utils/fixtures.ts` | **Modify** | Add `createMeal`, `createRecipe`, `createIngredient` factory functions. Add type imports for Meal, Recipe, Ingredient. (~50 lines added) |
| `packages/functions/src/__tests__/utils/mock-repository.ts` | **Modify** | Add `MockMealRepository`, `MockRecipeRepository`, `MockIngredientRepository`, `MockMealPlanSessionRepository` interfaces + factory functions. Update `MockRepositories` aggregate. (~80 lines added) |
| `packages/functions/src/__tests__/utils/index.ts` | **Modify** | Add `export * from './api-types.js'` re-export (1 line) |
| `packages/functions/src/handlers/exercises.test.ts` | **Modify** | Replace inline ApiResponse, createTestExercise, mockExerciseRepo, mockWorkoutSetRepo with shared imports |
| `packages/functions/src/handlers/workouts.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/plans.test.ts` | **Modify** | Same pattern — has 5 inline mock repos and 5 inline factories |
| `packages/functions/src/handlers/mesocycles.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/workoutSets.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/stretchSessions.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/stretches.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/meditationSessions.test.ts` | **Modify** | Same migration pattern |
| `packages/functions/src/handlers/meals.test.ts` | **Modify** | Replace inline ApiResponse + createTestMeal + mockMealRepo with shared (new in Phase 1) |
| `packages/functions/src/handlers/ingredients.test.ts` | **Modify** | Replace inline ApiResponse + factories + mockIngredientRepo with shared (new in Phase 1) |
| `packages/functions/src/handlers/recipes.test.ts` | **Modify** | Replace inline ApiResponse + factories + mockRecipeRepo with shared (new in Phase 1) |
| `packages/functions/src/handlers/mealplans.test.ts` | **Modify** | Replace inline ApiResponse + factories + mockMealPlanSessionRepo with shared |
| `packages/functions/src/handlers/calendar.test.ts` | **Modify** | Replace inline ApiResponse + applicable factories |
| `packages/functions/src/handlers/cycling.test.ts` | **Modify** | Replace inline ApiResponse + createTest* factories. Service mocks stay inline (uses vi.hoisted). |
| `packages/functions/src/handlers/cycling-coach.test.ts` | **Modify** | Replace inline ApiResponse + applicable factories |
| `packages/functions/src/handlers/health.test.ts` | **Modify** | Replace inline ApiResponse + applicable factories |
| `packages/functions/src/handlers/health-sync.test.ts` | **Modify** | Replace inline ApiResponse + applicable factories |
| `packages/functions/src/handlers/today-coach.test.ts` | **Modify** | Replace inline ApiResponse + applicable factories |
| `packages/functions/src/services/workout-set.service.test.ts` | **Modify** | Replace inline createTest* factories with shared fixture imports |
| `packages/functions/src/services/workout.service.test.ts` | **Modify** | Replace inline createTest* factories with shared fixture imports |
| `packages/functions/src/services/progression.service.test.ts` | **Modify** | Replace inline createTest* factories with shared fixture imports |
| `packages/functions/src/services/dynamic-progression.service.test.ts` | **Modify** | Replace inline createTest* factories with shared fixture imports |
| `packages/functions/src/services/plan-modification.service.test.ts` | **Modify** | Replace inline createTest* factories with shared fixture imports |
| `packages/functions/src/services/mesocycle.service.test.ts` | **Modify** | Replace inline factories. Also has inline firebase mock — keep inline. |
| `packages/functions/src/services/calendar.service.test.ts` | **Modify** | Replace inline createTest* factories where shared alternatives exist |
| `packages/functions/src/services/mealplan-critique.service.test.ts` | **Modify** | Replace inline factories with new shared meal planning fixtures |
| `packages/functions/src/services/mealplan-operations.service.test.ts` | **Modify** | Replace inline factories with new shared meal planning fixtures |
| `packages/functions/src/__tests__/integration/exercises.integration.test.ts` | **Modify** | Replace inline ApiResponse + inline Exercise interface with shared imports |
| `packages/functions/src/__tests__/integration/workouts.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/plans.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/mesocycles.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/workoutSets.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/stretchSessions.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/meditationSessions.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/calendar.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import |
| `packages/functions/src/__tests__/integration/health.integration.test.ts` | **Modify** | Replace inline ApiResponse with shared import (check if file exists) |
| `scripts/lint-architecture.ts` | **Modify** | Graduate checkTestFactoryUsage to checks array; add checkNoInlineApiResponse; remove from warningChecks |
| `docs/conventions/testing.md` | **Modify** | Add "Handler Test Pattern (Canonical)" section |
| `docs/golden-principles.md` | **Modify** | Move test factory principle from "by convention" to "enforced" |

**Total: 1 new file, ~41 modified files**

## Tests

### Existing tests must continue to pass

The primary verification is that **all existing tests still pass** after migration. Run:

```bash
npm run validate   # Full validation: typecheck + lint + test + architecture
```

Every test assertion should produce identical results. The migration only changes WHERE boilerplate is defined, not WHAT the tests verify.

### Architecture lint must pass with new checks

After graduating check #15 and adding check #17:

```bash
npm run lint:architecture
```

Expected: All checks pass (0 violations, 0 warnings). If any test files still have inline patterns, the lint will catch them.

### No new unit tests needed

This is a test infrastructure refactoring — it changes how tests are organized, not what they test. The verification IS running the existing tests.

## QA

### Step 1: Verify shared utilities work in isolation

Create a temporary test file that imports from shared utils to verify they compile:

```bash
# Quick sanity check — import the new types and factories
npx tsc -b
```

### Step 2: Run full validation

```bash
npm run validate
```

Expected: All 4 checks pass (typecheck, lint, tests, architecture). Pay special attention to:
- **TypeScript compilation**: Shared imports resolve correctly from handler/service/integration test paths
- **ESLint**: No new lint errors from changed imports
- **Tests**: All existing tests pass with identical assertions
- **Architecture**: 0 violations, 0 warnings

### Step 3: Verify lint enforcement catches regression

Temporarily add an inline factory to a migrated test file:

```typescript
// In exercises.test.ts, temporarily add:
function createTestExercise(): Exercise {
  return { id: 'x', name: 'X' } as Exercise;
}
```

Run:
```bash
npm run lint:architecture
```

Expected: Check 16 (Shared test factory usage) fails with 1 violation for `exercises.test.ts`.

### Step 4: Verify ApiResponse check catches regression

Temporarily add an inline `ApiResponse` to a migrated test file:

```typescript
// In exercises.test.ts, temporarily add:
interface ApiResponse<T = unknown> { success: boolean; data?: T; }
```

Run:
```bash
npm run lint:architecture
```

Expected: Check 17 (No inline ApiResponse) fails with 1 violation.

### Step 5: Revert intentional regressions

```bash
git checkout -- packages/functions/src/handlers/exercises.test.ts
```

### Step 6: Verify test count is unchanged

```bash
npx vitest run --reporter=verbose 2>&1 | tail -5
```

Expected: Same number of test suites and tests as before the migration. No tests should be added or removed.

## Conventions

The following project conventions apply:

1. **Git Worktree Workflow** — All changes must be made in a worktree branch, not directly on main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **No `any` types** — The shared `mock-repository.ts` has one existing `eslint-disable` for `MockFn` type alias (line 17-18). Do not introduce additional `any` usages. New mock repo interfaces should follow the same `MockFn` pattern.

4. **Explicit return types** — All new factory functions must have explicit return types (e.g., `createMeal(overrides?: Partial<Meal>): Meal`).

5. **File naming** — New file `api-types.ts` follows the existing pattern in `__tests__/utils/` (kebab-case).

6. **Principle-to-Linter Pipeline** — From `docs/golden-principles.md`: "When a convention-only principle is violated twice, it graduates to a linter rule." This improvement executes that pipeline for the test factory convention, which has been violated 23 times.

7. **TDD** — Since this is a refactoring that doesn't change behavior, running existing tests IS the verification. No new test files needed.

8. **Domain types in types/ directory** — The new `ApiResponse` in `__tests__/utils/api-types.ts` is a test utility type, not a domain type. It intentionally differs from `types/api.ts` and lives in the test utils directory. The architecture linter checks types in `handlers/`, `services/`, and `repositories/` — not in `__tests__/`.

9. **Import from `../shared.js`** — Handler tests that import domain types should continue using `../shared.js`. The new `ApiResponse` import path is `../__tests__/utils/index.js` (for handler tests) or `../utils/index.js` (for integration tests).

10. **Vitest mock hoisting** — `vi.mock()` calls are hoisted by vitest to the top of the file, before imports. This means:
    - `vi.mock()` with a factory function MUST be in each test file (cannot be shared)
    - The factory can reference `const` variables declared later in the file because vitest converts them to `var` declarations during transformation
    - The mock implementation is a closure that reads the variable at call time (test execution), not at definition time
    - This is why `const mockRepo = createMockExerciseRepository()` works even though `vi.mock()` is hoisted above it
