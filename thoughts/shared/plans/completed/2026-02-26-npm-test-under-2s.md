# NPM Test Runtime Optimization Plan (Target: <2s)

## Overview
Bring the full `npm run test` suite under 2 seconds for local developer feedback without reducing regression coverage.

## Current State Analysis
- `npm run test` currently runs `vitest run` (`package.json:19`).
- Vitest workspace includes all functions tests and all script tests (`vitest.workspace.ts:3-25`), which currently resolves to 83 test files / 1934 tests.
- Current runtime baseline (Feb 26, 2026, local):
  - `/usr/bin/time -lp npm run test`: `real 7.47s`, `real 7.29s` on back-to-back runs.
  - Vitest summary: `Duration 6.96s (transform 2.74s, setup 875ms, collect 8.60s, tests 17.13s, prepare 6.37s)`.
- Hot files from JSON profiling:
  - `packages/functions/src/services/mealplan-critique.service.test.ts` ~4019ms
  - `packages/functions/src/services/today-coach.service.test.ts` ~4007ms
  - `packages/functions/src/handlers/cycling.test.ts` ~2167ms
  - `scripts/doctor.test.ts` ~1835ms
  - `packages/functions/src/handlers/strava-webhook.test.ts` ~864ms
- A focused run of those 5 files alone is still `4.38s` (101 tests), so they dominate wall-clock.

## Desired End State
- `npm run test` completes in `<2.0s` on a warm local run.
- `npm run test` still executes the same broad regression scope.

## Key Discoveries
- Real sleep/backoff is used in production services and exercised in unit tests:
  - `BASE_DELAY_MS = 1000` + exponential retries in:
    - `packages/functions/src/services/mealplan-critique.service.ts:10-12, 142-187`
    - `packages/functions/src/services/today-coach.service.ts:25-27, 400-444`
  - Corresponding tests intentionally trigger retry paths:
    - `packages/functions/src/services/mealplan-critique.service.test.ts:101-112`
    - `packages/functions/src/services/today-coach.service.test.ts:414-426`
- `cycling` handler includes an explicit 1-second delay per backfill iteration:
  - `packages/functions/src/handlers/cycling.ts:152-153`
  - Covered by `packages/functions/src/handlers/cycling.test.ts:715-822`
- Webhook tests explicitly wait with real timers multiple times:
  - `packages/functions/src/handlers/strava-webhook.test.ts:161,228,253,315,386,420,447`
- `doctor` tests spawn shell processes repeatedly (`execSync` per test):
  - `scripts/doctor.test.ts:10-29`, invoked in `:32-33, :40, :46, :57, :63, :71`
- TypeScript transform is meaningful but not dominant alone:
  - Transform ≈2.74s of a 6.96s run, while retry waits and process/timer overhead are currently bigger blockers.

## What We’re NOT Doing
- Not reducing correctness coverage in CI.
- Not rewriting the entire test suite or changing feature behavior semantics.
- Not adopting new transpiler/toolchain (`tsgo`/alternative) before removing obvious wait/process bottlenecks.

## Implementation Approach
1) eliminate deterministic time sinks in tests,
2) improve transform cost where it materially helps wall-clock time.

## Implementation Phases

### Phase 1: Remove Artificial Time Sinks in Existing Tests
Overview:
Replace real waiting/process overhead in unit tests with deterministic, non-wall-clock mechanisms.

Changes required:
- Retry tests (`mealplan-critique`, `today-coach`):
  - Use fake timers (`vi.useFakeTimers`) and timer advancement, or injectable `sleep` strategy only in tests.
  - Files:
    - `packages/functions/src/services/mealplan-critique.service.test.ts`
    - `packages/functions/src/services/today-coach.service.test.ts`
    - (optional seam) `packages/functions/src/services/mealplan-critique.service.ts`
    - (optional seam) `packages/functions/src/services/today-coach.service.ts`
- Cycling backfill tests:
  - Decouple rate-limit delay from handler logic (inject delay fn or configurable delay constant) and set to `0` in tests.
  - Files:
    - `packages/functions/src/handlers/cycling.ts`
    - `packages/functions/src/handlers/cycling.test.ts`
- Strava webhook tests:
  - Remove fixed `setTimeout` waits; await deterministic completion signal (e.g., exported processing promise/hook).
  - Files:
    - `packages/functions/src/handlers/strava-webhook.ts`
    - `packages/functions/src/handlers/strava-webhook.test.ts`
- Doctor tests:
  - Reduce repeated shell invocations by grouping assertions per invocation or caching run output in `beforeAll`.
  - Files:
    - `scripts/doctor.test.ts`

Success criteria:
- Top 5 hot files collectively run in <=1.5s.
- No hard-coded sleep waits remain in unit tests unless explicitly marked slow.

Confirmation gate:
- Re-profile with JSON reporter and confirm each previously hot file improves >=60%.

### Phase 2: Optional Transpiler Experiment (tsgo or Alternative)
Overview:
Evaluate toolchain changes only after Phase 1, because current evidence shows larger wins elsewhere.

Changes required:
- Benchmark matrix: default Vitest transform vs alternative transpilation path.
- Ensure compatibility with existing mocks, ESM, and workspace test layout.

Success criteria:
- Net `npm run test` gain >=200ms with no instability.

Confirmation gate:
- Keep only if benchmark and reliability criteria are both met.

## Testing Strategy
- Automated:
  - `npm run test` x3 warm runs, record median.
  - `npm run validate` to ensure quality pipeline integrity.
- Manual:
  - Verify retry-related tests still validate retry semantics (attempt counts) without wall-clock waits.
  - Verify webhook/cycling behavior unchanged under normal runtime settings.

## References
- `package.json:19`
- `vitest.workspace.ts:3-25`
- `vitest.config.ts:3-13`
- `scripts/validate.sh:33`
- `packages/functions/src/services/mealplan-critique.service.ts:10-12,142-187`
- `packages/functions/src/services/today-coach.service.ts:25-27,400-444`
- `packages/functions/src/handlers/cycling.ts:152-153`
- `packages/functions/src/handlers/strava-webhook.test.ts:161,228,253,315,386,420,447`
- `scripts/doctor.test.ts:10-29,32-33,40,46,57,63,71`
