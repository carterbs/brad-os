# CLAUDE.md - Brad OS Project

## Git Worktree Workflow (MANDATORY)

**All code changes MUST be made in git worktrees, not directly on main.**

```bash
# 1. Create a worktree for your change
mkdir -p ../lifting-worktrees
git worktree add ../lifting-worktrees/<branch-name> -b <branch-name>

# 2. Symlink node_modules (worktrees don't have their own)
ln -s /Users/bradcarter/Documents/Dev/brad-os/node_modules ../lifting-worktrees/<branch-name>/node_modules

# 3. Make changes and verify
# ... make changes ...
npm run typecheck && npm run lint && npm test

# 4. If iOS files were changed, run SwiftLint via xcodebuild (see iOS Linting below)

# 5. Commit and merge back to main (from main worktree)
cd /Users/bradcarter/Documents/Dev/brad-os
git merge <branch-name>

# 6. Clean up the worktree
git worktree remove ../lifting-worktrees/<branch-name>
git branch -d <branch-name>
```

**Worktree Setup Requirements:**
- Symlink `node_modules` from main (step 2 above). Only run `npm install` if the branch changes `package.json`.

This keeps main clean and allows easy rollback of changes.

## Subagent Usage (MANDATORY)

**All validation commands MUST be run in subagents to conserve context.**

Use the Task tool with `subagent_type=Bash` for:
- `npm run typecheck` - TypeScript compilation
- `npm run lint` - ESLint checks
- `npm test` - Unit tests (vitest)

Example:
```
Task tool with subagent_type=Bash:
  prompt: "Run npm run typecheck && npm run lint && npm test in /Users/bradcarter/Documents/Dev/brad-os and report results"
```

**Why**: These commands produce verbose output that consumes context. Running them in subagents keeps the main conversation focused on implementation decisions.

**Exception**: Quick single-command checks (like `git status`) can run directly.

## Debugging Cloud Functions (CRITICAL)

**When an endpoint returns errors, check these in order:**

1. **`firebase.json` rewrite path vs `stripPathPrefix()` argument** — must match exactly. e.g., if rewrite is `/api/dev/health-sync/**`, use `stripPathPrefix('health-sync')` NOT `stripPathPrefix('health')`. Mismatch causes routes to silently 404 with no useful logs.
2. **Cloud Function actually deployed?** Check `firebase functions:log --only <functionName>` for deployment audit entries.
3. **App Check debug token registered?** This is the LEAST likely cause — simulators are properly registered. If other API calls work (e.g., HRV history loads), App Check is fine.

**General debugging approach:**
- Check logs and deployed state FIRST before reading source code
- Verify deployed code matches local code
- Confirm the environment (dev vs prod)
- `curl` the endpoint directly to isolate server vs client issues. A raw `APP_CHECK_MISSING` response means routing is OK (token is the issue). A 404 HTML page means hosting rewrite failed.
- Cloud Function request logs are sparse — only deployment audits and instance lifecycle show up in `firebase functions:log`. To debug routing, test with curl or add temporary `console.log` to the handler.
- iOS simulator `print()` doesn't appear in `log stream` — use `xcrun simctl launch --console` (captures stderr/NSLog only, not stdout/print).

## Project Overview

A personal wellness tracking system with a native iOS app and Express API backend. Users create workout plans, run 6-week mesocycles with progressive overload, track stretching sessions, and log meditation.

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

### Shared APIClient (iOS)

This project uses a shared APIClient with App Check for all HTTP requests. Never create separate HTTP layers or bypass the shared APIClient. When wiring new features, always use the existing APIClient pattern.

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

## Testing Requirements

### Unit Tests

Every feature must have comprehensive unit tests:

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

### Type Deduplication

When creating new types or models, ALWAYS search the entire codebase for existing types with the same or similar names first. Avoid creating duplicate types that conflict with existing domain models.

## When Implementing Features

1. **Read the architecture map** for the feature you're working on: `docs/architecture/<feature>.md`. These ~30-line files show the full data flow (View → ViewModel → APIClient → Handler → Service → Firestore) with exact file paths at each layer. Available maps: `lifting`, `stretching`, `meditation`, `meal-planning`, `cycling`, `health`, `calendar`, `today`, `profile`, `history`.
2. If a plan in `thoughts/shared/plans/` is **clearly related** to the task, read it for context on intent and constraints. Skip this step for bug fixes, small tweaks, or tasks with no obvious matching plan.
3. Write tests BEFORE implementation (TDD)
4. Start with types/schemas in `packages/functions/src/types/` and `packages/functions/src/schemas/`
5. Run full test suite before considering complete
6. Never use `any` - find or create proper types

## Validation

Run all checks:

```bash
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint (use --fix to auto-fix)
npm test                 # Unit tests (vitest)
npm run lint:architecture  # Architecture enforcement (layer deps, schema boundary, type dedup, firebase routes, iOS layers)
```

## Implementation Best Practices

- **Read before acting**: Always read existing code/specs before implementing. Don't work blind.
- **Explicit paths over vague instructions**: Reference exact file paths, not "look at existing patterns."
- **Commit after each phase**: Don't batch commits at the end. Smaller commits = easier rollback.
- **Validate before committing**: Run typecheck, lint, and test before every commit.
- **Types go in functions**: Put types in `packages/functions/src/types/`. Import from `../shared.js`.
- **Use vitest, not jest**: Follow existing test patterns.

## iOS App

The project includes a native iOS app at `ios/BradOS/`.

### Setup

Run the setup script to install dependencies for iOS Simulator testing:

```bash
./scripts/setup-ios-testing.sh
```

### Building and Running

```bash
# Build for simulator (no workspace - use xcodeproj directly)
# NOTE: Do NOT pass -sdk flag — it breaks the watchOS companion build.
# NOTE: -skipPackagePluginValidation is required for SwiftLint SPM build plugin in CLI builds.
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

# Install and launch
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

### iOS Linting (SwiftLint)

SwiftLint runs as an SPM build tool plugin — it executes automatically during `xcodebuild build`. There is no separate lint command; a successful build means zero SwiftLint errors.

**Before merging any branch that touches iOS files**, verify the build passes:

```bash
cd ios/BradOS && xcodegen generate && cd ../..
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build
```

SwiftLint is configured in `ios/BradOS/.swiftlint.yml`. All rules are errors — there are no warnings. Key rules enforced:
- `file_length` (max 600 lines) — split large files using Swift extensions
- `type_body_length` (max 500 lines) — move methods to `+Extension.swift` files
- `function_body_length` (max 60 lines) — extract helper methods
- `force_unwrapping` — use `guard let` or `?? default` instead of `!`
- `identifier_name` — no `SCREAMING_CASE`; use `camelCase` for constants
- `discouraged_optional_boolean` — use explicit `Bool` (not `Bool?`); for Codable structs, use `decodeIfPresent ?? false`

**NEVER write `swiftlint:disable` comments.** Fix the underlying code instead. If a rule fires, either the code needs to change or the rule should be turned off globally in `.swiftlint.yml` — never silenced inline.

When splitting files, remember to remove `private` from properties/methods that need cross-file access within the same module.

### Exploratory Testing

Use `/explore-ios` to run exploratory QA testing on the iOS app. This uses:

| Tool | Purpose |
|------|---------|
| `ui_describe_all` | Get accessibility tree |
| `ui_tap` | Tap at coordinates |
| `ui_swipe` | Swipe gestures |
| `ui_type` | Text input |
| `screenshot` | Capture visual state |

### UI / SwiftUI Conventions

Always use the app's shared Theme/color system for UI components. Never hardcode colors. Check for existing design tokens before creating new ones. Dark mode is the default theme.

### iOS App Details

- **Bundle ID:** `com.bradcarter.brad-os`
- **Project:** `ios/BradOS/BradOS.xcodeproj` (use `-project`, NOT `-workspace`)
- **Scheme:** `BradOS`
- **Features:** Workouts, Stretching, Meditation, Calendar, Profile, Cycling, Meal Planning

## Environment / Deployment

The iOS simulator hits DEV Firebase functions, not production. When testing or debugging cloud functions, always verify which environment the simulator is targeting. Use `firebase deploy` to ensure dev functions are up to date before testing.

## Data Architecture

User health/fitness data (weight, lifting plans, cycling data) is stored in Firebase/Firestore, NOT local SQLite. HealthKit is used for Apple Watch workout data and health metrics. The app reads from Firebase as the source of truth, not directly from HealthKit for display.

## QA / Testing

When asked to QA on a simulator, always validate the feature END-TO-END in the simulator using the MCP iOS simulator tools. Don't just verify the build passes — actually tap through the UI and confirm the feature works.

## Test Policy (CRITICAL)

**NEVER skip or disable tests to "solve" a problem.** If tests are failing:
1. Debug the underlying issue
2. Fix the root cause
3. If truly stuck, ASK THE USER before skipping any test

Skipping tests masks real problems.
