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

- Use Rust for non-trivial dev tooling and orchestration (validation, lint runners, repo scanners, CI helpers, migration helpers).
- Restrict shell scripts to thin delegation wrappers or very small, low-complexity tasks.
- Prefer adding logic to Rust under `tools/dev-cli` and `tools/arch-lint` before extending shell.
- Keep any shell wrapper focused on argument passthrough and process execution.
- Coverage rule: tooling code changed under this policy must target Rust-line coverage floor `90%` and prefer `>=95%`.
- Exempt scripts (thin delegation wrappers only):
  - `scripts/validate.sh`, `scripts/doctor.sh`, `scripts/arch-lint`
  - `hooks/pre-commit`, `scripts/run-integration-tests.sh`
  - `scripts/brad-validate`, `scripts/brad-precommit`
- See `docs/conventions/workflow.md` for enforcement and migration guardrails.

## Rules

**Read [Workflow Rules](docs/conventions/workflow.md) before making any changes.** 
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
