---
date: 2026-02-26
researcher: codex
git_commit: 90edd91
branch: rust-arch-lint
topic: Rust coverage enforcement options for dev-tooling crates
tags: [rust, coverage, ci, tooling]
status: complete
---

# Research Question

What Rust tooling exists in this repo today, and what practical options can enforce 90-100% test coverage for new dev-tooling Rust crates across local workflows and CI?

# Summary

The current Rust surface is a single workspace member, `tools/arch-lint`, invoked from the Node validation pipeline via `scripts/arch-lint`. Rust is present in CI (`dtolnay/rust-toolchain` + `rust-cache`), but there is no Rust test or coverage gate wired into `npm run validate`, pre-commit routing, `package.json` scripts, or docs.

Local verification confirms `arch-lint` currently has zero tests (`cargo test -p arch-lint` runs 0 tests), so introducing a strict coverage gate immediately would fail unless tests are added. Coverage tooling is also inconsistent: `cargo tarpaulin` is installed locally, but `cargo llvm-cov` is not currently installed.

The most maintainable path is to adopt `cargo-llvm-cov` as the primary gate (line-threshold failure), add a repo script to run per-crate thresholds, and integrate that script into `validate`, pre-commit routing, and CI. Tarpaulin can be retained as fallback, but requires careful include/exclude configuration in this repo to avoid counting unrelated Rust sources embedded under iOS build directories.

# Detailed Findings

## Current Rust Setup and Gaps

- Workspace currently declares only one member (`tools/arch-lint`) in root `Cargo.toml`.
- `tools/arch-lint/Cargo.toml` defines deps/dev-deps but no coverage configuration.
- `scripts/arch-lint` builds and executes a release binary, but does not run Rust tests.
- `scripts/validate.sh` runs `typecheck`, `lint`, `test` (Vitest), and `architecture`; there is no Rust test/coverage check.
- Pre-commit routing only scopes `packages/functions/src/*` and `scripts/*` for targeted runs; `tools/**` and Rust manifests are not explicitly routed.
- CI installs Rust toolchain/cache already, but `validate` job only runs `npm run validate`.
- Developer bootstrap (`local-dev-quickstart`, `doctor.sh`) does not list/check Rust toolchain or coverage tool prerequisites.

## Coverage Tooling Reality Check

### cargo-llvm-cov (recommended primary)

From upstream docs, `cargo-llvm-cov` supports explicit threshold flags (`--fail-under-lines`, `--fail-under-functions`, `--fail-under-regions`) and generates JSON/LCOV/HTML/text outputs. It depends on `llvm-tools-preview` and is intended as a workflow wrapper for LLVM source-based coverage.

Practical implication: this is the cleanest way to enforce 90-100% line coverage for Rust crates with deterministic CI failure semantics.

### cargo-tarpaulin (practical fallback)

Tarpaulin in this repo works with LLVM engine (`--engine llvm`) and supports `--fail-under`. However, a baseline run from repo root included many unrelated Rust sources under iOS `build/` directories (swift-protobuf Rust files), inflating denominator and creating noisy results. Restricting with `--include-files 'tools/arch-lint/src/*'` removes that noise.

Practical implication: tarpaulin is viable if tightly configured per-crate, but less ergonomic than `cargo-llvm-cov` for this monorepo shape.

### grcov/manual LLVM flow (alternative, highest complexity)

`grcov` can enforce/report coverage but requires manual `RUSTFLAGS`/`LLVM_PROFILE_FILE` instrumentation and report-generation plumbing. This gives flexibility but adds operational overhead compared with `cargo-llvm-cov`.

Practical implication: useful when custom report pipelines are needed, otherwise overkill for straightforward gate enforcement.

## Enforcement Options (90-100% for new dev-tooling crates)

### Option A (recommended): `cargo-llvm-cov` gate in shared script + CI

1. Add `scripts/rust-coverage.sh`:
   - discover target crates (default `tools/*/Cargo.toml`, optionally filtered to changed crates)
   - run `cargo llvm-cov --manifest-path <crate> --fail-under-lines <threshold> --summary-only`
   - write per-crate report logs to `.validate/rust-coverage.log`
2. Add `npm` scripts (`package.json`):
   - `test:rust`: run Rust tests for tooling crates
   - `test:rust:coverage`: invoke `scripts/rust-coverage.sh`
3. Wire into `scripts/validate.sh` as an additional parallel check (likely only in non-quick mode).
4. Extend pre-commit routing (`hooks/pre-commit`) so Rust changes run Rust coverage gate (or full validate fallback).
5. Add CI step/job in `.github/workflows/ci.yml` to run `npm run test:rust:coverage`.
6. Add Rust prerequisite checks in `scripts/doctor.sh` and docs.

Threshold strategy for “new crates only”:
- Default `90%` for all tooling crates, with per-crate override map for `95%` or `100%`.
- Enforce `100%` on crates newly added under `tools/*` (detected by git diff against `origin/main`) while allowing legacy crates to ramp.

### Option B: Tarpaulin gate with strict include filters

1. Add `.tarpaulin.toml` (or script args) enforcing:
   - `engine = "Llvm"`
   - per-crate include pattern (`tools/<crate>/src/*`)
   - `fail-under = 90..100`
2. Add `npm run test:rust:coverage` wrapper and integrate into `validate`/CI/hook similarly.

Tradeoff:
- Works today (already installed locally), but more fragile in monorepo roots unless include/exclude config is carefully maintained.

### Option C: grcov/manual pipeline

1. Add script to run `cargo test` with LLVM instrumentation env vars.
2. Use `grcov` to produce summary and enforce threshold in script.
3. Integrate into `validate`/CI.

Tradeoff:
- Most customizable, but highest script complexity and maintenance burden.

# Concrete Files Likely to Change (with rationale)

- `Cargo.toml`
  - Optionally broaden workspace member pattern (`tools/*`) for new tooling crates.
  - Add workspace metadata for coverage threshold defaults/overrides consumed by script.
- `tools/<new-crate>/Cargo.toml`
  - Add crate-specific coverage metadata override when needed (e.g., 100 for brand-new utilities).
- `package.json`
  - Add `test:rust` and `test:rust:coverage` scripts so local/CI workflows have a single entry point.
- `scripts/rust-coverage.sh` (new)
  - Central enforcement logic, per-crate thresholding, logging contract for `.validate`.
- `scripts/validate.sh`
  - Add `rust_coverage` check to full validation path.
- `hooks/pre-commit`
  - Route `tools/**`, `Cargo.toml`, `Cargo.lock`, and `**/*.rs` to Rust coverage/test gate in scoped mode.
- `.github/workflows/ci.yml`
  - Add Rust coverage execution (either in `validate` job or dedicated `rust-coverage` job with artifact upload).
- `scripts/doctor.sh`
  - Check for `cargo`, `rustup`, and selected coverage tool command availability.
- `docs/guides/local-dev-quickstart.md`
  - Add Rust toolchain + coverage tool prerequisites and verification commands.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `Cargo.toml` | 1-3 | Rust workspace currently includes only `tools/arch-lint`. |
| `tools/arch-lint/Cargo.toml` | 1-13 | Current crate metadata/dependencies; no coverage config. |
| `scripts/arch-lint` | 1-14 | Rust binary build/run wrapper used by architecture check. |
| `scripts/validate.sh` | 54-88 | Validation checks list; no Rust coverage gate. |
| `package.json` | 36-40 | Validation and architecture npm script entry points. |
| `hooks/pre-commit` | 199-217 | Scoped routing only for TS paths (`packages/functions/src`, `scripts`). |
| `.github/workflows/ci.yml` | 28-37 | Rust toolchain installed, but only `npm run validate` is executed. |
| `scripts/doctor.sh` | 86-92 | Tool checks omit Rust/cargo coverage tooling. |
| `docs/guides/local-dev-quickstart.md` | 7-14 | Prerequisites table omits Rust toolchain and coverage tools. |

# Architecture Insights

The repo uses Node scripts as the orchestration layer even for Rust tooling (`scripts/arch-lint` + `npm run validate`). The least disruptive path is to keep Rust coverage enforcement behind npm/script entry points so hooks and CI remain consistent with existing operational flow.

Because `validate.sh` runs checks in parallel and summarizes logs in `.validate/`, adding Rust coverage as another check preserves the current developer feedback model and avoids introducing a separate, undocumented quality gate.

# Historical Context

No Rust-specific testing/coverage conventions are currently documented. Existing quality emphasis in this repo focuses on TypeScript/Vitest coverage and architecture linting, with Rust used as a focused implementation language for `arch-lint`.

# Open Questions

- Should “new crate” be determined by path pattern (`tools/*`) or explicit metadata flag (`package.metadata.brad_os.dev_tooling = true`)?
- Should legacy crates start at 90 and ratchet upward, or should all tooling crates be required at 100 immediately?
- Should coverage gating run in pre-commit for Rust changes (faster feedback) or only in CI/full validate (less local latency)?

# External References

- cargo-llvm-cov: https://github.com/taiki-e/cargo-llvm-cov
- Tarpaulin docs: https://docs.rs/cargo-tarpaulin
- grcov: https://github.com/mozilla/grcov
- rustc LLVM coverage guide: https://doc.rust-lang.org/beta/rustc/instrument-coverage.html
