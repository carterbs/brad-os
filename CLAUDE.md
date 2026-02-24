# CLAUDE.md - Brad OS Project

A personal wellness tracking system with a native iOS app and Express API backend. Users create workout plans, run 6-week mesocycles with progressive overload, track stretching sessions, and log meditation.

## Git Worktree Workflow (MANDATORY)

**All code changes MUST be made in git worktrees, not directly on main.**

```bash
# 1. Create a worktree for your change
mkdir -p /tmp/brad-os-worktrees
git worktree add /tmp/brad-os-worktrees/<branch-name> -b <branch-name>

# 2. Symlink node_modules (worktrees don't have their own)
ln -s /Users/bradcarter/Documents/Dev/brad-os/node_modules /tmp/brad-os-worktrees/<branch-name>/node_modules

# 3. Make changes and verify
# ... make changes ...
npm run validate

# 4. If iOS files were changed, run SwiftLint via xcodebuild (see docs/guides/ios-build-and-run.md)

# 5. Commit and merge back to main (from main worktree)
cd /Users/bradcarter/Documents/Dev/brad-os
git merge <branch-name>

# 6. Clean up the worktree
git worktree remove /tmp/brad-os-worktrees/<branch-name>
git branch -d <branch-name>
```

**Worktree Setup Requirements:**
- Symlink `node_modules` from main (step 2 above). Only run `npm install` if the branch changes `package.json`.

**TCC Safety:** Worktrees must NOT be under `~/Documents/` when used by subagents — macOS TCC blocks subprocess access. Always use `/tmp/brad-os-worktrees/`.

This keeps main clean and allows easy rollback of changes.

**Pre-commit hook enforcement:** A pre-commit hook in `hooks/pre-commit` blocks direct commits to `main`. Merge commits are allowed automatically (detected via `MERGE_HEAD`). For other cases, use `ALLOW_MAIN_COMMIT=1 git commit ...` to override.

## Subagent Usage (MANDATORY)

**All validation commands MUST be run in subagents to conserve context.**

Use the Task tool with `subagent_type=Bash` for:
- `npm run typecheck` - TypeScript compilation
- `npm run lint` - ESLint checks
- `npm test` - Unit tests (vitest)

Example:
```
Task tool with subagent_type=Bash:
  prompt: "Run npm run validate in /path/to/worktree and report results"
```

**Why**: These commands produce verbose output that consumes context. Running them in subagents keeps the main conversation focused on implementation decisions.

**Exception**: Quick single-command checks (like `git status`) can run directly.

## Validation

Run all checks with a single command:

```bash
npm run validate          # Full: typecheck + lint + test + architecture
npm run validate:quick    # Fast: typecheck + lint only
```

The pre-commit hook automatically runs quick validation (typecheck + staged-file lint).
For a complete check before merging, always run `npm run validate`.

**Do NOT run `npx vitest run` directly.** It dumps thousands of tokens of verbose output into the context window. `npm run validate` captures all output to `.validate/*.log` files and prints only a pass/fail summary. If a check fails, use Grep/Read on the log file (e.g., `.validate/test.log`) to inspect the failure.

Individual checks (rarely needed separately):
```bash
npm run typecheck           # TypeScript compilation
npm run lint                # ESLint (use --fix to auto-fix)
npm test                    # Unit tests (vitest)
npm run lint:architecture   # Architecture enforcement
```

## Continuous Integration

GitHub Actions runs on every push to `main` and every PR:

1. **validate** job — `npm run validate` (typecheck + lint + test + architecture)
2. **integration** job — Boots Firebase emulators, runs `npm run test:integration`

On failure, `.validate/*.log` artifacts are uploaded for inspection. See `.github/workflows/ci.yml`.

## When Implementing Features

1. **Read the architecture map** for the feature: `docs/architecture/<feature>.md`. Available maps: `lifting`, `stretching`, `meditation`, `meal-planning`, `cycling`, `health`, `calendar`, `today`, `profile`, `history`.
2. If a plan in `thoughts/shared/plans/active/` is **clearly related**, read it for context. Skip for bug fixes or small tweaks. See `thoughts/shared/plans/index.md` for a full plan inventory.
3. Write tests BEFORE implementation (TDD)
4. Start with types/schemas in `packages/functions/src/types/` and `packages/functions/src/schemas/`
5. Run full test suite before considering complete

## Implementation Best Practices

- **Read before acting**: Always read existing code/specs before implementing.
- **Explicit paths over vague instructions**: Reference exact file paths, not "look at existing patterns."
- **Commit after each phase**: Smaller commits = easier rollback.
- **Validate before committing**: Run typecheck, lint, and test before every commit.

## QA (MANDATORY)

After implementation, exercise what you built — don't just run tests and declare victory:
- **Script/CLI tool**: Run it and verify correct output
- **Linter/validator**: Run it against the codebase, show it catches violations
- **API endpoint**: Hit it and verify the response
- **UI change**: Build and run on simulator, verify visually
- **Test utility**: Use it in a test, show it works end-to-end

## Self-Review Before Committing

Before your final commit, review your own work:
1. `git diff main --stat` — check scope of changes
2. `git diff main` — read every changed line
3. Re-read relevant docs/conventions/ for the area you touched
4. Run `npm run validate`
5. Ask: does this actually achieve the goal? Is anything missing?

## Agent Legibility

Code and docs are optimized for agent readability first. CLAUDE.md is a map, not an encyclopedia — it points to deeper sources of truth in `docs/`. When making decisions that future agents need to understand, push the context into the repo (docs, comments, tests) rather than leaving it in chat or in your head. If a plan has a QA section, follow it — planning quality directly drives implementation quality.

## Conventions (see docs/conventions/)

- **[TypeScript](docs/conventions/typescript.md)** — No `any`, explicit return types, strict null checks, Zod validation, file naming, type deduplication
- **[iOS / Swift](docs/conventions/ios-swift.md)** — SwiftLint rules, shared APIClient, UI/SwiftUI theme system, XcodeGen, app details
- **[API Patterns](docs/conventions/api-patterns.md)** — REST structure, action endpoints, shared APIClient
- **[Testing](docs/conventions/testing.md)** — TDD, vitest not jest, never skip tests, QA on simulator

## Guides (see docs/guides/)

- **[Debugging Cloud Functions](docs/guides/debugging-cloud-functions.md)** — Ordered checklist: rewrite paths, deployment state, App Check
- **[iOS Build and Run](docs/guides/ios-build-and-run.md)** — xcodebuild commands, simulator setup, SwiftLint via build, exploratory testing
- **[Progressive Overload](docs/guides/progressive-overload.md)** — Business logic for workout progression, data architecture
- **[Debug Telemetry](docs/guides/debug-telemetry.md)** — `npm run otel:start`, query `.otel/traces.jsonl` and `.otel/logs.jsonl` with Grep for structured iOS debugging
