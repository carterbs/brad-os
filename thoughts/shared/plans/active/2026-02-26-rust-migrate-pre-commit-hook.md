# Rust Migration Plan: `hooks/pre-commit`

## Overview
Complete the `hooks/pre-commit` Rust migration already started on `main`, preserving hook policy behavior, scoped validation routing, timing telemetry, and error messaging.

## Current State Analysis
- `main` now includes `tools/dev-cli` with `brad-precommit` plus reusable logic in `src/precommit.rs` and `src/timing.rs`.
- Hook contains branch protection, gitleaks invocation, staged-file scope analysis, and validate dispatch: `hooks/pre-commit:149`, `hooks/pre-commit:199`.
- It emits JSONL timing metrics with mode metadata: `hooks/pre-commit:53`.
- Hook path is configured via postinstall: `package.json:61`.

## Desired End State
- `hooks/pre-commit` remains only a thin launcher to `target/release/brad-precommit`.
- Policy + routing behavior remains identical.
- Coverage >=95% target (>=90 enforced minimum).

## Key Discoveries
- Scoped routing currently covers `packages/functions/src/*` and `scripts/*` with fallback for unknown scope: `hooks/pre-commit:203`.
- Timing log schema fields must remain stable for downstream analysis: `hooks/pre-commit:72`.

## What We're NOT Doing
- No relaxation of branch protection or secret scanning requirements.

## Implementation Approach
Build on `tools/dev-cli/src/bin/precommit.rs` and shared modules; avoid creating a separate crate for hook logic.

## Phase 1: Golden-Behavior Harness
### Changes Required
- Capture current output and exit codes for: direct main commit, missing gitleaks, zero staged files, scoped validation, full fallback.
- Snapshot timing JSONL schema.

### Success Criteria
- Reproducible fixtures for every hook decision path.

### Confirmation Gate
- Approve behavior matrix.

## Phase 2: Rust Hook Engine Completion
### Changes Required
- Close any remaining parity gaps in branch gate, staged file discovery, scope routing, validate dispatch, and timing file append.
- Keep env var contracts (`ALLOW_MAIN_COMMIT`, `PRE_COMMIT_TIMING_FILE`, BRAD scoped envs).

### Success Criteria
- Rust engine passes behavior harness with parity.

### Confirmation Gate
- Dry-run hook locally across staged-file scenarios.

## Phase 3: Wrapper Wiring + Coverage
### Changes Required
- Replace `hooks/pre-commit` body with rust launcher wrapper.
- Add coverage threshold in Rust coverage gate.
- Ensure CI and local install flows still work.

### Success Criteria
- Pre-commit user experience unchanged.
- Coverage >=95% (hard fail <90%).

### Confirmation Gate
- Test real commit flows in worktree branch.

## Testing Strategy
- Unit: scope routing, test file resolution, log record serialization.
- Integration: git state and subprocess command stubbing.
- Manual: run actual `git commit` scenarios.

## References
- `hooks/pre-commit`
- `docs/conventions/workflow.md`
- `package.json`
