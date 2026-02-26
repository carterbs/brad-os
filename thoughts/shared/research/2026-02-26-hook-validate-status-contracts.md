---
date: 2026-02-26
researcher: codex
git_commit: 90edd91
branch: rust-arch-lint
topic: Contracts around pre-commit timing JSONL, validate status files, and shell-specific hook/validate behavior
tags: [pre-commit, validate, shell, contracts]
status: complete
---

# Research Question

Where in the repository do code/docs parse or rely on:
- `.cache/pre-commit-timings.jsonl`
- `.validate/*.status`
- shell-specific behavior in `hooks/pre-commit` and `scripts/validate.sh`

# Summary

Runtime code writes pre-commit telemetry to `.cache/pre-commit-timings.jsonl` from `hooks/pre-commit`, but no runtime parser/consumer of that JSONL file exists in the codebase. The file path is documented in workflow docs and ignored by git.

`.validate/*.status` is an internal implementation detail of `scripts/validate.sh`: each check writes `rc elapsed` to a status file, then the same script reads those files to render summary output. No other production scripts, CI, or docs depend on parsing those status files.

Shell specificity is an explicit contract. `hooks/pre-commit` uses Bash-only constructs (arrays, `[[ ]]`, process substitution, parameter substitution) and `scripts/validate.sh` is invoked via `bash` from `package.json`, with Bash arrays used inside. Hook installation is enforced through `postinstall` setting `core.hooksPath`, with `doctor.sh` checking this setup.

# Detailed Findings

## `.cache/pre-commit-timings.jsonl`

- `hooks/pre-commit` defines default timing output path and appends JSONL timing records.
- `docs/conventions/workflow.md` documents this as trend-analysis telemetry.
- `.gitignore` explicitly ignores the file.
- No parser/reader was found in code/docs (outside historical research notes in `thoughts/`).

## `.validate/*.status`

- `scripts/validate.sh` writes `.validate/<check>.status` and later reads each back for summary output.
- This appears to be internal to `validate.sh`; no other script or CI job reads these status files.
- CI and docs rely on `.validate/*.log` artifacts, not `.status` files.

## Shell-specific behavior contracts

- `hooks/pre-commit` is Bash script (`#!/usr/bin/env bash`) and uses Bash features:
  - arrays and append (`SCOPED_TEST_FILES+=...`, `SCOPED_TEST_PROJECTS+=...`)
  - `[[ ... ]]` conditionals
  - process substitution (`done < <(git diff ...)`)
  - parameter substitution (`${safe_branch//\"/\\\"}`)
- `scripts/validate.sh` is Bash script (`#!/bin/bash`) and uses Bash arrays/array appends.
- `package.json` runs validate scripts with `bash`, enforcing interpreter choice.
- `package.json` postinstall sets `core.hooksPath hooks`, and `scripts/doctor.sh` validates this setup.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `hooks/pre-commit` | 10, 70, 84 | Writes telemetry JSONL to `.cache/pre-commit-timings.jsonl` |
| `docs/conventions/workflow.md` | 41 | Documents pre-commit timing JSONL telemetry |
| `.gitignore` | 51 | Ignores `.cache/pre-commit-timings.jsonl` |
| `scripts/validate.sh` | 91, 112 | Writes and reads `.validate/<check>.status` |
| `hooks/pre-commit` | 1, 17-18, 66, 126, 131, 147 | Bash-specific constructs in pre-commit hook |
| `scripts/validate.sh` | 1, 27-28, 56, 62, 72, 77 | Bash-specific constructs in validate script |
| `package.json` | 36-37 | Explicit `bash scripts/validate.sh` invocation |
| `package.json` | 61 | `postinstall` sets `core.hooksPath hooks` |
| `scripts/doctor.sh` | 97-101 | Checks whether hooks path is configured |
| `docs/guides/local-dev-quickstart.md` | 38 | Documents `core.hooksPath` postinstall behavior |
| `docs/conventions/workflow.md` | 34-41, 54 | Documents pre-commit behavior and validate output expectations |
| `.github/workflows/ci.yml` | 35-36, 38-44 | CI depends on `npm run validate` and `.validate/*.log` artifacts |

# Architecture Insights

- Validation contract is primarily exit-code based (`npm run validate` success/failure).
- `.validate/*.log` is the externally consumed artifact path (CI/docs).
- `.validate/*.status` is internal plumbing for one script's presentation layer.
- Pre-commit timing JSONL is telemetry-only in current repo state (write-only).

# Historical Context

Recent research docs in `thoughts/shared/research/` discuss these contracts explicitly, indicating these boundaries were recently reviewed during lint/validation workflow work.

# Open Questions

- Should `.validate/*.status` be considered private implementation detail and documented as such?
- Should pre-commit timing JSONL have a consumer script, or remain telemetry write-only?
