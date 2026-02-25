# Testing Conventions

## Test Policy (CRITICAL)

**NEVER skip or disable tests to "solve" a problem.** If tests are failing:
1. Debug the underlying issue
2. Fix the root cause
3. If truly stuck, ASK THE USER before skipping any test

Skipping tests masks real problems.

## Unit Tests

Every feature must have comprehensive unit tests:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test file naming: *.test.ts or *.spec.ts
// Co-locate tests: src/services/workout.service.test.ts

describe('WorkoutService', () => {
  describe('calculateProgression', () => {
    it('should add 1 rep on odd weeks', () => { ... });
    it('should add weight on even weeks', () => { ... });
    it('should not progress if previous week incomplete', () => { ... });
  });
});
```

## Framework

Use **vitest**, not jest. Follow existing test patterns.
Always use explicit imports — `import { describe, it, expect, vi } from 'vitest'` — never rely on globals.

## TDD Workflow

1. Write tests BEFORE implementation
2. Start with types/schemas in `packages/functions/src/types/` and `packages/functions/src/schemas/`
3. Run full test suite before considering complete
4. Never use `any` — find or create proper types

## Handler Test Pattern (Canonical)

All handler tests follow this structure. Import shared utilities instead of defining inline boilerplate.

```typescript
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
```

## Shared Test Utilities

- `packages/functions/src/__tests__/utils/` stores handler/service/integration shared helpers and fixtures (`create*` helpers, mock repos, `ApiResponse` type).
- `packages/functions/src/test-utils/` stores Firestore repository-test helpers (`createFirestoreMocks`, `setupFirebaseMock`, `createMockQuerySnapshot`, etc.).
- Keep handler tests using the inline mock constraints above (`vi.mock` inline + import after mocks), and pull shared test types/helpers from `__tests__/utils`.

Repository test mini-pattern:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFirestoreMocks, setupFirebaseMock } from '../test-utils/index.js';

describe('IngredientRepository', () => {
  beforeEach(() => {
    vi.resetModules();
    setupFirebaseMock(createFirestoreMocks());
  });

  it('builds repository with mocked db', async () => {
    const { IngredientRepository } = await import('../repositories/ingredient.repository.js');
    expect(IngredientRepository).toBeDefined();
  });
});
```

**Key rules:**
- **ApiResponse\<T\>**: Import from `__tests__/utils/`, never define inline
- **vi.mock()**: MUST be inline in each test file (vitest hoisting — cannot be shared)
- **Mock repos**: Use `createMock*Repository()` from shared utils, not inline objects
- **Test fixtures**: Use `create*` from shared fixtures, not inline `createTest*` factories
- **Handler import**: Must come AFTER all `vi.mock()` calls

The architecture linter (checks 15 and 16) enforces shared factory usage and prohibits inline ApiResponse definitions.

## Focused Tests (.only) Policy

**NEVER commit focused tests.** Using `it.only`, `describe.only`, `test.only`, `fit`, or `fdescribe` silently skips all other tests in the suite. vitest will report success even though most tests never ran.

For debugging, run the full suite via `npm run validate` and grep the log:
```bash
npm run validate
# Then inspect: Read .validate/test.log or Grep pattern=".." path=".validate/test.log"
```

The architecture linter (check 18) enforces this — focused tests cause a build failure.

## Test Quality Policy

**Every test case must contain meaningful assertions.** The architecture linter (check 19) enforces two rules:

1. **No empty test bodies.** `it('name', () => {})` is never acceptable. If a test case exists, it must verify behavior.

2. **No assertion-free test files.** A test file must contain at least one `expect()` call. Files with test cases but zero assertions are placeholder files that provide false confidence.

### Bad Examples (caught by linter)

```typescript
// Empty body — flagged
it('should calculate progression', () => {});

// File with test cases but no expect() — flagged
describe('WorkoutService', () => {
  it('creates a workout', async () => {
    await service.create(data);
    // Missing: expect(result).toBeDefined();
  });
  it('deletes a workout', async () => {
    await service.delete(id);
    // Missing: expect(result.success).toBe(true);
  });
});
```

### Good Examples

```typescript
it('should calculate progression', () => {
  const result = calculateProgression(previousWeek);
  expect(result.reps).toBe(9);
  expect(result.weight).toBe(135);
});

it('should reject invalid input', () => {
  expect(() => validateInput(null)).toThrow();
});
```

## QA / Simulator Testing

When asked to QA on a simulator, always validate the feature END-TO-END using the MCP iOS simulator tools. Don't just verify the build passes — actually tap through the UI and confirm the feature works.
