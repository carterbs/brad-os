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

For any new non-trivial developer tooling:
- Implement orchestration/stateful workflows in Rust under `tools/dev-cli`.
- Keep shell scripts to thin delegation wrappers, thin compatibility glue, and trivial command routers.
- Treat reusable helpers as non-shell first-class tooling: e.g. `tools/dev-cli/src/runner.rs`, `tools/dev-cli/src/reporter.rs`, `tools/dev-cli/src/timing.rs`, `tools/dev-cli/src/precommit.rs`.

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
