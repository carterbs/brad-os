# Workflow Rules

Operational rules for development workflow in Brad OS.

## Git Worktree Workflow (MANDATORY)

**All code changes MUST be made in git worktrees, not directly on main.**

```bash
# 1. Create a worktree
mkdir -p /tmp/brad-os-worktrees
git worktree add /tmp/brad-os-worktrees/<branch-name> -b <branch-name>

# 2. Symlink node_modules
ln -s /Users/bradcarter/Documents/Dev/brad-os/node_modules /tmp/brad-os-worktrees/<branch-name>/node_modules

# 3. Make changes and verify
npm run validate

# 4. If iOS files changed, run SwiftLint via xcodebuild (see docs/guides/ios-build-and-run.md)

# 5. Commit and merge back to main
cd /Users/bradcarter/Documents/Dev/brad-os
git merge <branch-name>

# 6. Clean up
git worktree remove /tmp/brad-os-worktrees/<branch-name>
git branch -d <branch-name>
```

- Symlink `node_modules` from main. Only run `npm install` if the branch changes `package.json`.
### Pre-commit Hook

`hooks/pre-commit` runs these checks — all must pass:
1. Blocks direct commits to `main` (merge commits allowed via `MERGE_HEAD`)
2. Gitleaks secret scanning
3. Full validation pipeline (`npm run validate`: typecheck + lint + test + architecture)

**Never use `--no-verify` to skip these checks.** Fix violations, don't bypass the hook.
For the main-branch gate only: `ALLOW_MAIN_COMMIT=1 git commit ...`.

## Validation

```bash
npm run validate          # Full: typecheck + lint + test + architecture
npm run validate:quick    # Fast: typecheck + lint only
npm run doctor            # Check: all required tooling installed
```

**Do NOT run `npx vitest run` directly.** `npm run validate` captures output to `.validate/*.log` and prints only a pass/fail summary. If a check fails, use Grep/Read on the log file (e.g., `.validate/test.log`).

### CI

GitHub Actions runs on every push to `main` and every PR:
1. **validate** — `npm run validate`
2. **integration** — Firebase emulators + `npm run test:integration`

On failure, `.validate/*.log` artifacts are uploaded. See `.github/workflows/ci.yml`.

## When Implementing Features

1. **Read the architecture map**: `docs/architecture/<feature>.md`
2. If a plan in `thoughts/shared/plans/active/` is clearly related, read it. Skip for bug fixes. See `thoughts/shared/plans/index.md`.
3. Write tests BEFORE implementation (TDD)
4. Start with types/schemas in `packages/functions/src/types/` and `packages/functions/src/schemas/`
5. Run full test suite before considering complete

### Best Practices

- **Read before acting**: Always read existing code/specs before implementing.
- **Explicit paths over vague instructions**: Reference exact file paths.
- **Commit after each phase**: Smaller commits = easier rollback.
- **Validate before committing**: Run typecheck, lint, and test before every commit.

## QA (MANDATORY)

After implementation, exercise what you built — don't just run tests and declare victory:
- **iOS:** `npm run qa:start` (simulator + Firebase + OTel + build + launch)
- **Script/CLI tool**: Run it, verify correct output
- **API endpoint**: Hit it, verify the response
- **UI change**: Build and run on simulator, verify visually
- **Test utility**: Use it in a test, show it works end-to-end

## Self-Review Before Committing

1. `git diff main --stat` — check scope of changes
2. `git diff main` — read every changed line
3. Re-read relevant `docs/conventions/` for the area you touched
4. Run `npm run validate`
5. Ask: does this actually achieve the goal? Is anything missing?
