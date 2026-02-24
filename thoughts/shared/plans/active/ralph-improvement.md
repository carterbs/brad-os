# Add Today Coach Integration Test to Reach Medium (4+) Backend Test Threshold

## Why

The Today domain currently has 3 backend test files (Low threshold). Adding one more reaches the Medium (4+) threshold, which is a direct input to the quality grade calculation in `scripts/update-quality-grades.ts`. The Today Coach endpoint (`POST /recommend`) is the only complex domain with 3+ tests that has **zero integration tests** — every other domain at this maturity level has integration tests. This fills a genuine testing gap while upgrading the test count.

## What

Add `packages/functions/src/__tests__/integration/today-coach.integration.test.ts` — an integration test file that hits the `devTodayCoach` function endpoint through HTTP, validating the full request pipeline.

### Endpoint Under Test

`POST http://127.0.0.1:5001/brad-os/us-central1/devTodayCoach/recommend`

The handler (`handlers/today-coach.ts`) does the following:
1. Validates the request body via `coachRecommendRequestSchema` (Zod middleware)
2. Extracts `x-user-id` header (defaults to `'default-user'`)
3. Gets recovery data from `req.body.recovery` or falls back to Firestore
4. Calls `buildTodayCoachContext()` to aggregate all domain data
5. Gets the `OPENAI_API_KEY` secret
6. Calls `getTodayCoachRecommendation()` → OpenAI API
7. Returns `{ success: true, data: recommendation }`

**Key constraint**: The Firebase emulator won't have the `OPENAI_API_KEY` secret configured. When `openaiApiKey.value()` returns empty/falsy, the handler returns `500 CONFIG_ERROR`. This is fine — the integration test validates everything UP TO the OpenAI call, which is the whole request pipeline (validation, recovery lookup, context aggregation).

### Test Cases

The integration test should include these test cases:

1. **Emulator health check** — `beforeAll` verifies the emulator is running (same pattern as all other integration tests)

2. **Returns RECOVERY_NOT_SYNCED when no recovery data exists** — `POST /recommend` with empty body `{}` and no recovery in Firestore → `400` with `RECOVERY_NOT_SYNCED`

3. **Accepts recovery in request body** — `POST /recommend` with `{ recovery: { ... valid snapshot ... } }` → Either `200` with recommendation data (if API key available) or `500 CONFIG_ERROR` (expected in emulator). Verify it gets past validation.

4. **Validates recovery snapshot — rejects invalid score** — `POST /recommend` with `{ recovery: { score: 200, ... } }` (score > 100) → `400` validation error from Zod schema

5. **Validates recovery snapshot — rejects missing required fields** — `POST /recommend` with `{ recovery: { score: 50 } }` (missing hrvMs, rhrBpm, etc.) → `400` validation error

6. **Validates recovery snapshot — rejects invalid state** — `POST /recommend` with `{ recovery: { ..., state: 'invalid' } }` → `400` validation error

7. **Accepts request with custom user ID header** — `POST /recommend` with `x-user-id: test-integration-user` and valid recovery → verifies the endpoint doesn't reject custom user IDs

8. **Accepts request with timezone offset header** — `POST /recommend` with `x-timezone-offset: -300` and valid recovery → verifies the header is accepted

### Important Behaviors to Assert

For test cases where recovery is valid (cases 3, 7, 8), the emulator won't have an OpenAI API key, so the expected behavior is:
- **If response is 200**: Validate that `response.body.success === true` and `response.body.data.dailyBriefing` exists (string). This means the function has a fallback or the emulator has the key.
- **If response is 500**: Validate that `response.body.error.code === 'CONFIG_ERROR'`. This is the expected emulator behavior — the test proves the entire pipeline up to the OpenAI call works.

The test should handle BOTH outcomes by checking the status code and branching assertions accordingly. This pattern makes the test work in both emulator (no key) and CI (key configured) environments.

## Files

### New File: `packages/functions/src/__tests__/integration/today-coach.integration.test.ts`

```typescript
/**
 * Integration Tests for Today Coach API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const TODAY_COACH_URL = `${FUNCTIONS_URL}/devTodayCoach`;

// Valid recovery snapshot matching coachRecommendRequestSchema
// (recoverySnapshotSchema without 'source' field)
const VALID_RECOVERY = {
  date: '2026-02-24',
  hrvMs: 55,
  hrvVsBaseline: 5,
  rhrBpm: 58,
  rhrVsBaseline: -2,
  sleepHours: 7.5,
  sleepEfficiency: 92,
  deepSleepPercent: 22,
  score: 75,
  state: 'ready' as const,
};

interface TodayCoachRecommendation {
  dailyBriefing: string;
  sections: Record<string, unknown>;
  warnings: unknown[];
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Today Coach API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  it('should return RECOVERY_NOT_SYNCED when no recovery data exists', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('RECOVERY_NOT_SYNCED');
  });

  it('should accept valid recovery in request body', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // In emulator without OpenAI key: 500 CONFIG_ERROR
    // With key: 200 with recommendation
    if (response.status === 200) {
      const result = (await response.json()) as ApiResponse<TodayCoachRecommendation>;
      expect(result.success).toBe(true);
      expect(typeof result.data.dailyBriefing).toBe('string');
    } else {
      expect(response.status).toBe(500);
      const result = (await response.json()) as ApiError;
      expect(result.error.code).toBe('CONFIG_ERROR');
    }
  });

  it('should reject recovery with invalid score (out of range)', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, score: 200 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject recovery with missing required fields', async () => {
    const partialRecovery = { score: 50 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: partialRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject recovery with invalid state enum', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, state: 'invalid-state' };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should accept request with custom user ID header', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'test-integration-user',
      },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // Should get past validation — either 200 or 500 CONFIG_ERROR
    expect([200, 500]).toContain(response.status);

    if (response.status === 200) {
      const result = (await response.json()) as ApiResponse<TodayCoachRecommendation>;
      expect(result.success).toBe(true);
    } else {
      const result = (await response.json()) as ApiError;
      expect(result.error.code).toBe('CONFIG_ERROR');
    }
  });

  it('should accept request with timezone offset header', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timezone-offset': '-300',
      },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // Should get past validation — either 200 or 500 CONFIG_ERROR
    expect([200, 500]).toContain(response.status);
  });

  it('should reject recovery with negative sleep hours', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, sleepHours: -1 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### No other files modified

This improvement only adds one new test file. No production code, schemas, or existing tests change.

## Tests

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | RECOVERY_NOT_SYNCED on empty body | Handler returns 400 when no recovery data in body or Firestore |
| 2 | Accepts valid recovery in body | Full pipeline works through validation → context building (200 or 500 CONFIG_ERROR) |
| 3 | Rejects invalid score (out of range) | Zod schema `coachRecommendRequestSchema` enforces `score: z.number().int().min(0).max(100)` |
| 4 | Rejects missing required fields | Zod schema requires all recovery snapshot fields |
| 5 | Rejects invalid state enum | Zod schema `recoveryStateSchema` only allows `'ready' \| 'moderate' \| 'recover'` |
| 6 | Custom user ID header accepted | `x-user-id` header flows through without breaking the pipeline |
| 7 | Timezone offset header accepted | `x-timezone-offset` header flows through without breaking the pipeline |
| 8 | Rejects negative sleep hours | Zod schema enforces `sleepHours: z.number().min(0).max(24)` |

**Expected assertion count**: ~18 `expect()` calls across 8 test cases → density ~2.3x (maintains the ≥2.0 threshold for positive grade adjustment).

## QA

### Step 1: Verify the test file is counted by the grade script

Before running anything, manually trace through `scripts/update-quality-grades.ts` logic:
- File: `__tests__/integration/today-coach.integration.test.ts`
- `parts[0]` = `__tests__`, `parts[1]` = `integration` → integration branch
- `basename` = `today-coach.integration` → `integrationName` = `today-coach`
- `HANDLER_FEATURE_MAP['today-coach']` = `'today'` ✓

Run the grade script to confirm:
```bash
npx tsx scripts/update-quality-grades.ts
```
Expected: Today domain shows `Medium (4)` instead of `Low (3)`.

### Step 2: Run full validation (unit tests)

```bash
npm run validate
```
Expected: All checks pass. The new integration test file is NOT included in the regular `npm test` run (it's in `__tests__/integration/` which is excluded from the default vitest config). It only runs via `npm run test:integration` with `vitest.integration.config.ts`.

### Step 3: Run integration tests (if emulator available)

```bash
npm run emulators:fresh &
# Wait for emulator to start
npm run test:integration
```
Expected:
- Test 1 (RECOVERY_NOT_SYNCED): PASS — 400 response
- Tests 2, 6, 7 (valid recovery): PASS — either 200 (unlikely without key) or 500 CONFIG_ERROR
- Tests 3, 4, 5, 8 (invalid recovery): PASS — 400 VALIDATION_ERROR from Zod

### Step 4: Verify quality grade impact

After the grade script runs, inspect `docs/quality-grades.md`:
- Today row should show `Medium (4)` in the Backend Tests column
- The test inventory section should list `today-coach` under the Today Integration entries
- The grade for Today should remain B (the base grade B- + density boost stays the same)

### Step 5: Self-review

```bash
git diff main --stat  # Should show exactly 1 new file
git diff main         # Review every line of the new test file
```

Verify:
- No `any` types
- All imports are explicit (`import { ... } from 'vitest'`)
- No `.only` or `.skip` test modifiers
- Every `it()` block contains at least one `expect()` call
- File follows the integration test pattern from `calendar.integration.test.ts` and `meditationSessions.integration.test.ts`

## Conventions

1. **Git Worktree Workflow** — All changes in a worktree branch, not directly on main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **Vitest not Jest** — Use `import { describe, it, expect, beforeAll } from 'vitest'` explicitly.

4. **No `any` types** — Use explicit interfaces (`ApiError`, `TodayCoachRecommendation`) for response typing.

5. **Integration test pattern** — Follow the exact structure of existing integration tests:
   - `beforeAll` with emulator health check
   - `FUNCTIONS_URL` constant at `http://127.0.0.1:5001/brad-os/us-central1`
   - Use native `fetch` (not supertest — integration tests hit the real emulator, not Express apps)
   - Import `ApiResponse` from `../utils/index.js`

6. **Test Quality Policy** — Every test case must contain `expect()` assertions. No empty bodies. Architecture linter check 19 enforces this.

7. **Handler test naming** — Integration test file named `today-coach.integration.test.ts` to match handler name `today-coach` in `HANDLER_FEATURE_MAP`.

8. **Co-locate test utilities** — Use shared `ApiResponse` type from `__tests__/utils/`. Define test-specific types (like `TodayCoachRecommendation`) inline in the test file following the pattern of other integration tests.

9. **Schema validation awareness** — The `coachRecommendRequestSchema` in `schemas/recovery.schema.ts` uses `recoverySnapshotSchema.omit({ source: true }).optional()`. The test's `VALID_RECOVERY` object intentionally omits the `source` field to match this schema.
