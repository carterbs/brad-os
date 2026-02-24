# Add Root AGENTS.md as Table-of-Contents Map

**Why**: Non-Claude agents (Codex, Copilot Workspace, Cursor, etc.) look for `AGENTS.md` at the repo root to discover build instructions. Today the repo only has `CLAUDE.md`, so these agents must guess where docs live or stumble through directory listings. A short `AGENTS.md` that acts as a signpost — pointing to `CLAUDE.md`, conventions, guides, and architecture — lets any agent bootstrap itself with minimal context consumption.

---

## What

Create a single new file `AGENTS.md` at the repo root. It should be:

- **Short** — under 60 lines. Agents that read it burn context on every invocation, so brevity is critical.
- **A map, not a manual** — it links to deeper docs rather than duplicating their content.
- **Structured for fast scanning** — section headers, bullet lists, and a table for the docs tree.

The file should cover these sections in this order:

1. **One-liner project description** — what brad-os is (wellness tracking, iOS + Express).
2. **Quick start** — pointer to `docs/guides/local-dev-quickstart.md` and the two key commands (`npm install`, `npm run validate`).
3. **Key entry points** — links to `CLAUDE.md` (full project rules), `README.md` (human-facing overview).
4. **Conventions** — table linking to each convention doc with a one-line summary.
5. **Guides** — table linking to each guide doc with a one-line summary.
6. **Architecture maps** — table listing all `docs/architecture/*.md` files with feature names.
7. **Validation** — the three commands an agent needs: `npm run validate`, `npm run validate:quick`, and `npm run lint:architecture`.
8. **Worktree workflow reminder** — one sentence: all changes via worktrees, see CLAUDE.md for details.

---

## Files

### 1. `AGENTS.md` (CREATE)

```markdown
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
```

### 2. No other files modified

This is a purely additive change — one new file. `CLAUDE.md` and `README.md` are not modified because they already serve their respective audiences. `AGENTS.md` is a new entry point that complements them.

---

## Tests

This is a documentation-only change. No application code is modified, so no new vitest tests are needed.

**Verify no existing tests break** by running `npm run validate`. The architecture linter may check for file references, so confirming it passes is the test.

---

## QA

### 1. Validate the build still passes
```bash
npm run validate
# All checks should pass — this is a docs-only change
```

### 2. Verify all internal links in AGENTS.md resolve
Every relative link in the file must point to a real file:
```bash
# Key docs
ls CLAUDE.md
ls README.md

# Conventions
ls docs/conventions/typescript.md
ls docs/conventions/ios-swift.md
ls docs/conventions/api-patterns.md
ls docs/conventions/testing.md

# Guides
ls docs/guides/local-dev-quickstart.md
ls docs/guides/ios-build-and-run.md
ls docs/guides/debugging-cloud-functions.md
ls docs/guides/progressive-overload.md
ls docs/guides/debug-telemetry.md

# Architecture (spot check)
ls docs/architecture/lifting.md
ls docs/architecture/meal-planning.md
ls docs/architecture/today.md
```

### 3. Verify the file is concise
```bash
wc -l AGENTS.md
# Should be under 60 lines
```

### 4. Verify the file renders correctly
Read `AGENTS.md` end-to-end and confirm:
- Tables render properly (column alignment)
- No broken markdown syntax
- Code blocks are fenced correctly
- Architecture map list matches actual files in `docs/architecture/`

### 5. Diff review
```bash
git diff main --stat
# Expected: 1 file changed
#   AGENTS.md (new)

git diff main
# Review every line
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — Agent legibility**: Push context into the repo (docs) rather than leaving it in chat. AGENTS.md directly serves this principle — it makes the docs tree discoverable by any agent.
6. **CLAUDE.md — QA**: Exercise what you built — verify links resolve, file is concise, and markdown renders correctly.
