# Documentation Index

> Map of all docs in the Brad OS project. See [CLAUDE.md](../CLAUDE.md) for project rules.

## Conventions

| Doc | Summary |
|-----|---------|
| [typescript.md](conventions/typescript.md) | No `any`, explicit return types, strict null checks, Zod validation, file naming |
| [ios-swift.md](conventions/ios-swift.md) | SwiftLint rules, shared APIClient, theme system, XcodeGen |
| [api-patterns.md](conventions/api-patterns.md) | REST structure, action endpoints, shared APIClient |
| [testing.md](conventions/testing.md) | TDD, vitest not jest, never skip tests, QA on simulator |

## Guides

| Guide | Summary |
|-------|---------|
| [local-dev-quickstart.md](guides/local-dev-quickstart.md) | 5-minute bootstrap: install, validate, emulators, iOS build |
| [ios-build-and-run.md](guides/ios-build-and-run.md) | xcodebuild commands, simulator setup, SwiftLint, exploratory testing |
| [debugging-cloud-functions.md](guides/debugging-cloud-functions.md) | Ordered checklist: rewrite paths, deployment state, App Check |
| [progressive-overload.md](guides/progressive-overload.md) | Business logic for workout progression, data architecture |
| [debug-telemetry.md](guides/debug-telemetry.md) | OpenTelemetry traces and logs for structured iOS debugging |

## Architecture Maps

Feature-level architecture docs describing data flow, file locations, and key types.

| Feature | Doc |
|---------|-----|
| Calendar | [calendar.md](architecture/calendar.md) |
| Cycling | [cycling.md](architecture/cycling.md) |
| Health | [health.md](architecture/health.md) |
| History | [history.md](architecture/history.md) |
| Lifting | [lifting.md](architecture/lifting.md) |
| Meal Planning | [meal-planning.md](architecture/meal-planning.md) |
| Meditation | [meditation.md](architecture/meditation.md) |
| Profile | [profile.md](architecture/profile.md) |
| Stretching | [stretching.md](architecture/stretching.md) |
| Today | [today.md](architecture/today.md) |

## Other

| Doc | Summary |
|-----|---------|
| [golden-principles.md](golden-principles.md) | Linter-enforced invariants and project principles |
| [quality-grades.md](quality-grades.md) | Code quality grading system |
| [tts-kokoro-decision.md](tts-kokoro-decision.md) | TTS engine decision log (Kokoro vs alternatives) |

## References

| Doc | Summary |
|-----|---------|
| [codex-agent-team-article.md](references/codex-agent-team-article.md) | Reference article on Codex agent team patterns |

## Archive

| Doc | Summary |
|-----|---------|
| [FIREBASE_SETUP-legacy.md](archive/FIREBASE_SETUP-legacy.md) | Legacy Firebase setup instructions (superseded) |
