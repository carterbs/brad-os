# Implementation Plan: E2E Tests Under 45 Seconds

## Current State
- **78 tests** across 9 files
- **~90-150 seconds** total runtime
- **`workers: 1`** - serial execution due to shared SQLite database
- **Target: <45 seconds**

## Root Causes of Slowness

| Cause | Impact | Solution |
|-------|--------|----------|
| Serial execution (`workers: 1`) | 100% of tests queued | Database sharding for parallelization |
| `complete-mesocycle-journey.spec.ts` | 5-minute timeout, 14 UI workflows | Hybrid: 3 UI + 11 API tracked |
| Database reset per test via HTTP | ~100-200ms per test overhead | Batch reset or in-memory DB |
| UI-based test setup | Slower than API calls | Convert to API setup |
| Explicit `waitForTimeout` calls | Blocking waits | Replace with proper assertions |

## Phase 1: Quick Wins (No Architecture Changes)

**Goal: Reduce from ~120s to ~50s** (may hit 45s target without parallelization)

### 1.1 Speed Up `complete-mesocycle-journey.spec.ts` with Hybrid Approach

This test is valuable because it verifies:
1. **Progression algorithm** across all 7 weeks (weights increase at week 6, deload at week 7)
2. **UI workout tracking** (logging sets, dismissing timers, completing)
3. **Full user journey** (setup → track → complete → history)

**Key insight:** Progression logic works the same via UI or API. We only need **representative UI coverage**, not all 14 workouts via UI.

**Hybrid approach:**
- **UI tracking (3 workouts):** Week 1 (baseline), Week 6 (weight increase), Week 7 (deload)
- **API tracking (11 workouts):** Weeks 2-5 and remaining workouts
- **Keep all UI:** Exercise creation, plan wizard, mesocycle start/complete, history verification

**Time savings:** ~4 minutes → ~45 seconds (11 fewer UI workout flows)

```typescript
// Modified Step 4 in complete-mesocycle-journey.spec.ts
for (let week = 1; week <= 7; week++) {
  const weekWorkouts = workoutsByWeek.get(week) ?? [];

  for (let i = 0; i < weekWorkouts.length; i++) {
    const workout = weekWorkouts[i];
    if (!workout) continue;

    // UI tracking for key weeks: 1 (baseline), 6 (weight increase), 7 (deload)
    const isKeyWeek = week === 1 || week === 6 || week === 7;
    // Only track first workout of key weeks via UI to save time
    const useUI = isKeyWeek && i === 0;

    if (useUI) {
      // Existing UI tracking - tests real user interactions
      await trackWorkout(workout.id, (week + i) % 2, api, todayPage, page);
    } else {
      // API tracking - fast, still exercises progression logic
      await api.trackWorkoutViaApi(workout.id);
    }

    // Verify workout is completed (same verification either way)
    const updated = await api.getWorkoutById(workout.id);
    expect(updated.status).toBe('completed');
  }

  await verifyWeekProgression(week, api);
}
```

**New API helper needed:**
```typescript
// e2e/helpers/api.ts
async trackWorkoutViaApi(workoutId: number): Promise<void> {
  // Start workout
  await this.request.put(`${this.apiUrl}/api/workouts/${workoutId}/start`);

  // Get workout details
  const workout = await this.getWorkoutById(workoutId);

  // Log all sets with target values
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      await this.request.put(`${this.apiUrl}/api/workout-sets/${set.id}/log`, {
        data: {
          actualWeight: set.target_weight,
          actualReps: set.target_reps,
        },
      });
    }
  }

  // Complete workout
  await this.request.put(`${this.apiUrl}/api/workouts/${workoutId}/complete`);
}
```

**What's preserved:**
- ✅ Full progression algorithm testing (all 14 workouts)
- ✅ UI workout tracking coverage (3 representative workouts)
- ✅ UI coverage for setup flows (exercises, plans, mesocycle)
- ✅ UI coverage for completion and history
- ✅ Weight increase verification at week 6
- ✅ Deload verification at week 7

### 1.2 Remove Explicit `waitForTimeout` Calls

Found in `calendar.spec.ts` at lines 129, 156, 188, 213, 250:
```typescript
// BAD: Arbitrary waits
await page.waitForTimeout(1000);

// GOOD: Wait for specific conditions
await expect(page.getByTestId('calendar-day-15')).toBeVisible();
```

### 1.3 Convert UI Setup to API Setup

In `journey.spec.ts` and other files, replace UI-based plan creation:
```typescript
// SLOW: UI wizard (3 steps, multiple interactions)
await plansPage.createPlan(planConfig);

// FAST: Direct API call
await api.createPlan(planConfig);
await api.startMesocycle(planId);
```

## Phase 2: Parallelization Infrastructure

**Goal: Enable 4 workers, reduce from ~80s to ~25s**

### 2.1 Worker-Aware Database Files

Modify server to accept database path via environment variable:

```typescript
// packages/server/src/db/index.ts
const getDbPath = (): string => {
  const env = process.env.NODE_ENV ?? 'development';
  const workerId = process.env.TEST_WORKER_ID ?? '';

  const dbNames: Record<string, string> = {
    production: 'brad-os.prod.db',
    test: workerId ? `brad-os.test.${workerId}.db` : 'brad-os.test.db',
    development: 'brad-os.db',
  };

  return path.join(dataDir, dbNames[env] ?? 'brad-os.db');
};
```

### 2.2 Per-Worker Server Instances

Update Playwright config to start multiple servers:

```typescript
// e2e/playwright.config.ts
const BASE_PORT = 3200;

export default defineConfig({
  workers: 4,

  // Remove global webServer, use project-level setup
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: undefined, // Set per-worker
  },
});
```

Create worker-aware fixture:
```typescript
// e2e/helpers/fixtures.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  baseURL: async ({}, use, workerInfo) => {
    const port = 3200 + workerInfo.workerIndex;
    await use(`http://localhost:${port}`);
  },
});
```

### 2.3 Global Setup: Start Worker Servers

```typescript
// e2e/global-setup.ts
import { spawn } from 'child_process';

const WORKER_COUNT = 4;
const servers: ChildProcess[] = [];

export default async function globalSetup() {
  for (let i = 0; i < WORKER_COUNT; i++) {
    const port = 3200 + i;
    const server = spawn('npm', ['run', 'dev'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        TEST_WORKER_ID: String(i),
      },
      cwd: path.join(__dirname, '..'),
    });

    servers.push(server);
    await waitForServer(`http://localhost:${port}`);
  }

  // Store server PIDs for teardown
  process.env.SERVER_PIDS = servers.map(s => s.pid).join(',');
}
```

### 2.4 Update Test Reset for Worker Isolation

```typescript
// e2e/helpers/api.ts
export class ApiHelper {
  constructor(private request: APIRequestContext, private workerIndex: number) {
    this.apiUrl = `http://localhost:${3200 + workerIndex}`;
  }

  async resetDatabase(): Promise<void> {
    // Each worker resets its own database
    const response = await this.request.post(`${this.apiUrl}/api/test/reset`);
    if (!response.ok()) {
      throw new Error(`Failed to reset database: ${response.status()}`);
    }
  }
}
```

## Phase 3: Test Organization for Parallelism

**Goal: Maximize parallel efficiency**

### 3.1 Group Tests by Independence

```
e2e/tests/
├── parallel/           # Can run with any worker
│   ├── smoke.spec.ts          (3 tests, no DB)
│   └── meditation.spec.ts     (20 tests, localStorage only)
│
├── database/           # Need dedicated worker each
│   ├── exercises.spec.ts      (9 tests)
│   ├── plans.spec.ts          (7 tests)
│   ├── mesocycle.spec.ts      (7 tests)
│   ├── workout.spec.ts        (11 tests)
│   ├── journey.spec.ts        (4 tests)
│   └── calendar.spec.ts       (16 tests)
```

### 3.2 Configure Projects for Parallel Groups

```typescript
// e2e/playwright.config.ts
export default defineConfig({
  workers: 4,

  projects: [
    {
      name: 'parallel',
      testDir: './tests/parallel',
      // No database dependency, can share worker
    },
    {
      name: 'database',
      testDir: './tests/database',
      // Distribute across workers
    },
  ],
});
```

## Phase 4: Further Optimizations

### 4.1 In-Memory SQLite for Tests

Faster than file-based SQLite:

```typescript
// packages/server/src/db/index.ts
const getDatabase = (): Database => {
  if (process.env.NODE_ENV === 'test' && process.env.USE_MEMORY_DB) {
    return new Database(':memory:');
  }
  return new Database(getDbPath());
};
```

**Trade-off:** Database doesn't persist between server restarts, but tests reset anyway.

### 4.2 Batch Database Reset

Instead of resetting per-test, reset per-file:

```typescript
// e2e/tests/exercises.spec.ts
test.describe('Exercises', () => {
  test.beforeAll(async ({ api }) => {
    await api.resetDatabase();
  });

  // Tests that don't interfere with each other
  test('can create exercise', ...);
  test('can view exercise details', ...);
});
```

### 4.3 Shared Test Context

For tests that build on each other:

```typescript
test.describe('Workout Flow', () => {
  let workoutId: string;

  test.beforeAll(async ({ api }) => {
    await api.resetDatabase();
    const scenario = await api.setupWorkoutScenario();
    workoutId = scenario.workout.id;
  });

  test('can start workout', ...);      // Uses workoutId
  test('can log first set', ...);       // Continues from previous
  test('can complete workout', ...);    // Continues from previous
});
```

## Implementation Order

### Step 1: Quick Wins (Day 1)
1. [ ] Hybrid approach for `complete-mesocycle-journey.spec.ts` (3 UI + 11 API)
2. [ ] Add `trackWorkoutViaApi()` helper to `e2e/helpers/api.ts`
3. [ ] Replace `waitForTimeout` with proper assertions in `calendar.spec.ts`
4. [ ] Convert UI setup to API setup where possible in other tests

**Expected improvement: ~120s → ~50s**

### Step 2: Parallelization (Day 2-3)
1. [ ] Add `TEST_WORKER_ID` support to database path
2. [ ] Create global setup/teardown for multi-server
3. [ ] Update fixtures for worker-aware baseURL
4. [ ] Update API helper for worker-aware endpoints
5. [ ] Set `workers: 4` in config

**Expected improvement: ~70s → ~25s**

### Step 3: Polish (Day 4)
1. [ ] Reorganize test files into parallel/database groups
2. [ ] Convert per-test resets to per-file where safe
3. [ ] Add in-memory SQLite option

**Expected improvement: ~25s → ~20s**

## Verification

After each phase, measure with:
```bash
time npm run test:e2e
```

Success criteria:
- [ ] All 78 tests pass (or 77 if journey test removed)
- [ ] Total time < 45 seconds
- [ ] No flaky tests from parallelization

## Risks

| Risk | Mitigation |
|------|------------|
| Flaky tests from race conditions | Careful test isolation, worker-specific databases |
| Complex setup/teardown | Thorough testing of global setup |
| Port conflicts | Use high port range (3200-3210) |
| Memory usage with 4 servers | Monitor, reduce workers if needed |

## Files to Modify

1. `e2e/playwright.config.ts` - Workers, projects, server config
2. `e2e/global-setup.ts` - New file for multi-server startup
3. `e2e/global-teardown.ts` - New file for cleanup
4. `e2e/helpers/fixtures.ts` - Worker-aware fixtures
5. `e2e/helpers/api.ts` - Worker-aware API helper
6. `packages/server/src/db/index.ts` - Worker-aware database path
7. `e2e/tests/calendar.spec.ts` - Remove waitForTimeout calls
8. Various test files - Convert UI setup to API setup
