# Unified Validation Pipeline + Pre-commit Quality Gate

## Why

This is the highest-leverage harness improvement because it closes the biggest gap in the current development loop: **code quality is not enforced at commit time, and there is no single command to run all checks.**

Current state:
- Pre-commit hook (`hooks/pre-commit`) only validates worktree branching and scans for secrets via gitleaks
- Agents and humans must independently remember to run 4 separate commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run lint:architecture`
- CLAUDE.md documents these commands but there's no enforcement — an agent can commit code that fails typecheck, lint, tests, or architecture checks
- There is no unified "did I break anything?" command

After this improvement:
- `npm run validate` runs all 4 checks in sequence with fail-fast and timing output
- Pre-commit hook catches type errors and lint violations before they reach the repository
- Agents need to know ONE command instead of FOUR
- The pre-commit hook acts as a safety net even when agents forget to validate

Measured timings (cold start on this codebase):
- `tsc -b`: ~2.5s (incremental, faster on warm builds)
- `eslint . --ext .ts`: ~7.3s (full codebase)
- `vitest run`: ~6.1s
- `lint:architecture`: ~0.2s
- **Total: ~16s** — acceptable for a pre-merge validation command

## What

### 1. `scripts/validate.sh` — Unified validation runner

A shell script that runs all quality checks in optimal order with:
- **Fail-fast**: stops at first failure (no wasting time on later checks)
- **Timing**: reports elapsed time per check and total
- **Clear output**: colored pass/fail markers, summary line
- **Exit code**: 0 only if ALL checks pass
- **Optional `--quick` flag**: runs only typecheck + lint (no tests), for rapid iteration

Check order (fastest-to-fail first):
1. TypeScript compilation (`tsc -b`) — catches type errors in ~2.5s
2. ESLint (`eslint . --ext .ts`) — catches style/safety violations
3. Unit tests (`vitest run`) — catches logic errors
4. Architecture enforcement (`tsx scripts/lint-architecture.ts`) — catches structural violations

```bash
#!/bin/bash
set -euo pipefail

# Unified validation pipeline for brad-os
# Runs all quality checks in sequence, failing fast on first error.
#
# Usage:
#   npm run validate          # All checks (typecheck + lint + test + architecture)
#   npm run validate:quick    # Fast checks only (typecheck + lint)

BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

QUICK=false
if [ "${1:-}" = "--quick" ]; then
  QUICK=true
fi

TOTAL_START=$(date +%s)
PASSED=0
FAILED=0

run_check() {
  local name="$1"
  shift
  local start=$(date +%s)

  printf "${BOLD}▶ ${name}${RESET}\n"

  if "$@"; then
    local end=$(date +%s)
    local elapsed=$((end - start))
    printf "${GREEN}✓ ${name}${RESET} ${DIM}(${elapsed}s)${RESET}\n\n"
    PASSED=$((PASSED + 1))
  else
    local end=$(date +%s)
    local elapsed=$((end - start))
    printf "${RED}✗ ${name}${RESET} ${DIM}(${elapsed}s)${RESET}\n\n"
    FAILED=$((FAILED + 1))

    TOTAL_END=$(date +%s)
    TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

    printf "\n${BOLD}--- Validation FAILED ---${RESET}\n"
    printf "${RED}Failed at: ${name}${RESET}\n"
    printf "${DIM}${PASSED} passed, ${FAILED} failed (${TOTAL_ELAPSED}s total)${RESET}\n"
    exit 1
  fi
}

if [ "$QUICK" = true ]; then
  printf "\n${BOLD}=== Quick Validation ===${RESET}\n\n"
else
  printf "\n${BOLD}=== Full Validation ===${RESET}\n\n"
fi

run_check "TypeScript compilation" npx tsc -b
run_check "ESLint" npx eslint . --ext .ts

if [ "$QUICK" = false ]; then
  run_check "Unit tests" npx vitest run
  run_check "Architecture enforcement" npx tsx scripts/lint-architecture.ts
fi

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

printf "\n${BOLD}--- Validation PASSED ---${RESET}\n"
printf "${GREEN}All ${PASSED} checks passed${RESET} ${DIM}(${TOTAL_ELAPSED}s total)${RESET}\n"
```

**Key design decisions:**
- Uses `npx` for commands instead of `npm run` to avoid double-nesting npm output
- Fail-fast prevents wasting time running tests when types are broken
- `--quick` flag enables reuse in pre-commit without code duplication
- Shell script (not TypeScript) because it's pure orchestration — no parsing needed

### 2. Enhanced `hooks/pre-commit` — Quality gate at commit time

Add quality checks after the existing worktree gate and gitleaks scan. The pre-commit runs the **quick** subset (typecheck + staged-file lint) to keep commits fast (~5s overhead).

**After the existing `gitleaks protect --staged --verbose` line, append:**

```bash
# --- Quick quality checks (typecheck + lint staged files) ---
# These catch the most common errors before they enter the repo.

echo ""
echo "Running quality checks..."

# 1. TypeScript compilation (incremental, fast for small changes)
if ! npx tsc -b; then
  echo ""
  echo "ERROR: TypeScript compilation failed. Fix type errors before committing."
  echo "  Run 'npm run typecheck' to see full output."
  exit 1
fi
echo "✓ TypeScript compilation passed"

# 2. ESLint on staged .ts files only (proportional to change size)
STAGED_TS=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' | grep -v '\.config\.ts$' | grep -v 'scripts/' || true)
if [ -n "$STAGED_TS" ]; then
  if ! echo "$STAGED_TS" | xargs npx eslint; then
    echo ""
    echo "ERROR: ESLint errors found in staged files."
    echo "  Run 'npm run lint:fix' to auto-fix, then re-stage."
    exit 1
  fi
  echo "✓ ESLint passed (staged files)"
else
  echo "✓ ESLint skipped (no staged .ts files)"
fi

# 3. Architecture enforcement (very fast, ~0.2s)
if ! npx tsx scripts/lint-architecture.ts; then
  echo ""
  echo "ERROR: Architecture violations found."
  echo "  Run 'npm run lint:architecture' for details."
  exit 1
fi
echo "✓ Architecture check passed"

echo ""
echo "All pre-commit checks passed."
```

**Key design decisions:**
- ESLint runs **only on staged `.ts` files** (not the whole codebase) for speed. Uses `git diff --cached --name-only --diff-filter=ACM` to get only Added/Copied/Modified files.
- Excludes `*.config.ts` and `scripts/` from staged lint (matching `.eslintrc.cjs` ignorePatterns)
- Does NOT run full test suite in pre-commit (too slow at ~6s; tests run via `npm run validate` before merge)
- Architecture lint is included because it's extremely fast (~0.2s) and catches structural issues
- `npx tsc -b` uses incremental compilation — subsequent runs after a full build are near-instant for small changes

### 3. Package.json changes — New npm scripts

Add to the `"scripts"` section in `package.json`:

```json
"validate": "bash scripts/validate.sh",
"validate:quick": "bash scripts/validate.sh --quick",
```

### 4. CLAUDE.md update — Simplify validation guidance

Replace the current Validation section:

```markdown
## Validation

Run all checks with a single command:

\`\`\`bash
npm run validate          # Full: typecheck + lint + test + architecture
npm run validate:quick    # Fast: typecheck + lint only
\`\`\`

The pre-commit hook automatically runs quick validation (typecheck + staged-file lint + architecture).
For a complete check before merging, always run `npm run validate`.

Individual checks (rarely needed separately):
\`\`\`bash
npm run typecheck           # TypeScript compilation
npm run lint                # ESLint (use --fix to auto-fix)
npm test                    # Unit tests (vitest)
npm run lint:architecture   # Architecture enforcement
\`\`\`
```

Also update the "Subagent Usage" section example:

```markdown
Example:
\`\`\`
Task tool with subagent_type=Bash:
  prompt: "Run npm run validate in /path/to/worktree and report results"
\`\`\`
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `scripts/validate.sh` | **Create** | Unified validation runner (~60 lines bash). Runs typecheck → lint → test → architecture with fail-fast, timing, colored output. Supports `--quick` flag. |
| `hooks/pre-commit` | **Modify** | Append quality checks after existing gitleaks line: typecheck + staged-file ESLint + architecture lint. ~30 lines added. |
| `package.json` | **Modify** | Add `"validate"` and `"validate:quick"` scripts. 2 lines added to `"scripts"` block. |
| `CLAUDE.md` | **Modify** | Simplify Validation section to recommend `npm run validate`. Update subagent example. ~15 lines changed. |

## Tests

There are no unit tests to write for shell scripts in this project's test framework (vitest tests TypeScript, not bash). Instead, correctness is verified through the QA procedure below.

However, the architecture enforcement already has an implicit integration test: `npm run lint:architecture` exercises all 15 checks and exits non-zero on violations. The validate script wraps this — if it passes, the pipeline works.

**What would indicate a regression:**
- A commit reaches main with failing typecheck → pre-commit hook didn't run or was bypassed
- `npm run validate` exits 0 when a check fails → validate.sh has a bug
- Pre-commit takes >10s → ESLint is running on too many files (should only be staged)

## QA

### Step 1: Verify `npm run validate` works on clean codebase

```bash
npm run validate
```

Expected: All 4 checks pass, shows timing per check and total, exits 0.

### Step 2: Verify `npm run validate:quick` skips tests

```bash
npm run validate:quick
```

Expected: Only typecheck + lint run. No test output. Faster than full validate.

### Step 3: Verify fail-fast behavior

Temporarily introduce a type error (e.g., `const x: number = "hello"` in any `.ts` file):

```bash
npm run validate
```

Expected: Fails at "TypeScript compilation", does NOT proceed to lint/test/architecture.

### Step 4: Verify pre-commit catches type errors

```bash
# In a worktree branch (not main):
echo 'const x: number = "hello";' >> packages/functions/src/types/exercise.ts
git add packages/functions/src/types/exercise.ts
git commit -m "test: intentional type error"
```

Expected: Commit is rejected with "TypeScript compilation failed" message.

### Step 5: Verify pre-commit catches lint errors

```bash
# In a worktree branch:
echo 'export function foo() { return 1 }' >> packages/functions/src/types/exercise.ts
git add packages/functions/src/types/exercise.ts
git commit -m "test: intentional lint error"
```

Expected: Commit is rejected with ESLint errors (missing explicit return type).

### Step 6: Verify pre-commit is fast

```bash
# Stage a small change and time the commit
time git commit -m "test: timing check"
```

Expected: Pre-commit overhead is <5s (mostly typecheck at ~2.5s + architecture at ~0.2s + staged lint proportional to changed files).

### Step 7: Verify existing pre-commit checks still work

```bash
# On main branch (should be blocked by worktree gate):
git checkout main
echo "test" >> README.md
git add README.md
git commit -m "test: should be blocked"
```

Expected: Blocked by "Direct commits to main are not allowed" (the new checks don't interfere with existing ones).

### Step 8: Revert all intentional errors

```bash
git checkout -- packages/functions/src/types/exercise.ts
```

## Conventions

The following project conventions from CLAUDE.md and docs/conventions apply:

1. **Git Worktree Workflow** — All changes must be in a worktree. The pre-commit hook changes must not break the existing worktree gate. Test the implementation in a worktree.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context. The CLAUDE.md update should reflect this.

3. **No `any` types** — The validate.sh script is bash, not TypeScript, so this doesn't apply directly. But any TypeScript changes must comply.

4. **Pre-commit hook in `hooks/`** — The project uses `git config core.hooksPath hooks` (set in postinstall). Modifications go to `hooks/pre-commit`, not `.git/hooks/pre-commit`.

5. **ESLint ignores `scripts/`** — The validate.sh script is in `scripts/` which is already in `.eslintrc.cjs` ignorePatterns. The staged-file lint in pre-commit must also exclude `scripts/` files to match this behavior.

6. **Fail-fast principle** — From golden-principles.md: the validate pipeline should stop at the first failure. This is more useful than running all checks and showing all errors at once, because later checks often produce cascading noise from earlier failures.

7. **Principle-to-Linter Pipeline** — From golden-principles.md: if the pre-commit catches repeat violations, consider adding new checks to lint-architecture.ts. The pre-commit is the enforcement layer; lint-architecture is the analysis layer.
