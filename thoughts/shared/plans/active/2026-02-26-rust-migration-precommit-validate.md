# Rust Migration Plan: `hooks/pre-commit` and `scripts/validate.sh`

## Overview
Migrate the current Bash-based pre-commit and validation orchestration to Rust while preserving all external behavior contracts used by developers, CI, and repo tooling. The migration is incremental: ship Rust binaries behind shell wrappers first, then cut over defaults after parity and stability gates pass.

## Current State Analysis
- Git hook wiring is configured in npm `postinstall` via `git config core.hooksPath hooks` ([package.json](/Users/bradcarter/Documents/Dev/brad-os/package.json:61)).
- `hooks/pre-commit` enforces:
  - main/master direct-commit gate with merge + `ALLOW_MAIN_COMMIT=1` bypass ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:152), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:156)).
  - staged secrets scan through `gitleaks protect --staged --verbose` ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:179)).
  - scoped-vs-full routing for validation and fallback behavior ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:204), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:220)).
  - timing telemetry appended to `.cache/pre-commit-timings.jsonl` ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:10), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:84)).
- `scripts/validate.sh` runs checks in parallel and emits compact summary:
  - checks: `typecheck`, `lint`, plus `test` + `architecture` unless quick mode ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:55)).
  - each check logs to `.validate/*.log`; status files are `.validate/*.status` internal artifacts ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:91), [scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:112)).
  - supports targeted tests through newline-delimited `BRAD_VALIDATE_TEST_FILES` and `BRAD_VALIDATE_TEST_PROJECTS` ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:30), [scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:38)).
- CI depends on `npm run validate` exit semantics and `.validate/*.log` artifacts, not on Bash internals ([.github/workflows/ci.yml](/Users/bradcarter/Documents/Dev/brad-os/.github/workflows/ci.yml:36), [.github/workflows/ci.yml](/Users/bradcarter/Documents/Dev/brad-os/.github/workflows/ci.yml:43)).
- Docs codify current user-facing behavior and must remain accurate ([docs/conventions/workflow.md](/Users/bradcarter/Documents/Dev/brad-os/docs/conventions/workflow.md:34), [docs/conventions/workflow.md](/Users/bradcarter/Documents/Dev/brad-os/docs/conventions/workflow.md:54)).

## Desired End State
- Two Rust CLIs replace Bash logic:
  - `brad-validate`: equivalent of `scripts/validate.sh`.
  - `brad-precommit`: equivalent of `hooks/pre-commit` orchestration.
- Existing entrypoints remain stable:
  - `npm run validate` and `npm run validate:quick` still work.
  - git hook still executes from `hooks/pre-commit` via `core.hooksPath`.
- Output contracts remain stable:
  - `.validate/*.log` preserved for CI upload and local debugging.
  - pre-commit timing JSONL preserved.
  - non-zero exit on failure preserved.
- Bash scripts become thin compatibility wrappers (or removed in final phase after explicit cutover).

## Key Discoveries
- No runtime consumer parses `.cache/pre-commit-timings.jsonl`; this is telemetry + documentation contract only ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:84), [docs/conventions/workflow.md](/Users/bradcarter/Documents/Dev/brad-os/docs/conventions/workflow.md:41)).
- `.validate/*.status` files are internal to `validate.sh`; they can be eliminated in Rust implementation if summary behavior is preserved ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:91), [scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:112)).
- `scripts/ralph` cares about validate success/failure, not exact output formatting ([scripts/ralph/index.ts](/Users/bradcarter/Documents/Dev/brad-os/scripts/ralph/index.ts:59)).
- Rust toolchain is already expected in CI for architecture lint flow, reducing adoption friction ([.github/workflows/ci.yml](/Users/bradcarter/Documents/Dev/brad-os/.github/workflows/ci.yml:28), [scripts/arch-lint](/Users/bradcarter/Documents/Dev/brad-os/scripts/arch-lint:7)).
- `validate.sh` uses `set -uo pipefail` (no `-e`) intentionally — it collects exit codes from parallel checks via `|| rc=$?` rather than bailing on first failure. The Rust implementation must replicate this collect-all-then-summarize pattern ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:1), [scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:61)).
- `validate.sh` deletes and recreates `.validate/` on every run (`rm -rf "$LOG_DIR" && mkdir -p "$LOG_DIR"`), ensuring stale logs never persist ([scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh:47-48)).
- Pre-commit hook hard-fails (exit 1) if `gitleaks` binary is not installed, separate from scan failure. Both paths emit the install hint but serve different purposes ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:174-183)).
- `VALIDATE_MODE` in timing JSONL takes one of four string values: `"full"` (initial default), `"full_no_staged"` (no staged files), `"full_fallback"` (unknown/mixed scope), `"scoped"` (targeted checks). These must be preserved exactly for telemetry compatibility ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:16), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:187), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:222), [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:251)).
- Timing JSONL fields (all must be preserved): `timestamp`, `branch`, `mode`, `staged_files`, `exit_code`, `hook_ms`, `gitleaks_ms`, `validate_ms`, `validate_status`, `targeted_test_file_count`, `targeted_test_project_count` ([hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit:72-83)).
- macOS `date +%s%N` for nanosecond timing is non-standard (requires GNU coreutils). Rust's `std::time::Instant` provides cross-platform nanosecond timing natively — this is a portability win.
- `doctor.sh` does not currently check for `cargo`/Rust toolchain despite `scripts/arch-lint` already requiring it. Adding two more Rust binaries makes this gap more important ([scripts/doctor.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/doctor.sh:86-91)).

## What We Are Not Doing
- Replacing `gitleaks` itself.
- Changing quality gates or reducing coverage (typecheck/lint/test/architecture remain).
- Changing CI workflow topology in this migration.
- Introducing a new build system for all scripts; scope is only pre-commit + validate orchestration.

## Crate Structure & Workspace

The Rust workspace (`Cargo.toml`) currently has one member: `tools/arch-lint`. Create a new crate `tools/dev-cli/` with two binary targets sharing common modules:

```toml
# tools/dev-cli/Cargo.toml
[[bin]]
name = "brad-validate"
path = "src/bin/validate.rs"

[[bin]]
name = "brad-precommit"
path = "src/bin/precommit.rs"
```

Register it in the workspace:
```toml
# Cargo.toml (root)
[workspace]
resolver = "2"
members = ["tools/arch-lint", "tools/dev-cli"]
```

Shared code (subprocess runner, timing, log writing) lives in `tools/dev-cli/src/lib.rs` and submodules. Contract tests go in `tools/dev-cli/tests/`.

### Build & Distribution Strategy

Follow the existing `scripts/arch-lint` pattern: thin shell wrappers that build-on-demand from source and exec the binary from `target/release/`. This avoids introducing a new distribution mechanism and matches what developers already have.

```bash
# scripts/brad-validate (wrapper, same pattern as scripts/arch-lint)
BINARY="$REPO_ROOT/target/release/brad-validate"
if [ ! -f "$BINARY" ] || [ stale ]; then
  cargo build -p dev-cli --release --bin brad-validate ...
fi
exec "$BINARY" "$@"
```

## Implementation Approach
Build Rust-first orchestrators with contract-first parity tests, then route existing shell entrypoints to Rust. Keep a controlled fallback path to Bash during rollout to reduce disruption.

## Phase 1: Contract Freeze and Test Harness
### Overview
Codify current behavior as executable contract tests so migration correctness is measurable.

### Changes Required
- Create the `tools/dev-cli/` crate (see "Crate Structure & Workspace" above) and add a fixture-based contract test harness under `tools/dev-cli/tests/`.
- Capture these contract cases:
  - `validate` full mode, quick mode, targeted test files/projects env parsing.
  - per-check log file creation and failure exit behavior.
  - pre-commit main/master block rules, merge-head allowance, `ALLOW_MAIN_COMMIT` override.
  - staged file scope routing and full fallback.
  - timing JSONL append semantics.
- Add golden-output snapshots for summary text structure (not strict ANSI byte-for-byte unless required).

### Success Criteria
- Contract tests pass against current behavior via shell wrappers.
- A behavior matrix document exists in the same crate (markdown) mapping each contract to a test ID.

### Confirmation Gate
Do not implement production Rust flow until all critical contracts are encoded in tests.

## Phase 2: Implement `brad-validate` in Rust
### Overview
Replace `scripts/validate.sh` logic with Rust while preserving command behavior and output/log contracts.

### Changes Required
- Create Rust binary `brad-validate` with:
  - modes: default full, `--quick`.
  - env parsing for `BRAD_VALIDATE_TEST_FILES`/`BRAD_VALIDATE_TEST_PROJECTS` newline-delimited input.
  - concurrent execution for checks with captured stdout/stderr into `.validate/<check>.log`.
  - summary printer with pass/fail lines and elapsed seconds.
  - exit code `1` when any check fails.
- Delete and recreate `.validate/` directory at start of each run (matches `rm -rf "$LOG_DIR" && mkdir -p "$LOG_DIR"` behavior).
- Keep underlying check commands unchanged initially (invoke via `std::process::Command`):
  - `npx tsc -b` → `.validate/typecheck.log`
  - `npx oxlint packages/functions/src --config .oxlintrc.json` → `.validate/lint.log`
  - `npx vitest run [--project P] [files...]` → `.validate/test.log`
  - `bash scripts/arch-lint` → `.validate/architecture.log`
- Run checks concurrently (e.g., `tokio::spawn` or `std::thread`), capture stdout+stderr to log files, collect all exit codes before summarizing (do not short-circuit on first failure).
- Update npm scripts:
  - `validate` and `validate:quick` invoke Rust binary through stable wrapper command.
- Retain `scripts/validate.sh` as compatibility wrapper that delegates to Rust and can fallback to legacy behavior behind env flag during rollout.

### Success Criteria
- `npm run validate` and `npm run validate:quick` behavior remains consistent for local dev + CI.
- `.validate/*.log` artifact names preserved.
- Targeted test env vars behave identically.

### Confirmation Gate
Run migration validation on at least one failing and one passing scenario for each check type before enabling by default.

## Phase 3: Implement `brad-precommit` in Rust
### Overview
Replace complex hook logic with Rust orchestration while preserving git workflow guardrails and telemetry.

### Changes Required
- Create Rust binary `brad-precommit` with:
  - staged-file discovery (`git diff --cached --name-only --diff-filter=ACMRTD`).
  - branch gate logic for `main`/`master`, `MERGE_HEAD`, and `ALLOW_MAIN_COMMIT`.
  - `gitleaks` presence check + staged scan execution.
  - scoped routing rules identical to current hook for `packages/functions/src/*` and `scripts/*`.
  - test inference rule for `*.ts` -> `*.test.ts` and direct `*.test.ts` support.
  - invocation of `npm run validate` via `std::process::Command` with scoped env vars (`BRAD_VALIDATE_TEST_FILES`, `BRAD_VALIDATE_TEST_PROJECTS`) injected via `.env()` when applicable.
  - timing JSONL append to `.cache/pre-commit-timings.jsonl` preserving all fields: `timestamp`, `branch`, `mode`, `staged_files`, `exit_code`, `hook_ms`, `gitleaks_ms`, `validate_ms`, `validate_status`, `targeted_test_file_count`, `targeted_test_project_count`.
  - `mode` field must use exact string values: `"full"`, `"full_no_staged"`, `"full_fallback"`, `"scoped"`.
- Replace `hooks/pre-commit` body with minimal POSIX shim:
  - resolves and executes `brad-precommit`.
  - includes temporary fallback toggle to legacy Bash implementation for emergency rollback.

### Success Criteria
- Hook policy enforcement is unchanged from developer perspective.
- Timings continue to append in JSONL and remain gitignored.
- Scoped validation path and fallback path both produce expected behavior.

### Confirmation Gate
Pilot on a small team subset for several days with fallback available; no regressions in commit workflow.

## Phase 4: Cutover, Cleanup, and Documentation
### Overview
Finalize migration and remove duplicated logic after parity is proven.

### Changes Required
- Remove legacy Bash implementations after deprecation window.
- Keep thin hook shim if required by Git hook execution model.
- Update docs:
  - `docs/conventions/workflow.md`
  - `docs/guides/local-dev-quickstart.md`
  - any internal contributor docs describing validate internals.
- Add `cargo` to `scripts/doctor.sh` check list (currently missing even for `arch-lint`): `check_tool "cargo" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"`.
- No CI changes needed — `dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2` are already present. The on-demand build wrapper (`scripts/brad-validate`) will build from source in CI just like `scripts/arch-lint` does today.

### Success Criteria
- Single source of truth is Rust code for both flows.
- No behavior drift in CI or developer workflows.
- Documentation accurately reflects new execution model.

### Confirmation Gate
Team sign-off after one full sprint of stable usage.

## Rollout and Risk Management
- Use feature flags:
  - `BRAD_USE_RUST_VALIDATE=1`
  - `BRAD_USE_RUST_PRECOMMIT=1`
  - allow opt-out fallback during migration window.
- Risk: subtle output drift that breaks expectations.
  - Mitigation: snapshot tests + preserve artifact names/paths.
- Risk: cross-platform command invocation differences.
  - Mitigation: centralize subprocess runner in Rust and test on macOS + CI Linux.
- Risk: hook failure blocks developer commits.
  - Mitigation: emergency fallback path and explicit troubleshooting messages.

## Testing Strategy
- Automated:
  - Rust unit tests for parsers/routing/telemetry payload.
  - integration tests with fixture git repos for pre-commit branch/scoped logic.
  - contract tests comparing Rust and legacy shell behavior for representative scenarios.
- Manual:
  - local runs of `npm run validate`, `npm run validate:quick`, targeted env var runs.
  - local commit attempts on feature branch and main branch (with and without overrides).
  - CI run validation confirming `.validate/*.log` artifacts still upload.

## References
- [hooks/pre-commit](/Users/bradcarter/Documents/Dev/brad-os/hooks/pre-commit)
- [scripts/validate.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/validate.sh)
- [package.json](/Users/bradcarter/Documents/Dev/brad-os/package.json)
- [scripts/doctor.sh](/Users/bradcarter/Documents/Dev/brad-os/scripts/doctor.sh)
- [scripts/arch-lint](/Users/bradcarter/Documents/Dev/brad-os/scripts/arch-lint)
- [docs/conventions/workflow.md](/Users/bradcarter/Documents/Dev/brad-os/docs/conventions/workflow.md)
- [docs/guides/local-dev-quickstart.md](/Users/bradcarter/Documents/Dev/brad-os/docs/guides/local-dev-quickstart.md)
- [.github/workflows/ci.yml](/Users/bradcarter/Documents/Dev/brad-os/.github/workflows/ci.yml)
- [research note](/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/research/2026-02-26-validate-sh-dependencies-contracts.md)
