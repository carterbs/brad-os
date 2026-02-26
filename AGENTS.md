# AGENTS.md — Brad OS

A personal wellness tracking system: iOS app (SwiftUI) + Express API backend (Firebase Cloud Functions). Workouts, stretching, meditation, meal planning, cycling, health metrics.

## Quick Start

```bash
npm install        # Install deps + set up git hooks
npm run validate   # Typecheck + lint + test + architecture (MUST pass before committing)
npm run qa:start   # Default app QA loop (simulator + Firebase + OTel + build + launch)
```

Full bootstrap: [Local Dev Quickstart](docs/guides/local-dev-quickstart.md)

## Dev Tooling Language Preference

- Use Rust for non-trivial dev tooling and orchestration (validation, lint runners, repo scanners, CI helpers, migration helpers, and stateful orchestration flows).
- Implement orchestration/stateful tooling in Rust under `tools/dev-cli` first.
- Restrict shell scripts to thin delegation wrappers or very small, low-complexity tasks; prefer wrappers for argument pass-through and process execution only.
- Treat reusable helpers as non-shell first-class tooling: e.g. `tools/dev-cli/src/runner.rs`, `tools/dev-cli/src/reporter.rs`, `tools/dev-cli/src/timing.rs`, `tools/dev-cli/src/precommit.rs`.
- Keep any shell wrapper focused on argument passthrough, process execution, and path setup.
- Coverage rule: tooling code changed under this policy must target Rust-line coverage floor `90%` and prefer `>=95%`.
- If a shell script requires complex flow, state, retries, branching/loops, argument parsing, subprocess orchestration, or structured IO/output, migrate that logic to Rust.
- Exempt scripts (thin delegation wrappers only):
  - `scripts/validate.sh`, `scripts/doctor.sh`, `scripts/arch-lint`
  - `hooks/pre-commit`, `scripts/run-integration-tests.sh`
  - `scripts/qa-start.sh`, `scripts/qa-stop.sh`
  - `scripts/brad-validate`, `scripts/brad-precommit`
- See `docs/conventions/workflow.md` for enforcement and migration guardrails.

Current examples of preferred Rust-first delegation:
- `scripts/validate.sh` delegates to `tools/dev-cli/src/bin/validate.rs`.
- `scripts/doctor.sh` delegates to `tools/dev-cli/src/bin/doctor.rs`.
- `scripts/run-integration-tests.sh` delegates to `tools/dev-cli/src/bin/run-integration-tests.rs`.
- `scripts/qa-start.sh` and `scripts/qa-stop.sh` delegate to `tools/dev-cli/src/bin/qa_start.rs` and `tools/dev-cli/src/bin/qa_stop.rs`.

## Rules

**Read [Workflow Rules](docs/conventions/workflow.md) before making any changes.** 

### Tooling migration policy

- CI and local linting must eventually catch shell-orchestration complexity via architecture lint.
- Any tooling code added/modified under this policy must include high-coverage tests (target >=95%; hard floor 90%).
## Conventions

| Convention | File | Summary |
| TypeScript | [docs/conventions/typescript.md](docs/conventions/typescript.md) | No `any`, explicit returns, Zod validation, strict nulls |
| iOS / Swift | [docs/conventions/ios-swift.md](docs/conventions/ios-swift.md) | SwiftLint, shared APIClient, theme system, XcodeGen |
| API Patterns | [docs/conventions/api-patterns.md](docs/conventions/api-patterns.md) | REST structure, BaseRepository, router factories |
| Testing | [docs/conventions/testing.md](docs/conventions/testing.md) | TDD, vitest (not jest), never skip tests |

## Guides

| Guide | File |
|-------|------|
| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) |
| iOS Build and Run | [docs/guides/ios-build-and-run.md](docs/guides/ios-build-and-run.md) |
| Debugging Cloud Functions | [docs/guides/debugging-cloud-functions.md](docs/guides/debugging-cloud-functions.md) |
| Progressive Overload | [docs/guides/progressive-overload.md](docs/guides/progressive-overload.md) |
| Debug Telemetry | [docs/guides/debug-telemetry.md](docs/guides/debug-telemetry.md) |

## Architecture Maps

Feature-level architecture docs live in `docs/architecture/`. Each describes the data flow, file locations, and key types for a feature domain:

`calendar` · `cycling` · `health` · `history` · `lifting` · `meal-planning` · `meditation` · `profile` · `stretching` · `today`

## Key Directories

| Path | Contents |
|------|----------|
| `packages/functions/src/` | Cloud Functions: handlers, services, repositories, types, schemas |
| `ios/BradOS/` | Native SwiftUI iOS app |
| `docs/` | All documentation (conventions, guides, architecture maps) |
| `thoughts/shared/plans/` | Implementation plans (active and completed) |
| `scripts/` | Build scripts, linters, utilities |
