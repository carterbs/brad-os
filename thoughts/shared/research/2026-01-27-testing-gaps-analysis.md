---
date: 2026-01-27
researcher: claude
git_commit: 5c89115
branch: main
topic: Cloud Functions Testing Gaps Analysis
tags: [testing, unit-tests, integration-tests, firebase-emulator, vitest]
status: complete
---

# Research Question

What testing gaps exist in the cloud functions (`packages/functions`)? This includes unit test coverage, emulator testing setup, integration testing, and test utilities/mocking patterns.

# Summary

The Brad OS cloud functions have **significant testing gaps**. Currently there are only **3 test files with 10 total tests**, covering just 2% of the codebase. All 9 handlers (49 endpoints) and all 7 services have **zero unit tests**. The Firebase emulator infrastructure is mostly complete but integration tests only cover 2 of 9 API domains.

**Critical findings:**
- **0 unit tests** for services containing core business logic (progression, workout state, mesocycle generation)
- **0 handler tests** for any of the 49 API endpoints
- **No mocking infrastructure** - `firebase-functions-test` is installed but unused
- **No test fixtures** - Each test manually creates/cleans up data
- **Repository pattern supports DI** - Already designed for testability but not leveraged

**Test priority recommendations:**
1. `dynamic-progression.service.ts` - Core algorithm with multiple pathways
2. `progression.service.ts` - Pure functions, easy to test
3. `workout.service.ts` - Complex state management
4. `mesocycle.service.ts` - Workout generation logic

# Detailed Findings

## 1. Current Test Coverage

### Existing Test Files

| File | Tests | What's Tested |
|------|-------|---------------|
| `shared.test.ts` | 4 | `createSuccessResponse()`, `createErrorResponse()`, `APP_VERSION` |
| `health.integration.test.ts` | 1 | Health endpoint returns 200 |
| `exercises.integration.test.ts` | 5 | CRUD operations, validation, 404 handling |

**Total: 10 tests across 3 files**

### What's NOT Tested

| Category | Count | Files |
|----------|-------|-------|
| Handlers | 9 | exercises, workouts, workoutSets, plans, mesocycles, stretchSessions, meditationSessions, calendar, health |
| Services | 7 | workout, workout-set, progression, dynamic-progression, mesocycle, plan-modification, calendar |
| Repositories | 10 | All repositories |
| Middleware | 5 | validate, error-handler, app-check, async-handler, strip-path-prefix |

## 2. Handler Coverage Gap

All 9 handlers have **zero tests**. Combined, they expose **49 unique endpoints**:

| Handler | Endpoints | Critical Functions |
|---------|-----------|-------------------|
| `workouts.ts` | 16 | Start/complete/skip workout, today's workout, set management |
| `plans.ts` | 13 | Plan CRUD, nested days/exercises, mesocycle sync |
| `mesocycles.ts` | 7 | Create, start (generates workouts), complete, cancel |
| `exercises.ts` | 7 | CRUD, default/custom filtering, in-use validation |
| `stretchSessions.ts` | 4 | Create, list, latest, get by ID |
| `meditationSessions.ts` | 4 | Create, list, latest, get by ID |
| `workoutSets.ts` | 3 | Log, skip, unlog |
| `calendar.ts` | 1 | Get month data with timezone handling |
| `health.ts` | 1 | Health check |

**File locations:**
- `/packages/functions/src/handlers/workouts.ts`
- `/packages/functions/src/handlers/plans.ts`
- `/packages/functions/src/handlers/mesocycles.ts`

## 3. Service Coverage Gap

All 7 services have **zero unit tests**. These contain critical business logic:

### Priority 1: Critical Business Logic

| Service | Complexity | Why Test First |
|---------|-----------|----------------|
| `dynamic-progression.service.ts` | HIGH | Core progression algorithm with 6 pathways (first_week, hit_max_reps, hit_target, hold, regress, deload) |
| `progression.service.ts` | MEDIUM | Pure functions, no dependencies - easiest to test first |
| `workout.service.ts` | HIGH | State transitions, dynamic progression application, performance tracking |

### Priority 2: Complex Operations

| Service | Complexity | Key Functions |
|---------|-----------|---------------|
| `mesocycle.service.ts` | HIGH | Generates 7 weeks × N workouts with batched writes (500 limit), progressive overload calculation |
| `plan-modification.service.ts` | VERY HIGH | Diff calculation, logged data preservation, propagation to future workouts |
| `workout-set.service.ts` | MEDIUM | Validation, auto-start, set count propagation |
| `calendar.service.ts` | MEDIUM | Timezone conversion, activity aggregation |

**File locations:**
- `/packages/functions/src/services/dynamic-progression.service.ts`
- `/packages/functions/src/services/progression.service.ts`
- `/packages/functions/src/services/workout.service.ts`

## 4. Firebase Emulator Setup

### What's Working

- **Emulators configured**: Functions (5001), Firestore (8080), Hosting (5002), UI (4000)
- **Startup scripts**: `npm run dev`, `npm run emulators:fresh`, `npm run emulators:seed`
- **Data persistence**: `--import` and `--export-on-exit` flags in `npm run dev`
- **Wait script**: `scripts/wait-for-emulator.sh` for CI readiness
- **Seed script**: `scripts/generate-seed-data.ts` generates sample data
- **App Check bypass**: Correctly disabled in emulator mode
- **Collection prefixing**: `dev_` prefix for dev environment

### Emulator Gaps

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **No CI/CD integration** | Tests not automated | Add GitHub Actions workflow |
| **No pre-generated seed data** | `seed-data/` dir missing | Run `npm run seed:generate` and commit |
| **Limited integration tests** | Only exercises API tested | Add tests for all 9 API domains |
| **No Firestore rules testing** | Security rules untested | Add rules test suite |

**Configuration file:** `/firebase.json:11-26`

## 5. Test Infrastructure Gaps

### Missing Components

| Component | Current State | What's Needed |
|-----------|--------------|---------------|
| **Mock repositories** | None | Create mock implementations for unit testing services |
| **Test fixtures** | Inline data only | Factory functions for exercises, workouts, plans, mesocycles |
| **Database isolation** | Shared emulator state | Per-test cleanup or transactional rollback |
| **Service test utilities** | None | Helpers to inject mock repos into services |
| **Handler test utilities** | None | Mock req/res, middleware chains |
| **Vitest setup file** | Missing | Global mocks, custom matchers |
| **firebase-functions-test** | Installed but unused | Leverage for offline function testing |

### Architecture Supports Testing (But Not Used)

The codebase has good patterns for testability:

**Repositories accept optional `db` parameter:**
```typescript
// /packages/functions/src/repositories/base.repository.ts:13-14
constructor(collectionName: string, db?: Firestore) {
  this.db = db ?? getFirestoreDb();
```

**Services accept `Firestore` in constructor:**
```typescript
// /packages/functions/src/services/workout.service.ts:41
constructor(db: Firestore) {
  this.workoutRepo = new WorkoutRepository(db);
```

**Progression services are pure (no deps):**
```typescript
// /packages/functions/src/services/progression.service.ts - No constructor
export function calculateTargetsForWeek(...)
```

## 6. Recommended Test Implementation Order

### Phase 1: Pure Function Unit Tests (No Mocking Needed)

1. **`progression.service.test.ts`**
   - Week 0 baseline values
   - Odd weeks add 1 rep
   - Even weeks add weight
   - Incomplete week holds targets
   - Deload calculation (85% weight, 50% volume)

2. **`dynamic-progression.service.test.ts`**
   - First week handling
   - Hit max reps → add weight
   - Hit target → increment reps
   - Hold behavior (between min/target)
   - Regression after consecutive failures
   - Best set selection logic

### Phase 2: Service Unit Tests (With Mock Repos)

3. **Create mock repository infrastructure**
   - `MockExerciseRepository`
   - `MockWorkoutRepository`
   - `MockWorkoutSetRepository`

4. **`workout.service.test.ts`**
   - State transitions (pending → in_progress → completed/skipped)
   - Dynamic progression application
   - Skip cascade to pending sets

5. **`mesocycle.service.test.ts`**
   - Single active constraint
   - Workout generation count
   - Batched write handling

### Phase 3: Integration Tests

6. **Expand integration test coverage**
   - Plans API
   - Mesocycles API
   - Workouts API
   - Calendar API

7. **Add CI/CD pipeline**
   - GitHub Actions workflow
   - Emulator startup in CI
   - Test on PR

# Open Questions

1. **Should we use firebase-functions-test or vitest mocks?** The package is installed but the existing integration tests use raw fetch. Need to decide on approach.

2. **How to handle test data isolation?** Currently tests share emulator state. Options: cleanup in afterEach, separate test project, or transactional rollback.

3. **Should progression services be tested with real Firestore or mocked?** They're pure functions but called within service context.

# References

- Vitest workspace config: `/vitest.workspace.ts`
- Integration test config: `/vitest.integration.config.ts`
- Firebase config: `/firebase.json`
- Emulator wait script: `/scripts/wait-for-emulator.sh`
- Seed data script: `/scripts/generate-seed-data.ts`
