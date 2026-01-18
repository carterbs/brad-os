# CLAUDE.md - Lifting Tracker Project

## Project Overview

A single-user weight training workout tracker web app. Users create workout plans, run 6-week mesocycles with progressive overload, and track workouts with automatic weight/rep progression.

**Key concepts:**

- **Plan**: A workout template with configured days/exercises
- **Mesocycle**: A 6-week instance of running a plan (+ 1 deload week)
- **Progressive overload**: Odd weeks add 1 rep, even weeks add weight (default 5 lbs)
- **Deload week**: Week 7, reduced volume (50%) for recovery

## Code Conventions

### TypeScript Rules (CRITICAL)

```typescript
// NEVER use `any` - this is enforced by ESLint
// BAD
function process(data: any) { ... }

// GOOD
function process(data: WorkoutSet) { ... }

// Use explicit return types on all functions
// BAD
function getWorkout(id: string) { ... }

// GOOD
function getWorkout(id: string): Promise<Workout | null> { ... }

// Use strict null checks - handle undefined/null explicitly
// BAD
const name = workout.exercise.name;

// GOOD
const name = workout.exercise?.name ?? 'Unknown';
```

### Validation

All API inputs must be validated with Zod schemas defined in `packages/shared/`:

```typescript
// packages/shared/src/schemas/exercise.ts
export const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  weightIncrement: z.number().positive().default(5),
});

// packages/server/src/routes/exercise.routes.ts
router.post('/', validate(createExerciseSchema), exerciseController.create);
```

### API Patterns

RESTful endpoints following this structure:

```
GET    /api/exercises          # List all
GET    /api/exercises/:id      # Get one
POST   /api/exercises          # Create
PUT    /api/exercises/:id      # Update
DELETE /api/exercises/:id      # Delete
```

Action endpoints use verb suffixes:

```
PUT    /api/workouts/:id/start
PUT    /api/workouts/:id/complete
PUT    /api/workout-sets/:id/log
PUT    /api/workout-sets/:id/skip
```

### Component Patterns

Use Radix UI primitives for all interactive components:

```typescript
import * as Dialog from '@radix-ui/react-dialog';

// Compose Radix primitives, don't rebuild from scratch
export function DeleteConfirmDialog({ onConfirm, children }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          {/* ... */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### State Management

- **Server state**: React Query for all API data
- **Local UI state**: React useState/useReducer
- **Workout in progress**: localStorage (survives browser crash), sync to DB on complete

```typescript
// Use React Query for server state
const { data: exercises, isLoading, error } = useExercises();

// Mutations with optimistic updates where appropriate
const createExercise = useCreateExercise();
```

## Testing Requirements

### Unit Tests (100% coverage required)

Every feature must have comprehensive unit tests written BEFORE implementation (TDD):

```typescript
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

### E2E Tests

Puppeteer tests for critical user flows:

- Workout tracking (logging sets, modifying weight/reps)
- Automated progression verification
- Plan creation flow

E2E tests should be able to start from arbitrary states using seed data.

## Business Logic Reference

### Progressive Overload Rules

```
Week 0: Base weight/reps from plan configuration
Week 1: +1 rep to each exercise
Week 2: +weight (default 5 lbs, configurable per exercise)
Week 3: +1 rep
Week 4: +weight
Week 5: +1 rep
Week 6: +weight
Week 7: DELOAD (50% volume - same exercises, half the sets)
```

## File Naming Conventions

```
# Components: PascalCase
ExerciseCard.tsx
DeletePlanDialog.tsx

# Hooks: camelCase with 'use' prefix
useWorkout.ts
useLocalStorage.ts

# Utilities: camelCase
timerStorage.ts
audio.ts

# Tests: same name + .test.ts
ExerciseCard.test.tsx
useWorkout.test.ts
```

## When Implementing Features

1. Read the relevant plan in `plans/phase-XX-*.md` first
2. Write tests BEFORE implementation (TDD)
3. Start with types/schemas in `packages/shared/`
4. Run full test suite before considering complete
5. Never use `any` - find or create proper types

## Implementation Best Practices

- **Read before acting**: Always read existing code/specs before implementing. Don't work blind.
- **Explicit paths over vague instructions**: Reference exact file paths, not "look at existing patterns."
- **Commit after each phase**: Don't batch commits at the end. Smaller commits = easier rollback.
- **Validate before committing**: Run `npm run lint -- --fix` and `npm test` before every commit.
- **Shared types go in shared**: Put types used by both client and server in `packages/shared/src/types/`. Import from `@lifting/shared`.
- **Use vitest, not jest**: Follow existing test patterns with `@testing-library/react` and `msw` for mocks.
