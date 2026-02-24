# Add Root AGENTS.md as Table-of-Contents Map

**Why**: Agents that are not Claude Code (e.g., Codex, Devin, Cursor, generic LLM-based agents) look for `AGENTS.md` at the repo root as their entry point. Today, `CLAUDE.md` serves that role for Claude Code specifically, but other agents may not know to read it. A short `AGENTS.md` acts as a universal signpost — a table-of-contents that points to `CLAUDE.md`, `docs/conventions/`, `docs/guides/`, and `docs/architecture/` so any agent can discover build instructions with minimal context consumption.

---

## What

Create a single new file `AGENTS.md` at the repo root. It should be:

1. **Short** — under 60 lines. Agents read this to orient, not to learn everything.
2. **A map, not an encyclopedia** — every section is a pointer to a deeper source of truth, not a duplication of it.
3. **Covers the essential discovery paths**: what the project is, how to build/validate, where conventions live, where architecture maps live, and where guides live.
4. **Includes the single most critical command** (`npm run validate`) inline so agents don't have to chase a link just to verify the build.

The file should NOT duplicate content from `CLAUDE.md` or any guide. It should contain one-liner descriptions and links.

---

## Files

### 1. `AGENTS.md` (CREATE)

Full content of the new file:

```markdown
# AGENTS.md — Brad OS Navigation Map

> Start here. This file tells you where everything is. For full project rules, read [CLAUDE.md](CLAUDE.md).

## What Is This?

A personal wellness tracking system: iOS app (SwiftUI) + Express API backend (Firebase Cloud Functions). Workouts, stretching, meditation, meal planning, cycling, health metrics.

## Quick Start

```bash
npm install        # Install deps + set up git hooks
npm run validate   # Typecheck + lint + test + architecture (MUST pass before committing)
```

Full bootstrap: [Local Dev Quickstart](docs/guides/local-dev-quickstart.md)

## Project Rules

**[CLAUDE.md](CLAUDE.md)** — The primary instruction file. Covers:
- Git worktree workflow (all changes in worktrees, not on main)
- Validation commands (`npm run validate`)
- TDD requirement, QA requirements
- Subagent usage patterns
- Self-review checklist

## Conventions

| Convention | File | Summary |
|------------|------|---------|
| TypeScript | [docs/conventions/typescript.md](docs/conventions/typescript.md) | No `any`, explicit returns, Zod validation, strict nulls |
| iOS / Swift | [docs/conventions/ios-swift.md](docs/conventions/ios-swift.md) | SwiftLint, shared APIClient, theme system, XcodeGen |
| API Patterns | [docs/conventions/api-patterns.md](docs/conventions/api-patterns.md) | REST structure, action endpoints, shared APIClient |
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
```

---

## Tests

This is a documentation-only change — no application code is modified. No vitest unit tests are needed.

**Verify no existing tests break** by running `npm run validate` after making changes. The architecture linter scans for certain structural invariants, so confirm it still passes.

---

## QA

### 1. Validate the build still passes
```bash
npm run validate
# All checks should pass — this is a docs-only change
```

### 2. Verify all internal links in AGENTS.md resolve
Every relative link in `AGENTS.md` must point to a real file. Check each one:
```bash
ls CLAUDE.md
ls docs/guides/local-dev-quickstart.md
ls docs/conventions/typescript.md
ls docs/conventions/ios-swift.md
ls docs/conventions/api-patterns.md
ls docs/conventions/testing.md
ls docs/guides/ios-build-and-run.md
ls docs/guides/debugging-cloud-functions.md
ls docs/guides/progressive-overload.md
ls docs/guides/debug-telemetry.md
ls docs/architecture/
```

### 3. Verify architecture map names match actual files
```bash
# Each of these must exist in docs/architecture/:
for f in calendar cycling health history lifting meal-planning meditation profile stretching today; do
  ls docs/architecture/$f.md
done
```

### 4. Verify the file is short
```bash
wc -l AGENTS.md
# Should be under 60 lines
```

### 5. Diff review
```bash
git diff main --stat
# Expected: 1 file changed (1 new)
#   AGENTS.md (new)

git diff main
# Review every line — should be a single new file with no modifications to existing files
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — Agent legibility**: Push context into the repo (docs) rather than leaving it in chat. This file directly serves that principle — it's a repo-level map for any agent.
6. **CLAUDE.md — QA**: Exercise what you built — verify all links resolve and the file is concise.
