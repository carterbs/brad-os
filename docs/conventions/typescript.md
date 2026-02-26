# TypeScript Conventions

## Rules (CRITICAL)

```typescript
// NEVER use `any` - this is enforced by Oxlint
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

## Zod Validation

All API inputs must be validated with Zod schemas defined in `packages/functions/src/schemas/`:

```typescript
// packages/functions/src/schemas/exercise.schema.ts
export const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  weightIncrement: z.number().positive().default(5),
});

// packages/functions/src/handlers/exercises.ts
import { createExerciseSchema } from '../shared.js';
```

### Zod-only DTO Pattern

- Do not hand-write create/update DTO interfaces when schema inference can be used.
- Export DTO aliases from schema modules, not inline interface types.
- Keep update DTOs as partial-by-default derivatives when possible.

### Canonical backend naming

```ts
// packages/functions/src/schemas/exercise.schema.ts
import { z } from 'zod';

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  weightIncrement: z.number().positive().default(5),
});

export const updateExerciseSchema = createExerciseSchema.partial();

export type CreateExerciseInput = z.input<typeof createExerciseSchema>;
export type CreateExerciseDTO = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseDTO = z.infer<typeof updateExerciseSchema>;
```

## File Naming Conventions

```
# Services: camelCase
workout.service.ts
progression.service.ts

# Routes: kebab-case with .routes suffix
exercise.routes.ts
workout-set.routes.ts

# Tests: same name + .test.ts
workout.service.test.ts
exercise.routes.test.ts
```

## Type Deduplication

When creating new types or models, ALWAYS search the entire codebase for existing types with the same or similar names first. Avoid creating duplicate types that conflict with existing domain models.

Types go in `packages/functions/src/types/`. Import from `../shared.js`.
