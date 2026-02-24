# AGENTS.md — Brad OS

Personal wellness tracking system: native iOS (SwiftUI) + Express API backend on Firebase.

## Quick Start

See **[Local Dev Quickstart](docs/guides/local-dev-quickstart.md)** for full bootstrap.

```bash
npm install          # Install deps + set up git hooks
npm run validate     # Typecheck + lint + test + architecture (all-in-one)
```

## Key Docs

| Doc | Purpose |
|-----|---------|
| [CLAUDE.md](CLAUDE.md) | Full project rules — worktree workflow, validation, subagent usage, TDD, QA |
| [README.md](README.md) | Human-facing project overview, features, screenshots |

## Conventions

| Convention | File | Summary |
|------------|------|---------|
| TypeScript | [docs/conventions/typescript.md](docs/conventions/typescript.md) | No `any`, explicit returns, Zod validation, file naming |
| iOS / Swift | [docs/conventions/ios-swift.md](docs/conventions/ios-swift.md) | SwiftLint, shared APIClient, Theme system, XcodeGen |
| API Patterns | [docs/conventions/api-patterns.md](docs/conventions/api-patterns.md) | REST structure, action endpoints, shared APIClient |
| Testing | [docs/conventions/testing.md](docs/conventions/testing.md) | TDD, vitest (not jest), QA on simulator |

## Guides

| Guide | File | Summary |
|-------|------|---------|
| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) | 5-min bootstrap: install → validate → emulators → iOS build |
| iOS Build and Run | [docs/guides/ios-build-and-run.md](docs/guides/ios-build-and-run.md) | xcodebuild, simulator setup, SwiftLint via build |
| Debugging Cloud Functions | [docs/guides/debugging-cloud-functions.md](docs/guides/debugging-cloud-functions.md) | Rewrite paths, deployment state, App Check |
| Progressive Overload | [docs/guides/progressive-overload.md](docs/guides/progressive-overload.md) | Workout progression business logic |
| Debug Telemetry | [docs/guides/debug-telemetry.md](docs/guides/debug-telemetry.md) | OpenTelemetry traces for iOS debugging |

## Architecture Maps

Feature-specific architecture docs live in `docs/architecture/`:

`calendar` · `cycling` · `health` · `history` · `lifting` · `meal-planning` · `meditation` · `profile` · `stretching` · `today`

## Validation

```bash
npm run validate          # Full: typecheck + lint + test + architecture
npm run validate:quick    # Fast: typecheck + lint only
npm run lint:architecture # Architecture rules only
```

Output goes to `.validate/*.log` — only a pass/fail summary is printed.

## Workflow

All code changes must be made in git worktrees, not directly on main. See [CLAUDE.md](CLAUDE.md) for the full worktree protocol.
