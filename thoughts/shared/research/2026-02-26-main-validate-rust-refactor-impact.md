---
date: 2026-02-26
researcher: codex
git_commit: 90edd91
branch: rust-arch-lint
topic: impact of main-branch validate/precommit Rust refactor on migration plans
tags: [rust, tooling, plans, validate, pre-commit]
status: complete
---

# Research Question

After the recent `main` merge that ported validate/pre-commit orchestration to Rust, what should change in the existing per-script migration plans, and which reusable modules should upcoming tasks leverage?

# Summary

`origin/main` includes commit `b986b52` (`Port pre-commit and validate orchestration to Rust`) introducing a new workspace crate, `tools/dev-cli`, with binaries `brad-validate` and `brad-precommit`. The shell entrypoints (`scripts/validate.sh`, `hooks/pre-commit`) now delegate to these Rust binaries when available and keep Bash fallback logic.

This materially changes planning assumptions: validate and pre-commit are no longer greenfield migrations. Their plans should shift to completion/hardening/cutover work, while remaining script migrations should prioritize adding one Rust binary per script under `tools/dev-cli` (or split only when coupling forces it), reusing shared modules.

# Detailed Findings

## New Rust foundation on `main`

- Workspace now includes `tools/dev-cli` in addition to `tools/arch-lint`.
- Shared modules available:
  - `tools/dev-cli/src/runner.rs` (subprocess execution/log capture/passthrough)
  - `tools/dev-cli/src/reporter.rs` (validate summary rendering)
  - `tools/dev-cli/src/timing.rs` (pre-commit timing JSONL serialization + writing)
  - `tools/dev-cli/src/precommit.rs` (routing/classification logic)
- Contract tests exist for both binaries:
  - `tools/dev-cli/tests/validate_contract.rs`
  - `tools/dev-cli/tests/precommit_contract.rs`

## Wrapper behavior now in place

- `scripts/validate.sh` now delegates to `target/release/brad-validate` via `BRAD_USE_RUST_VALIDATE` gate, then falls back to legacy Bash.
- `hooks/pre-commit` now delegates to `target/release/brad-precommit` via `BRAD_USE_RUST_PRECOMMIT` gate, then falls back to legacy Bash.

## Plan implications

- `rust-migrate-validate` should be reframed as parity-gap closure + fallback retirement strategy, not new crate creation.
- `rust-migrate-pre-commit-hook` should be reframed similarly.
- Remaining script plans should explicitly reuse `tools/dev-cli` helper modules and prefer adding dedicated binaries there.
- Shell complexity guardrail plan should treat validate/pre-commit as shim scripts and focus migration pressure on remaining orchestration scripts.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `origin/main:Cargo.toml` | 1-3 | Workspace now includes `tools/dev-cli` |
| `origin/main:tools/dev-cli/Cargo.toml` | 1-20 | Dev CLI crate with validate/precommit binaries |
| `origin/main:tools/dev-cli/src/runner.rs` | 1-180 | Shared command runner for tooling binaries |
| `origin/main:tools/dev-cli/src/reporter.rs` | 1-110 | Shared validate summary rendering |
| `origin/main:tools/dev-cli/src/timing.rs` | 1-210 | Shared pre-commit timing serialization/write |
| `origin/main:tools/dev-cli/src/bin/validate.rs` | 1-120 | Rust validate orchestration implementation |
| `origin/main:tools/dev-cli/src/bin/precommit.rs` | 1-260 | Rust pre-commit orchestration implementation |
| `origin/main:scripts/validate.sh` | 19-27 | Rust delegation shim + legacy fallback |
| `origin/main:hooks/pre-commit` | 11-19 | Rust delegation shim + legacy fallback |

# Architecture Insights

`tools/dev-cli` is now the natural integration point for all non-trivial dev tooling migrations. This reduces duplicate subprocess, formatting, and timing code and supports independent parallel work by assigning one binary per script with shared library modules.

# Historical Context

- Prior plans were authored against a baseline where validate/pre-commit were Bash-first.
- `main` has now crossed that boundary for these two scripts, so those plans needed immediate iteration.

# Open Questions

- Should future tooling binaries remain centralized in `tools/dev-cli` or split into multiple crates when ownership boundaries emerge?
- What is the exact deprecation date for Bash fallback blocks in `scripts/validate.sh` and `hooks/pre-commit`?
