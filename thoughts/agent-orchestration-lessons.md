# Agent Orchestration Lessons

## What Worked

### 1. Read specs before spawning agents
Reading the phase plans first let me understand dependencies (Phase 7 needs Phase 6) and give accurate scope to each agent. Don't spawn blind.

### 2. Validation agents catch real issues
The validation agents found and fixed:
- Lint errors (strict-boolean-expressions, non-null assertions)
- Test assertion patterns (React Query mutation mocks need different assertion style)
- Missing `noValidate` on forms blocking custom validation

Always spawn a validation agent before committing.

### 3. Explicit file paths in prompts
Telling agents exactly which files to read first (`/Users/bradcarter/Documents/Dev/lifting/packages/server/src/routes/`) was more reliable than saying "look at existing patterns."

### 4. Commit after each phase, not at the end
Committing after Phase 6 before starting Phase 7 meant cleaner git history and easier rollback if Phase 7 had issues.

## What Would've Been More Efficient

### 1. Include lint/test commands in implementation prompt
The implementation agents didn't always run lint. Should have included:
```
After implementing, run:
- npm run lint -- --fix
- npm test
Fix any failures before finishing.
```

### 2. Specify the exact test patterns to follow
Instead of "write tests first (TDD)", should have said:
```
Follow this test pattern from existing tests:
- Use vitest (not jest)
- Use @testing-library/react patterns
- Mock API calls with msw handlers
```

The agents sometimes used Jest patterns that needed fixing.

### 3. Give validation agents a narrower scope
The validation prompt was too broad ("verify everything"). Better:
```
1. Run: npm run lint -- packages/client/src/components/RestTimer
2. Run: npm test -- RestTimer
3. Check for `any` types in new files only
4. Fix issues found
```

### 4. Include the shared types location
Agents created types locally instead of using shared package. Should specify:
```
Put shared types in packages/shared/src/types/
Import from @brad-os/shared in both client and server
```

### 5. Parallel validation would've been fine
Phase 6 validation and Phase 7 implementation could have run in parallel since they don't share files. But the sequential approach was safer for a first run.

## Prompt Template for Future Phases

```
You are implementing Phase X: [Name].

## Context
- Monorepo: packages/server, packages/client, packages/shared
- [Key tech: SQLite, React Query, Radix UI, Zod]
- No `any` types, explicit return types

## Read first
- /path/to/phase-plan.md
- /path/to/similar/existing/code.ts

## Implement (in order)
1. [Specific file] - [what it does]
2. [Specific file] - [what it does]

## Test patterns
- Use vitest, not jest
- Mock HTTP with msw
- Follow patterns in /path/to/existing/tests

## Before finishing
1. npm run lint -- --fix
2. npm test
3. Verify no `any` types in new files
4. Fix any failures

Report what you implemented and test results.
```

## Metrics

| Phase | Implementation Agent | Validation Agent | Issues Fixed |
|-------|---------------------|------------------|--------------|
| 6 | ~15 min | ~8 min | 8 lint errors, 7 test fixes |
| 7 | ~12 min | ~5 min | 3 lint errors |

Validation agents took ~40% of implementation time but caught real issues that would've blocked the commit.
