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

**Key rules:**
- **ApiResponse\<T\>**: Import from `__tests__/utils/`, never define inline
- **vi.mock()**: MUST be inline in each test file (vitest hoisting — cannot be shared)
- **Mock repos**: Use `createMock*Repository()` from shared utils, not inline objects
- **Test fixtures**: Use `create*` from shared fixtures, not inline `createTest*` factories
- **Handler import**: Must come AFTER all `vi.mock()` calls

The architecture linter (checks 16 and 17) enforces shared factory usage and prohibits inline ApiResponse definitions.

## QA / Simulator Testing

When asked to QA on a simulator, always validate the feature END-TO-END using the MCP iOS simulator tools. Don't just verify the build passes — actually tap through the UI and confirm the feature works.
