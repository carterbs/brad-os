# Rust Migration Plan: `scripts/qa-start.sh`

## Overview
Migrate `scripts/qa-start.sh` to Rust while preserving all behavior (session lifecycle, port allocation, simulator leasing, Firebase/OTel orchestration) and enforcing 90-100% coverage.

## Current State Analysis
- Script is a workflow engine with high branching and stateful orchestration: [`scripts/qa-start.sh:20`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:20), [`scripts/qa-start.sh:373`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:373), [`scripts/qa-start.sh:459`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:459).
- It is invoked by npm via advanced env startup: [`package.json:50`](/Users/bradcarter/Documents/Dev/brad-os/package.json:50).
- It persists a state contract consumed by other scripts: [`scripts/qa-start.sh:537`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:537), [`scripts/qa-build.sh:78`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-build.sh:78), [`scripts/qa-launch.sh:78`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-launch.sh:78), [`scripts/qa-stop.sh:100`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-stop.sh:100).
- `main` introduced reusable dev-tooling Rust modules (`tools/dev-cli/src/runner.rs`, `tools/dev-cli/src/timing.rs`) that should be reused.

## Desired End State
- A Rust binary `brad-qa-start` reproduces existing CLI flags and outputs exactly.
- `scripts/qa-start.sh` becomes a thin compatibility shim (or removed after callsite migration).
- State file format and session directory behavior remain backward-compatible.
- Line coverage for the new `qa-start` Rust module is >=95% (hard fail below 90%).

## Key Discoveries
- Simulator lock ownership semantics and cleanup-on-error are central invariants: [`scripts/qa-start.sh:39`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:39), [`scripts/qa-start.sh:193`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:193).
- Dynamic Firebase config generation currently embeds Node inline; this can be replaced with typed JSON manipulation in Rust: [`scripts/qa-start.sh:383`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:383).
- Process startup and readiness polling must preserve timeout behavior/log tails: [`scripts/qa-start.sh:491`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:491), [`scripts/qa-start.sh:518`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:518).

## What We're NOT Doing
- No behavioral redesign of isolated QA architecture.
- No changes to iOS app or Firebase function logic.
- No protocol/schema changes to `state.env`.

## Implementation Approach
Implement `qa-start` as a dedicated binary target, preferably under `tools/dev-cli`, reusing shared runner/timing helpers and adding focused modules (`args`, `ports`, `simulator`, `firebase`, `otel`, `state`).

## Phase 1: Binary Skeleton + Contract Tests
### Changes Required
- Add a new Rust binary target for `qa-start` (prefer `tools/dev-cli/src/bin/qa_start.rs`; separate crate only if coupling becomes excessive).
- Add golden contract tests for current `state.env` fields and summary output.
- Capture baseline behavior fixtures from current shell script.

### Success Criteria
- `cargo test` for the `qa-start` binary target passes with parser/state unit tests.
- Contract tests cover all CLI options from [`scripts/qa-start.sh:25`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh:25).

### Confirmation Gate
- Approve fixture format and compatibility assertions before orchestration port.

## Phase 2: Orchestration Port (Feature Parity)
### Changes Required
- Implement lock acquisition, simulator selection, port hashing, Firebase config generation, process spawn/wait, and state write.
- Preserve log wording where external automation may depend on it.

### Success Criteria
- Integration tests validate success path, timeout failure, stale lock behavior, and crash cleanup parity.
- Script parity verified by running old/new commands against same temp harness.

### Confirmation Gate
- Manual parity run with `npm run advanced:qa:env:start -- --id parity-check`.

## Phase 3: Runtime Wiring + Compatibility Shim
### Changes Required
- Replace npm invocation with Rust binary (direct or via thin shell wrapper).
- Keep `scripts/qa-start.sh` delegating to Rust during transition.
- Update docs referencing advanced QA env startup.

### Success Criteria
- Existing command `npm run advanced:qa:env:start -- --id <id>` remains unchanged for users.
- Downstream scripts (`qa-build`, `qa-launch`, `qa-stop`) consume emitted `state.env` without change.

### Confirmation Gate
- End-to-end `npm run qa:start -- --id rust-qa-start` passes.

## Phase 4: Coverage Gate + Hardening
### Changes Required
- Add per-binary/module threshold in Rust coverage gate infrastructure (>=95 target, >=90 hard minimum).
- Add failure-path tests: `firebase` spawn fail, health timeout, simulator unavailability.

### Success Criteria
- Coverage report for `qa-start` Rust code >=95% lines; CI fails under threshold.
- No regressions in QA loop docs and workflows.

### Confirmation Gate
- `npm run validate` includes and passes Rust coverage checks.

## Testing Strategy
- Unit: argument parsing, sanitizer, port allocation, state serialization.
- Integration: process orchestration with stub binaries and temp FS.
- Manual: run full isolated QA loop and verify state/log side effects.
- Coverage: enforce module/binary line coverage in 90-100% band, with default target 95%.

## References
- [`scripts/qa-start.sh`](/Users/bradcarter/Documents/Dev/brad-os/scripts/qa-start.sh)
- [`docs/guides/isolated-qa-loop.md`](/Users/bradcarter/Documents/Dev/brad-os/docs/guides/isolated-qa-loop.md)
- [`package.json`](/Users/bradcarter/Documents/Dev/brad-os/package.json)
