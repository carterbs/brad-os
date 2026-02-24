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

## QA / Simulator Testing

When asked to QA on a simulator, always validate the feature END-TO-END using the MCP iOS simulator tools. Don't just verify the build passes — actually tap through the UI and confirm the feature works.
