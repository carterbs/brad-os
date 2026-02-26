# Rust Migration Plan: `scripts/validate.sh`

## Overview
Complete the `scripts/validate.sh` Rust migration already started on `main`, preserving parallel check execution, scoped Vitest routing inputs, log file contracts, and summary output behavior.

## Current State Analysis
- `main` now includes `tools/dev-cli` with `brad-validate` and shared modules (`runner`, `reporter`, `timing`).
- Script builds dynamic test arguments and launches checks in parallel: `scripts/validate.sh:30`, `scripts/validate.sh:94`.
- It writes status artifacts consumed in-process and exposes `.validate/*.log` as the debugging contract: `scripts/validate.sh:46`, `scripts/validate.sh:91`.
- Invoked directly by npm and by pre-commit hook: `package.json:36`, `hooks/pre-commit:188`.

## Desired End State
- `brad-validate` in `tools/dev-cli` is the single source of truth for validation orchestration.
- `scripts/validate.sh` remains only as a thin compatibility shim (or is removed after full cutover).
- Pre-commit integration remains unchanged.
- Coverage >=95% target (>=90 enforced minimum).

## Key Discoveries
- `--quick` and env-provided newline lists are critical behavior contracts: `scripts/validate.sh:19`, `scripts/validate.sh:38`.
- Architecture lint currently shells through `scripts/arch-lint`: `scripts/validate.sh:87`.

## What We're NOT Doing
- No change to which checks run by default.
- No change to `.validate` output location.

## Implementation Approach
Build on `tools/dev-cli/src/bin/validate.rs` and shared helpers (`runner`, `reporter`) instead of creating a new crate.

## Phase 1: Gap Analysis Against `main` Implementation
### Changes Required
- Diff `scripts/validate.sh` legacy behavior against `tools/dev-cli/src/bin/validate.rs`.
- Add parity fixtures for any missing edge cases (ordering, logs, targeted env handling).

### Success Criteria
- Tests cover quick/full modes and targeted test env variables.

### Confirmation Gate
- Approve parity outputs.

## Phase 2: Rust Engine Completion
### Changes Required
- Fill parity gaps in `tools/dev-cli/src/bin/validate.rs`.
- Reuse and extend `tools/dev-cli/src/runner.rs` and `tools/dev-cli/src/reporter.rs` where needed.

### Success Criteria
- Replacement command returns same exit codes and log file side effects as shell version.

### Confirmation Gate
- Validate against failing and passing synthetic cases.

## Phase 3: Wiring + Hook Compatibility
### Changes Required
- Keep `package.json` command stable and ensure shim delegates to `target/release/brad-validate`.
- Confirm `hooks/pre-commit` targeted and fallback paths still pass env lists correctly through Rust path.

### Success Criteria
- Pre-commit scoped validation path works unchanged.

### Confirmation Gate
- Manual commit simulation with staged files in `packages/functions/src` and `scripts/`.

## Phase 4: Coverage + Reliability Hardening
### Changes Required
- Add threshold to global Rust coverage gate.
- Add tests for partial failure, interrupted process, and malformed env lists.

### Success Criteria
- Coverage >=95% (hard fail <90%).
- `npm run validate` remains authoritative and deterministic.

### Confirmation Gate
- CI green with new Rust binary.

## Testing Strategy
- Unit: arg parser, env newline parsing, summary formatter.
- Integration: subprocess orchestration, parallel job handling, log/status generation.
- Manual: run `npm run validate` and inspect `.validate` artifacts.

## References
- `scripts/validate.sh`
- `hooks/pre-commit`
- `package.json`
