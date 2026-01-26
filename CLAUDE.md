# CLAUDE.md - Lifting Tracker Project

## Git Worktree Workflow (MANDATORY)

**All code changes MUST be made in git worktrees, not directly on main.**

```bash
# 1. Create a worktree for your change
mkdir -p ../lifting-worktrees
git worktree add ../lifting-worktrees/<branch-name> -b <branch-name>

# 2. Set up the worktree (REQUIRED before running tests)
cd ../lifting-worktrees/<branch-name>
npm install
npm run build -w @brad-os/shared

# 3. Make changes and verify
# ... make changes ...
npm run validate  # Run full test suite

# 4. Commit and merge back to main (from main worktree)
cd /Users/bradcarter/Documents/Dev/brad-os
git merge <branch-name>

# 5. Clean up the worktree
git worktree remove ../lifting-worktrees/<branch-name>
git branch -d <branch-name>
```

**Worktree Setup Requirements:**
- `npm install` - Install dependencies (worktrees don't share node_modules)
- `npm run build -w @brad-os/shared` - Build shared package (required by server/client)

This keeps main clean and allows easy rollback of changes.

## Subagent Usage (MANDATORY)

**All validation commands MUST be run in subagents to conserve context.**

Use the Task tool with `subagent_type=Bash` for:
- `npm run validate` - Full validation suite
- `npm run typecheck` - TypeScript compilation
- `npm run lint` - ESLint checks
- `npm test` - Unit tests (vitest)
- `npm run test:e2e` - E2E tests (Playwright)

Example:
```
Task tool with subagent_type=Bash:
  prompt: "Run npm run validate in /Users/bradcarter/Documents/Dev/brad-os and report results"
```

**Why**: These commands produce verbose output that consumes context. Running them in subagents keeps the main conversation focused on implementation decisions.

**Exception**: Quick single-command checks (like `git status`) can run directly.

## Database Isolation (IMPORTANT)

The app uses separate SQLite databases based on `NODE_ENV`:

| Database | NODE_ENV | Port | Usage |
|----------|----------|------|-------|
| `brad-os.db` | (none) or `development` | 3000/3001 | Local development |
| `brad-os.test.{N}.db` | `test` | 3200+N*10 | E2E tests (parallel workers) |
| `brad-os.prod.db` | `production` | - | Production |

**Never make direct API calls to test or manipulate data on the dev server.**

The E2E test suite runs 4 parallel workers, each with its own server and database:
- Worker 0: ports 3200/3201, database `brad-os.test.0.db`
- Worker 1: ports 3210/3211, database `brad-os.test.1.db`
- Worker 2: ports 3220/3221, database `brad-os.test.2.db`
- Worker 3: ports 3230/3231, database `brad-os.test.3.db`

Do not:
- Call `/api/test/reset` on the development server
- Create test data via API calls to `localhost:3001` when dev server is running
- Run E2E-style tests manually against the dev server

If you need to test API behavior, write proper E2E tests that run in isolation via `npm run test:e2e`.

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

Playwright tests for critical user flows. **Target: All E2E tests must complete in under 45 seconds.**

Current test count: ~76 tests across 9 files.

#### E2E Performance Guidelines (CRITICAL)

**1. NEVER use `waitForTimeout()`** - Use proper assertions instead:
```typescript
// BAD - arbitrary wait
await page.waitForTimeout(1000);
await calendarPage.clickDate(date);

// GOOD - wait for specific condition
await calendarPage.waitForActivityDot(date, 'workout');
await calendarPage.clickDate(date);
```

**2. NEVER use `isVisible()` for assertions** - It returns immediately without waiting:
```typescript
// BAD - no retry, fails if data still loading
async planExists(name: string): Promise<boolean> {
  return this.getPlanCard(name).isVisible(); // Returns immediately!
}

// GOOD - auto-retries until visible or timeout
async planExists(name: string): Promise<boolean> {
  try {
    await expect(this.getPlanCard(name)).toBeVisible({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
```
Also applies to: `isEnabled()`, `isChecked()`, `isHidden()` - use `expect()` assertions instead.

**3. Use API for setup, UI for verification** - Only test UI interactions you're actually verifying:
```typescript
// BAD - slow UI setup for every test
await plansPage.createPlan(config);
await mesoPage.startMesocycle(planName, startDate);
await todayPage.trackAllSets();

// GOOD - API setup, UI verification
await api.setupWorkoutScenario('Bench Press');
await todayPage.goto();
expect(await todayPage.hasWorkoutScheduled()).toBe(true);
```

**4. Hybrid approach for long journeys** - Mix UI and API to cover both:
```typescript
// For a 7-week mesocycle with 14 workouts:
// - UI tracking for key weeks (1, 6, 7) - tests real interactions
// - API tracking for weeks 2-5 - tests progression logic without UI overhead
const useUI = (week === 1 || week === 6 || week === 7) && i === 0;
if (useUI) {
  await trackWorkout(workout.id, ...);
} else {
  await api.completeWorkoutViaApi(workout.id);
}
```

**5. Avoid fake timers for React state** - Playwright's `clock.runFor()` doesn't sync reliably with React:
```typescript
// BAD - unreliable with React state updates
await page.clock.runFor(300000); // Fast-forward 5 minutes
await expect(page.getByText('Complete')).toBeVisible(); // Often fails

// GOOD - test the behavior directly
await page.getByRole('button', { name: 'End' }).click();
await page.getByRole('button', { name: 'End Session' }).click();
```

**6. Use page objects with smart waiting** - Encapsulate wait logic:
```typescript
// In calendar.page.ts
async waitForActivityDot(date: Date, type: 'workout' | 'stretch'): Promise<void> {
  const dateStr = this.formatDateKey(date);
  await expect(this.page.locator(`[data-testid="${type}-dot-${dateStr}"]`))
    .toBeVisible({ timeout: 5000 });
}
```

**7. Keep individual test files under 10 seconds**:
| File | Target | Tests |
|------|--------|-------|
| smoke.spec.ts | <3s | 3 |
| calendar.spec.ts | <8s | 16 |
| meditation.spec.ts | <10s | 18 |
| complete-mesocycle-journey.spec.ts | <10s | 1 |

E2E tests should be able to start from arbitrary states using seed data via the `ApiHelper` class.

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

## Validation

Run all checks with a single command:

```bash
npm run validate
```

This runs TypeScript, lint, unit tests, and E2E tests with a summary table:

```
┌────────────┬───────────┬───────────────────────────┐
│   Check    │  Status   │          Details          │
├────────────┼───────────┼───────────────────────────┤
│ TypeScript │ PASSED    │ No type errors            │
│ Lint       │ PASSED    │ No lint errors            │
│ Unit Tests │ PASSED    │ 775 passed                │
│ E2E Tests  │ PASSED    │ 42 passed                 │
└────────────┴───────────┴───────────────────────────┘
```

Individual commands:
- `npm run typecheck` - TypeScript compilation
- `npm run lint` - ESLint (use `--fix` to auto-fix)
- `npm test` - Unit tests (vitest)
- `npm run test:e2e` - E2E tests (Playwright)

## Implementation Best Practices

- **Read before acting**: Always read existing code/specs before implementing. Don't work blind.
- **Explicit paths over vague instructions**: Reference exact file paths, not "look at existing patterns."
- **Commit after each phase**: Don't batch commits at the end. Smaller commits = easier rollback.
- **Validate before committing**: Run `npm run validate` before every commit.
- **Shared types go in shared**: Put types used by both client and server in `packages/shared/src/types/`. Import from `@brad-os/shared`.
- **Use vitest, not jest**: Follow existing test patterns with `@testing-library/react` and `msw` for mocks.

## iOS App Testing

The project includes a native iOS app at `ios/BradOS/`. Claude can perform exploratory testing using the iOS Simulator MCP.

### Setup

Run the setup script to install dependencies:

```bash
./scripts/setup-ios-testing.sh
```

This installs:
- **idb-companion** (Homebrew) - Facebook's iOS Development Bridge
- **fb-idb** (pip) - Python client for idb
- **ios-simulator-mcp** (npx) - MCP server for Claude Code integration

### Building and Running

```bash
# Build for simulator
xcodebuild -workspace ios/BradOS/BradOS.xcworkspace \
  -scheme BradOS \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro' \
  -derivedDataPath ./build/ios \
  build

# Install and launch
xcrun simctl install booted ./build/ios/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

### Exploratory Testing Skill

Use `/explore-ios` to run exploratory QA testing on the iOS app. This uses:

| Tool | Purpose |
|------|---------|
| `ui_describe_all` | Get accessibility tree (like Playwright's `browser_snapshot`) |
| `ui_tap` | Tap at coordinates |
| `ui_swipe` | Swipe gestures |
| `ui_type` | Text input |
| `screenshot` | Capture visual state |

### iOS App Details

- **Bundle ID:** `com.bradcarter.brad-os`
- **Workspace:** `ios/BradOS/BradOS.xcworkspace`
- **Scheme:** `BradOS`
- **Features:** Stretching, Meditation, Calendar, Profile (mirrors PWA)

## Test Policy (CRITICAL)

**NEVER skip or disable tests to "solve" a problem.** If tests are failing or timing out:
1. Debug the underlying issue (port conflicts, server startup, test infrastructure)
2. Fix the root cause
3. If truly stuck, ASK THE USER before skipping any test

Skipping tests masks real problems. A test taking >1 minute signals infrastructure issues, not a need to skip.
