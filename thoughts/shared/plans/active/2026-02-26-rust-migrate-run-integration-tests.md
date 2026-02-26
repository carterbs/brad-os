# Rust Migration Plan: `scripts/run-integration-tests.sh`

## Overview
Migrate `scripts/run-integration-tests.sh` to Rust while preserving emulator lifecycle orchestration, readiness waiting, cleanup guarantees, and final exit semantics.

## Current State Analysis
- Script handles lifecycle with trap-based cleanup and process-group kill logic: `scripts/run-integration-tests.sh:23`, `scripts/run-integration-tests.sh:47`.
- It delegates readiness to `wait-for-emulator.sh`: `scripts/run-integration-tests.sh:58`.
- Invoked by npm script `test:integration:emulator`: `package.json:34`.
- `main` now has reusable Rust subprocess/timing patterns in `tools/dev-cli`.

## Desired End State
- A Rust binary `brad-run-integration-tests` (preferably in `tools/dev-cli`) owns full orchestration and embeds readiness wait internally.
- Existing npm command remains unchanged from user perspective.
- Coverage >=95% target (>=90 enforced minimum).

## Key Discoveries
- Cleanup must run on all exits, including failures and interrupts.
- Current behavior prefers clean shutdown and still reports test exit code.

## What We're NOT Doing
- No changes to underlying vitest integration config.

## Implementation Approach
Build a Rust orchestration binary with signal handling and deterministic subprocess lifecycle tests, reusing shared command-runner helpers from `tools/dev-cli`.

## Phase 1: Contract Lock-In
### Changes Required
- Define expected behavior for build failure, emulator start failure, wait timeout, test failure, and success.
- Add fixtures for expected final status lines.

### Success Criteria
- All lifecycle branches are represented in tests.

### Confirmation Gate
- Approve compatibility suite.

## Phase 2: Rust Orchestrator
### Changes Required
- Implement build step, emulator spawn, health wait, test run, guaranteed cleanup.
- Replace external wait script dependency.

### Success Criteria
- Exit code parity with shell implementation in all branches.

### Confirmation Gate
- Run synthetic integration harness with forced failures.

## Phase 3: Wiring + Coverage
### Changes Required
- Update `package.json` entrypoint to Rust binary.
- Retain shell wrapper for transitional compatibility if needed.
- Add coverage threshold to global Rust gate.

### Success Criteria
- `npm run test:integration:emulator` behavior unchanged.
- Coverage >=95% (hard fail <90%).

### Confirmation Gate
- Manual local run with emulators and integration tests.

## Testing Strategy
- Unit: args/options and exit-code mapping.
- Integration: child-process management with signal simulation.
- Manual: end-to-end emulator-backed integration run.

## References
- `scripts/run-integration-tests.sh`
- `scripts/wait-for-emulator.sh`
- `package.json`
