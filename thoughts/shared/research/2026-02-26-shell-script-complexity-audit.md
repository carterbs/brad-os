---
date: 2026-02-26
researcher: codex
git_commit: 90edd91
branch: rust-arch-lint
topic: shell-script complexity audit (trivial vs substantial)
tags: [shell, scripts, complexity, maintenance]
status: complete
---

# Research Question

Which shell scripts in this repository are trivial wrappers versus substantial orchestration logic, using script complexity as the primary lens?

# Summary

I audited all repository shell scripts discovered via extension (`scripts/*.sh`) and shebang detection (`#!/bin/bash`, `#!/usr/bin/env bash`), including `hooks/pre-commit` and `scripts/arch-lint`.

To reduce subjectivity, I computed a lightweight cyclomatic-style estimate per file:

`CC_estimate = 1 + if/elif + loops (for/while/until/select) + case + &&/||`

This is not a formal shell McCabe tool, but it is useful for relative ranking. I combined this with behavioral review: wrappers that mostly defer to one tool are classified as trivial; scripts with state management, retries, traps, process lifecycle, locks, or multi-step orchestration are classified as substantial.

# Detailed Findings

## Classification Rules Applied

- **Trivial**: primarily argument handling + calling one/few binaries; little internal decision logic; no durable state/process orchestration.
- **Substantial**: significant internal control flow and branching, process management, lock/state files, dynamic routing, or multi-stage orchestration.

## Trivial Scripts

- `scripts/deploy-functions.sh` (CC 1): direct build + deploy wrapper.
- `scripts/start-emulators.sh` (CC 4): argument switch around `firebase emulators:start`.
- `scripts/wait-for-emulator.sh` (CC 4): single polling loop utility.
- `scripts/arch-lint` (CC 6): thin wrapper that conditionally builds then `exec`s Rust binary.
- `scripts/qa-build.sh` (CC 9): mostly input parsing + single build invocation.
- `scripts/qa-launch.sh` (CC 9): mostly input parsing + app install/launch.
- `scripts/qa-sweep.sh` (CC 5): linear wrapper calling other QA scripts.

## Substantial Scripts

- `scripts/qa-start.sh` (CC 84): full orchestration system (session state, lock acquisition, simulator leasing, dynamic port assignment, generated config, async process startup, health checks, and persisted state contract).
- `hooks/pre-commit` (CC 37): policy + security + dynamic scoped validation routing + telemetry logging.
- `scripts/qa-stop.sh` (CC 35): teardown orchestration (PID lifecycle, process-group kill fallbacks, port sweeps, simulator env cleanup, lock release paths).
- `scripts/validate.sh` (CC 25): parallelized quality pipeline with dynamic test scoping inputs and result collation.
- `scripts/doctor.sh` (CC 16): reusable checks, version gating, setup validation, issue aggregation and remediation output.
- `scripts/setup-ios-testing.sh` (CC 13): multi-step environment bootstrap with prerequisite checks, simulator state handling, optional build path.
- `scripts/run-integration-tests.sh` (CC 9): trap-based lifecycle orchestration with background emulator process group handling and cleanup guarantees.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `scripts/qa-start.sh` | 20-576 | Session orchestration entrypoint, helper functions, process start/wait, simulator lease/state persistence |
| `hooks/pre-commit` | 20-264 | Timing instrumentation, staged file routing, scoped/full validate mode selection |
| `scripts/qa-stop.sh` | 62-142 | PID/port teardown and simulator lock release logic |
| `scripts/validate.sh` | 54-127 | Parallel check execution and status aggregation |
| `scripts/doctor.sh` | 29-122 | Tool/setup checks and issue report synthesis |
| `scripts/setup-ios-testing.sh` | 45-111 | iOS prerequisite + simulator + build bootstrap flow |
| `scripts/run-integration-tests.sh` | 23-80 | Trap cleanup and emulator lifecycle around tests |
| `scripts/deploy-functions.sh` | 7-15 | Build + deploy wrapper |
| `scripts/start-emulators.sh` | 24-46 | mode switch around emulator startup |
| `scripts/wait-for-emulator.sh` | 23-42 | readiness polling loop |
| `scripts/arch-lint` | 7-14 | build-if-stale then exec binary |
| `scripts/qa-build.sh` | 26-95 | arg parse + state load + xcode build |
| `scripts/qa-launch.sh` | 26-97 | arg parse + state load + install/launch |
| `scripts/qa-sweep.sh` | 27-88 | wrapper that chains QA scripts |

# Architecture Insights

- The repo has two shell strata:
  - Thin command wrappers (safe to keep in shell).
  - Embedded workflow engines (`qa-start`, `qa-stop`, `pre-commit`, `validate`) where complexity grows quickly and behavior is stateful.
- Complexity concentrates in scripts that coordinate long-running processes and cross-tool state contracts; these are the best refactor targets.

# Historical Context

- Not deeply investigated in commit history for this pass.
- Current branch and commit snapshot captured in metadata for reproducibility.

# Open Questions

- Should `scripts/qa-start.sh` and `scripts/qa-stop.sh` be migrated to a typed runtime (`tsx`/TypeScript) while leaving small wrappers in shell?
- Should `hooks/pre-commit` keep routing logic in shell, or delegate decisions to a typed helper to reduce branching risk?
- Is there appetite to enforce a shell complexity threshold (e.g., fail lint when `CC_estimate > 15` outside approved files)?
