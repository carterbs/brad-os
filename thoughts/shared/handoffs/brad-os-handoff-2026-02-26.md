# Brad OS Handoff - 2026-02-26

## 1. Overview
- **Project/Task Name**: `npm run test` runtime optimization (target: `<2s`)
- **Status**: In Progress - Phase 1 checkpoint committed; focus shifting to smarter pre-commit validation
- **Primary Goal**: Improve local pre-commit developer loop by running targeted validation/tests based on changed files, while keeping full-suite coverage in CI
- **Owner**: Brad / next Codex session

## 2. Context & Decisions
- **Problem Statement**: `npm run test` was too slow for tight iteration loops.
- **Key Decisions**:
  - Prioritized removing deterministic time sinks (timers, waits, repeated shell invocations) before transpiler/toolchain changes.
  - Kept runtime behavior intact in production paths while making test execution deterministic/faster.
  - Kept `isolate` default for now; major remaining costs are likely in collect/prepare overhead patterns.
  - Next optimization focus is pre-commit scoping: avoid running unrelated tests (especially `scripts/ralph`) when untouched, with full validation still enforced in CI.
- **Assumptions**:
  - Existing CI coverage scope remains unchanged (`npm run validate` and integration in CI).
  - Pre-commit can be narrower than CI if selection rules are deterministic and conservative.
  - Speed work must not rely on skipping tests.
- **Dependencies**:
  - Vitest workspace config in `/Users/bradcarter/Documents/Dev/brad-os/vitest.workspace.ts`
  - Active optimization plan in `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/active/2026-02-26-npm-test-under-2s.md`
- **Constraints**:
  - Must keep `npm run validate` green.
  - Avoid introducing flakiness while tuning parallelism/isolation.

## 3. Current State
- **Completed Items**:
  - Commit created: `39cee19` (`Speed up Vitest suite with timer/mocking and worker tuning`).
  - Phase 1 changes merged into that commit:
    - Fake timers for retry-heavy tests.
    - Deterministic webhook processing wait helper.
    - Test-time cycling delay bypass.
    - Global logger silencing in test setup.
    - `doctor` fast mode + cached invocations in tests.
    - Worker cap tuning in Vitest workspace (`maxWorkers: 12`).
- **In-Progress Work**:
  - No active code edits currently.
- **Blockers**:
  - None hard; next gains require broader test-structure refactors.
- **Outstanding Questions**:
  - Whether `isolate: false` becomes viable once reset/re-import-heavy tests are refactored.

## 4. Technical Details
- **File Locations**:
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/services/mealplan-critique.service.test.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/services/today-coach.service.test.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/handlers/cycling.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/handlers/strava-webhook.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/handlers/strava-webhook.test.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/__tests__/vitest.setup.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/scripts/doctor.sh`
  - `/Users/bradcarter/Documents/Dev/brad-os/scripts/doctor.test.ts`
  - `/Users/bradcarter/Documents/Dev/brad-os/vitest.workspace.ts`
- **Architecture Decisions**:
  - Speedups favored deterministic control (fake timers, completion hooks) over wall-clock waiting.
  - Test-only fast path used for doctor script version probing (`BRAD_DOCTOR_FAST=1` in tests).
- **Testing Requirements**:
  - Benchmark with warm repeated `npm run test` runs.
  - Validate suite stability, not just best-case single-run speed.
- **Environment/Setup**:
  - Worktree has untracked `/Users/bradcarter/Documents/Dev/brad-os/.claude/worktrees/` (ignore for this track).

## 5. Next Steps
- [ ] **Design and implement smarter pre-commit validation scoping in `hooks/pre-commit` / validate path.**
  - Expected outcome: pre-commit runs only relevant tests/checks for changed files (for example, skip `scripts/ralph` tests unless files under `scripts/ralph/` change).
  - Success criteria: materially faster pre-commit loop with deterministic file-to-test mapping and no skipped coverage in CI.
- [ ] **Define conservative file-change routing rules and fallback behavior.**
  - Expected outcome: predictable behavior for mixed/unknown changes (fallback to broader test run when mapping is unclear).
  - Success criteria: documented routing table and safe fallback to full `npm run validate` semantics when needed.
- [ ] **Continue runtime reduction path by refactoring `scripts/ralph` tests away from repeated `vi.resetModules()` + dynamic imports.**
  - Expected outcome: reduce `collect`/`prepare` overhead from module reloading churn.
  - Success criteria: measurable drop in scripts project runtime and aggregate collect/prepare timing.
- [ ] **Refactor repository tests similarly, then re-evaluate `isolate: false`.**
  - Expected outcome: unlock potential 2x-ish class gains from shared module cache (if stable).
  - Success criteria: no cross-test contamination; stable 3x run pass; lower wall time than current baseline.
- [ ] **Re-run timing breakdown after the refactors to confirm `collect`/`prepare` reductions.**
  - Expected outcome: evidence-backed attribution of remaining bottlenecks.
  - Success criteria: updated timing snapshot recorded in plan/handoff notes.

## 6. References
- **Plan**: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/active/2026-02-26-npm-test-under-2s.md`
- **Checkpoint Commit**: `39cee19`
- **Latest observed timing snapshot**:
  - `Duration 3.46s (transform 2.52s, setup 1.10s, collect 9.08s, tests 4.74s, environment 10ms, prepare 6.53s)`
  - `real 4.02`
