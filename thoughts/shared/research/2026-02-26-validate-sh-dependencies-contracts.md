---
date: 2026-02-26
researcher: codex
git_commit: 90edd91256bd886db1a03396da27f5e9d0556e61
branch: rust-arch-lint
topic: scripts/validate.sh dependencies and behavior contracts
tags: [validation, scripts, ci, pre-commit]
status: complete
---

# Research Question

What dependencies and externally relied-on contracts exist for `scripts/validate.sh`, including callers, output/log format, environment variables, and docs/tests that assume current behavior?

# Summary

`scripts/validate.sh` is the canonical validation entrypoint via `npm run validate` and `npm run validate:quick` (`package.json`). It orchestrates typecheck, lint, test, and architecture checks in parallel, writes command output into `.validate/*.log`, and emits a compact pass/fail terminal summary. The script contract is primarily exit-code based for automation, while humans and docs rely on the log location and minimal summary output.

Automation callers do not parse summary text. CI invokes `npm run validate` and only depends on `.validate/*.log` artifact paths on failure. The pre-commit hook invokes `npm run validate` in full or scoped mode and injects targeted-test env vars; it depends on validate exit status and on the env vars being honored by `validate.sh`.

No dedicated tests assert `validate.sh` summary formatting directly. Tests in `scripts/ralph` assert behavior around invoking `npm run validate` and handling failure, but they do not inspect `.validate` logs or summary line format.

# Detailed Findings

## validate.sh behavior and dependencies

- Script behavior:
  - Parses `--quick` to skip `test` and `architecture` (`scripts/validate.sh:19-25`, `55-57`).
  - Reads newline-separated env vars into arrays for targeted vitest selection (`scripts/validate.sh:27-44`).
  - Recreates `.validate/` on each run (`scripts/validate.sh:46-48`).
  - Runs checks in parallel and waits for completion (`scripts/validate.sh:94-99`).
  - Persists per-check status files `.validate/<check>.status` for internal summary rendering (`scripts/validate.sh:90-92`, `112`).
  - Emits per-check summary and final `PASS`/`FAIL`; on failure exits non-zero (`scripts/validate.sh:110-127`).

- Runtime dependencies invoked by validate:
  - `npx tsc -b` (`scripts/validate.sh:67`)
  - `npx oxlint ...` (`scripts/validate.sh:68`)
  - `npx vitest run ...` (`scripts/validate.sh:82-85`)
  - `bash scripts/arch-lint` (`scripts/validate.sh:87`)
  - shell utilities `date`, `rm`, `mkdir`, `printf`, `read`, background jobs/wait.

- Architecture-check transitive dependency:
  - `scripts/arch-lint` requires `cargo`/Rust toolchain and builds `target/release/arch-lint` when missing/stale (`scripts/arch-lint:1-14`).

## Callers and relied-on contracts

- Canonical entrypoints:
  - `npm run validate` -> `bash scripts/validate.sh` (`package.json:36`)
  - `npm run validate:quick` -> `bash scripts/validate.sh --quick` (`package.json:37`)

- Pre-commit hook caller:
  - Calls `npm run validate` in full and fallback paths (`hooks/pre-commit:188`, `224`)
  - Calls `npm run validate` with targeted env vars in scoped path (`hooks/pre-commit:252-255`)
  - Contract relied on: non-zero exit means block commit; no output parsing.

- CI caller:
  - Runs `npm run validate` (`.github/workflows/ci.yml:35-37`)
  - Uploads `.validate/*.log` on failure (`.github/workflows/ci.yml:38-44`)
  - Integration job also uploads `.validate/*.log` on failure (`.github/workflows/ci.yml:69-76`).

- Additional automation dependency (indirect):
  - `scripts/ralph/index.ts` invokes `npm run validate` via `execFileSync` and uses boolean success/failure (`scripts/ralph/index.ts:59-65`).
  - Related tests assert this invocation/failure handling (`scripts/ralph/index.test.ts:1319-1324`, `1351-1354`, `1921-1925`).

## Output/log contract and docs reliance

- validate writes verbose logs to:
  - `.validate/typecheck.log` (`scripts/validate.sh:67`)
  - `.validate/lint.log` (`scripts/validate.sh:68`)
  - `.validate/test.log` (`scripts/validate.sh:82-85`)
  - `.validate/architecture.log` (`scripts/validate.sh:87`)

- validate terminal-output contract:
  - Compact per-check lines with elapsed seconds and failing log hint (`scripts/validate.sh:114-116`)
  - Final `PASS`/`FAIL` line and failure log glob hint (`scripts/validate.sh:123-126`)

- Docs explicitly depending on this behavior:
  - "captures output to `.validate/*.log` and prints only a pass/fail summary" (`docs/conventions/workflow.md:54`)
  - CI uploads `.validate/*.log` (`docs/conventions/workflow.md:62`)
  - Local quickstart instructs reading `.validate/*.log` after `npm run validate` (`docs/guides/local-dev-quickstart.md:46-50`)
  - Testing conventions direct debugging via `.validate/test.log` (`docs/conventions/testing.md:130-134`)

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `scripts/validate.sh` | 19-127 | Full command flow, env vars, log writing, summary format, exit behavior |
| `scripts/arch-lint` | 1-14 | Architecture check wrapper dependency on Rust/cargo binary |
| `package.json` | 36-37 | NPM entrypoints to validate script |
| `hooks/pre-commit` | 188-191, 224-227, 252-255 | Full/fallback/scoped callers and env-var injection |
| `.github/workflows/ci.yml` | 35-44, 69-76 | CI invocation and `.validate/*.log` artifact contract |
| `docs/conventions/workflow.md` | 49-54, 59-62 | User-facing contract for validate and logs |
| `docs/guides/local-dev-quickstart.md` | 43-50 | Setup/debug instructions relying on `.validate` logs |
| `docs/conventions/testing.md` | 130-134 | Testing debug workflow using `.validate/test.log` |
| `scripts/ralph/index.ts` | 59-65 | Programmatic validate invocation as boolean gate |
| `scripts/ralph/index.test.ts` | 1319-1324, 1351-1354, 1921-1925 | Tests relying on `npm run validate` call/failure semantics |

# Architecture Insights

The system centralizes quality gates behind one script to keep command surface area stable while allowing internals (lint engine, architecture checker implementation) to change. Downstream automation mostly relies on exit codes and log-file locations rather than parsing terminal output text, which reduces coupling to presentation formatting.

# Historical Context

Recent plan/research docs in `thoughts/shared/plans` and `thoughts/shared/research` repeatedly call out preserving `npm run validate` behavior and `.validate/*.log` paths during lint/architecture tooling changes, indicating these are treated as stability boundaries for CI and developer workflow.

# Open Questions

- Should `.validate/` path be configurable (for CI/workspace isolation), or is hardcoding intentional?
- Should there be explicit tests for `scripts/validate.sh` output format and env-var handling, since docs treat these as user-facing contracts?
