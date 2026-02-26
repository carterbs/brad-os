# Rust Migration Plan: `scripts/qa-stop.sh`

## Overview
Migrate `scripts/qa-stop.sh` to Rust so teardown semantics (PID termination, port cleanup, simulator env unsets, lease release) are preserved with strong automated coverage.

## Current State Analysis
- Script coordinates multi-path teardown and lock cleanup: `scripts/qa-stop.sh:62`, `scripts/qa-stop.sh:109`, `scripts/qa-stop.sh:132`.
- Invoked by npm aliases: `package.json:52`, `package.json:53`.
- Consumes state written by `qa-start`: `scripts/qa-stop.sh:98`.
- `main` introduced reusable Rust process/timing helpers in `tools/dev-cli` that should be reused for teardown orchestration.

## Desired End State
- A Rust binary `brad-qa-stop` handles all cleanup logic.
- Existing CLI surface remains unchanged.
- Lock release and simulator cleanup behavior remain backward-compatible.
- Coverage >=95% target (>=90 enforced minimum).

## Key Discoveries
- PID stop path has important fallback order (`kill -- -pid`, `kill pid`, then `kill -9`): `scripts/qa-stop.sh:79`.
- Two lock directories may need cleanup (`SIMULATOR_LOCK_DIR` and scan of `device-locks/*.lock`): `scripts/qa-stop.sh:126`, `scripts/qa-stop.sh:133`.

## What We're NOT Doing
- No redesign of QA session model.
- No changes to state file schema.

## Implementation Approach
Implement `qa-stop` as a Rust binary target (prefer `tools/dev-cli`) with modules for `state`, `process_kill`, `ports`, `simulator`, and `locks`, reusing shared subprocess helpers where possible.

## Phase 1: Contract Capture
### Changes Required
- Create exhaustive test matrix for state-present and state-missing paths.
- Snapshot expected messages and exit behavior.

### Success Criteria
- Tests encode all CLI flags in `scripts/qa-stop.sh:16`.

### Confirmation Gate
- Approve parity fixtures.

## Phase 2: Rust Port
### Changes Required
- Implement stop logic for PID files, port listeners, simulator env cleanup, and lock release.

### Success Criteria
- Integration tests pass for running, stale, empty, and missing PID file variants.

### Confirmation Gate
- Manual run against active QA session validates teardown.

## Phase 3: Wiring + Coverage Gate
### Changes Required
- Switch npm command to Rust binary with optional compatibility shell shim.
- Add coverage threshold entry in global Rust coverage gate.

### Success Criteria
- `npm run qa:stop -- --id <id>` behavior unchanged.
- Coverage >=95% (hard fail <90%).

### Confirmation Gate
- Execute `qa:start` then `qa:stop` e2e and verify lock directory cleanup.

## Testing Strategy
- Unit: id sanitization, pid parsing, lock owner matching.
- Integration: process kill fallback ordering, lock cleanup scenarios.
- Manual: run with and without `--shutdown-simulator`.

## References
- `scripts/qa-stop.sh`
- `scripts/qa-start.sh`
- `package.json`
