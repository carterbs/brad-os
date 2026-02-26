# Rust Migration Plan: `scripts/setup-ios-testing.sh`

## Overview
Migrate `scripts/setup-ios-testing.sh` to Rust while preserving iOS prerequisite checks, simulator boot behavior, optional build, and operator guidance output.

## Current State Analysis
- Script orchestrates prerequisite checks, xcodegen, simulator boot detection, and optional build: `scripts/setup-ios-testing.sh:45`, `scripts/setup-ios-testing.sh:87`.
- Script is documented for setup workflows: `scripts/setup-ios-testing.sh:8`.
- It has no npm entrypoint today; likely invoked manually/docs.
- `main` now has shared Rust dev-tooling infrastructure in `tools/dev-cli` that can host additional binaries.

## Desired End State
- A Rust binary `brad-setup-ios-testing` (preferably in `tools/dev-cli`) matches command options and behavior (`--skip-build`).
- Existing documentation points to Rust-backed command path.
- Coverage >=90% minimum, target >=95%.

## Key Discoveries
- Simulator behavior branches on any already-booted device and otherwise boots named target: `scripts/setup-ios-testing.sh:77`.
- Build path surfaces only last log lines (`tail -5`) before success: `scripts/setup-ios-testing.sh:99`.

## What We're NOT Doing
- No changes to iOS build flags or simulator default name unless needed for parity.

## Implementation Approach
Create a Rust CLI binary with command runner abstraction and injectable outputs for deterministic tests, reusing shared dev-cli subprocess helpers where practical.

## Phase 1: Baseline and Test Harness
### Changes Required
- Capture expected stdout/stderr patterns for success/failure paths.
- Create integration harness with command stubs for `xcodegen`, `xcodebuild`, `xcrun`.

### Success Criteria
- Test matrix includes `--skip-build`, missing tools, simulator already booted, simulator boot failure.

### Confirmation Gate
- Approve output compatibility level.

## Phase 2: Rust Port + Wiring
### Changes Required
- Implement prerequisite, generation, simulator, and optional build steps.
- Add npm alias for discoverability (optional) while preserving documented invocation path.

### Success Criteria
- New command passes parity tests and manual run on macOS host.

### Confirmation Gate
- Update iOS setup docs after successful local verification.

## Phase 3: Coverage and Stabilization
### Changes Required
- Enforce per-binary/module coverage threshold in global Rust coverage script.
- Add regression tests for command invocation ordering.

### Success Criteria
- Coverage >=95% target (hard fail <90%).

### Confirmation Gate
- Execute full setup command in real environment.

## Testing Strategy
- Unit: option parsing, step toggles.
- Integration: command presence and failure-path orchestration.
- Manual: real run on developer machine.

## References
- `scripts/setup-ios-testing.sh`
- `docs/guides/ios-build-and-run.md`
