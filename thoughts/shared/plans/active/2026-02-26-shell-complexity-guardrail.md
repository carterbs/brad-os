# Architecture Lint Plan: Shell Script Complexity Guardrail

## Overview
Add a new architecture-lint check to prevent shell scripts from accumulating substantial orchestration complexity again.

## Current State Analysis
- Architecture lint Rust crate is the correct enforcement home: `tools/arch-lint/src/main.rs:36`, `tools/arch-lint/src/checks/mod.rs:1`.
- Current validate pipeline already runs `arch-lint`: `scripts/validate.sh:87`.
- `main` has already moved `validate`/`pre-commit` logic into Rust (`tools/dev-cli`), with shell files now acting as delegation shims.
- Remaining shell complexity hotspots are primarily `qa-start` and `qa-stop`.

## Desired End State
- New check `shell_complexity` fails on scripts exceeding policy thresholds unless explicitly allowlisted.
- Check reports actionable file-level metrics (lines, branches, loops, estimated cyclomatic score).
- Check itself has >=95% coverage.

## Key Discoveries
- `arch-lint` currently has minimal test footprint, so this check should ship with comprehensive tests and become the quality bar template.

## What We're NOT Doing
- No brittle parsing of every shell grammar feature; use clear, deterministic heuristic scoring.

## Implementation Approach
Implement lexical complexity scoring over shell files (`*.sh`, hook scripts with shell shebang), then enforce thresholds by path class.

## Phase 1: Policy Definition
### Changes Required
- Define thresholds (example):
  - Default scripts: `CC_estimate <= 10`.
  - Transitional allowlist for known legacy files being migrated (`qa-start`, `qa-stop`, optional `setup-ios-testing`).
- Treat shim-only scripts (Rust delegation + minimal fallback) as trivial and exempt from strict complexity limits.

### Success Criteria
- Policy documented in `docs/conventions/workflow.md`.

### Confirmation Gate
- Team sign-off on thresholds and exception process.

## Phase 2: Check Implementation in `arch-lint`
### Changes Required
- Add `tools/arch-lint/src/checks/shell_complexity.rs` and wire into `mod.rs` + `lib.rs` + `main.rs`.
- Reuse walker/config helpers for file discovery.
- Emit per-file violation guidance pointing to Rust migration plans.

### Success Criteria
- Lint fails when complexity exceeds threshold and passes on compliant scripts.

### Confirmation Gate
- Run lint against current repo with temporary allowlist expected violations.

## Phase 3: Test Coverage + Enforcement
### Changes Required
- Add unit tests for scorer tokens and edge cases.
- Add integration tests with temp files covering pass/fail/allowlist paths.
- Enforce >=95% coverage on the check module.

### Success Criteria
- New check has 90-100% coverage (target >=95%).

### Confirmation Gate
- `npm run validate` fails on intentionally complex fixture script.

## Testing Strategy
- Unit: scoring of `if`, `case`, loops, logical operators.
- Integration: repo scan behavior, shebang detection, allowlist handling.
- Manual: add synthetic complex script and verify failure message.

## References
- `tools/arch-lint/src/main.rs`
- `tools/arch-lint/src/lib.rs`
- `scripts/validate.sh`
