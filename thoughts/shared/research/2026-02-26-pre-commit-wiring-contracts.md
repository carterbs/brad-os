---
date: 2026-02-26
researcher: codex
git_commit: 90edd91
branch: rust-arch-lint
topic: pre-commit hook wiring and external contracts
tags: [git-hooks, pre-commit, validation, ci]
status: complete
---

# Research Question

How is `hooks/pre-commit` wired into this repository, and what external contracts does it rely on across package scripts, setup scripts, docs, and CI?

# Summary

`hooks/pre-commit` is enabled by npm lifecycle wiring: root `postinstall` sets `core.hooksPath=hooks`, so Git executes the tracked `hooks/pre-commit` script for commits. The hook enforces branch policy, secret scanning, and validation via `npm run validate`, with scoped test routing for known paths and full fallback otherwise.

The key contracts are local-tool and script contracts: `gitleaks` must be installed; `npm run validate` must remain the canonical quality gate; and `scripts/validate.sh` must continue to accept `BRAD_VALIDATE_TEST_FILES` / `BRAD_VALIDATE_TEST_PROJECTS` passed from the hook. CI does not invoke Git hooks directly; it enforces `npm run validate` and integration tests instead.

# Detailed Findings

## Wiring

- Root npm script config wires Git hooks on install by setting `core.hooksPath` to `hooks`.
- `scripts/doctor.sh` validates that hook-path wiring and `gitleaks` are present.
- Docs repeat this bootstrap expectation (`npm install` enables pre-commit hook).

## Hook Behavior and Contracts

- `hooks/pre-commit` blocks direct commits on `main/master` unless merge commit or explicit override (`ALLOW_MAIN_COMMIT=1`).
- It requires `gitleaks` and runs `gitleaks protect --staged --verbose`.
- It always runs `npm run validate`, but may scope tests via `BRAD_VALIDATE_TEST_FILES` and `BRAD_VALIDATE_TEST_PROJECTS`.
- It records timing telemetry to `.cache/pre-commit-timings.jsonl` (ignored by git).

## CI Relationship

- CI runs `npm ci` then `npm run validate`; hooks are not a CI enforcement mechanism because no commit action occurs in workflow jobs.
- Integration job additionally runs emulator-backed integration tests.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `package.json` | 36, 60-61 | `validate` entrypoint + `preinstall` (Node version gate) + `postinstall` hook wiring (`core.hooksPath hooks`) |
| `hooks/pre-commit` | 149-171 | Main branch commit gate + `ALLOW_MAIN_COMMIT` override |
| `hooks/pre-commit` | 173-183 | `gitleaks` dependency and staged secret scan |
| `hooks/pre-commit` | 220-225, 251-255 | Full fallback vs scoped validate invocation; env contract into validate |
| `hooks/pre-commit` | 10, 70-84 | Timing log contract (`PRE_COMMIT_TIMING_FILE`, JSONL append) |
| `scripts/validate.sh` | 12-17, 30-44 | Accepts and parses `BRAD_VALIDATE_TEST_FILES` / `BRAD_VALIDATE_TEST_PROJECTS` |
| `scripts/validate.sh` | 69-85 | Applies targeted vitest args when env inputs are provided |
| `scripts/doctor.sh` | 90, 97-102 | Setup checks for `gitleaks` and `core.hooksPath=hooks` |
| `.github/workflows/ci.yml` | 32-37 | CI install + `npm run validate` |
| `.github/workflows/ci.yml` | 60-67 | CI integration test contract |
| `docs/conventions/workflow.md` | 34-44 | Hook policy and behavior documented (`--no-verify` prohibition, override note) |
| `docs/guides/local-dev-quickstart.md` | 35-39 | Install/bootstrap docs stating `postinstall` enables hooks |
| `docs/golden-principles.md` | 40-43 | Principle-level contracts enforced by pre-commit |
| `.gitignore` | 51, 77 | Ignores pre-commit timing file / cache |

# Architecture Insights

- The repository treats `npm run validate` as the single source of truth for quality checks, reused in local hook and CI.
- Hook-specific logic adds local guardrails (`main` protection, secret scan, scoped test acceleration), while CI keeps full, deterministic coverage.

# Historical Context

- Not investigated in commit history for this pass.

# Open Questions

- Should CI also run secret scanning (`gitleaks`) for defense in depth, since this currently exists only in pre-commit workflow?
