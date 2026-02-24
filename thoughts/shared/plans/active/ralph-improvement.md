# Add `scripts/doctor.sh` and `npm run doctor` for Environment Verification

**Why**: New developers and agents currently rely on the quickstart guide's manual "Verify" section (`node -v`, `firebase --version`, etc.) to check prerequisites. When a tool is missing, the error surfaces late — during `npm run validate`, `git commit` (gitleaks), or iOS build (xcodegen). A `doctor` command front-loads all environment checks into one actionable diagnostic, prints exact install commands for anything missing, and eliminates wasted cycles debugging cryptic failures.

---

## What

A single shell script (`scripts/doctor.sh`) that:

1. **Checks each required tool** — verifies it exists on `$PATH` via `command -v`
2. **Validates version constraints** where applicable (Node ≥ 22, npm ≥ 10)
3. **Checks project setup** — git hooks configured, `node_modules` present
4. **Prints a pass/fail summary** in the same style as `validate.sh` (ANSI colors, ✓/✗, timing)
5. **Prints exact install commands** for each missing dependency (e.g., `brew install gitleaks`)
6. **Exits 0 on all-pass, 1 on any failure** — usable in CI or automation

### Tools to Check

| Tool | Required | Version Check | Install Command |
|------|----------|---------------|-----------------|
| `node` | Yes | Major ≥ 22 | `brew install node@22` or `nvm install 22` |
| `npm` | Yes | Major ≥ 10 | Comes with Node — reinstall Node |
| `firebase` | Yes | Any | `npm install -g firebase-tools` |
| `gitleaks` | Yes | Any | `brew install gitleaks` |
| `xcodegen` | Yes | Any | `brew install xcodegen` |

### Project Setup to Check

| Check | How | Fix |
|-------|-----|-----|
| Git hooks configured | `git config core.hooksPath` == `hooks` | `npm install` (runs postinstall) |
| `node_modules` exists | `[ -d node_modules ]` | `npm install` |
| In a git repo | `git rev-parse --git-dir` | Clone the repo properly |

### Output Format

Matches `validate.sh` styling:

```
  ✓ node              v22.12.0 (≥ 22)
  ✓ npm               v10.9.2 (≥ 10)
  ✓ firebase          13.29.1
  ✓ gitleaks          8.21.2
  ✓ xcodegen          2.42.0
  ✓ git hooks         hooks/
  ✓ node_modules      present

  PASS  All dependencies satisfied.
```

When something is missing:

```
  ✓ node              v22.12.0 (≥ 22)
  ✓ npm               v10.9.2 (≥ 10)
  ✗ firebase          not found
  ✗ gitleaks          not found
  ✓ xcodegen          2.42.0
  ✓ git hooks         hooks/
  ✗ node_modules      missing

  FAIL  3 issues found. Install missing dependencies:

    npm install -g firebase-tools
    brew install gitleaks
    npm install
```

---

## Files

### 1. `scripts/doctor.sh` (CREATE)

Executable shell script. Structure:

```bash
#!/bin/bash
set -uo pipefail

# Environment doctor for brad-os
# Verifies all required tooling is installed and prints install commands
# for anything missing.
#
# Usage:
#   npm run doctor
#   bash scripts/doctor.sh

# --- ANSI Colors (same as validate.sh) ---
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# --- State ---
ISSUES=0
INSTALL_CMDS=()

# --- Helper: check a command exists ---
# check_tool <name> <install_cmd> [min_major_version]
#
# If min_major_version is provided, extracts the major version from
# `<name> --version` or `<name> -v` output and compares.
check_tool() {
  local name="$1"
  local install_cmd="$2"
  local min_major="${3:-}"

  if ! command -v "$name" >/dev/null 2>&1; then
    printf "  ${RED}✗ %-18s${RESET} ${DIM}not found${RESET}\n" "$name"
    INSTALL_CMDS+=("$install_cmd")
    ((ISSUES++))
    return
  fi

  # Get version string
  local version
  version=$("$name" --version 2>/dev/null || "$name" -v 2>/dev/null || echo "unknown")
  # Extract first version-like number (e.g., "v22.12.0" → "22.12.0", "13.29.1" → "13.29.1")
  version=$(echo "$version" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -z "$version" ] && version="installed"

  if [ -n "$min_major" ] && [ "$version" != "installed" ]; then
    local major
    major=$(echo "$version" | cut -d. -f1)
    if [ "$major" -lt "$min_major" ] 2>/dev/null; then
      printf "  ${RED}✗ %-18s${RESET} ${DIM}v%s (need ≥ %s)${RESET}\n" "$name" "$version" "$min_major"
      INSTALL_CMDS+=("$install_cmd")
      ((ISSUES++))
      return
    fi
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}v%s (≥ %s)${RESET}\n" "$name" "$version" "$min_major"
  else
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}%s${RESET}\n" "$name" "$version"
  fi
}

# --- Helper: check project setup ---
check_setup() {
  local label="$1"
  local condition="$2"   # "ok" or "fail"
  local detail="$3"
  local fix_cmd="$4"

  if [ "$condition" = "ok" ]; then
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}%s${RESET}\n" "$label" "$detail"
  else
    printf "  ${RED}✗ %-18s${RESET} ${DIM}%s${RESET}\n" "$label" "$detail"
    INSTALL_CMDS+=("$fix_cmd")
    ((ISSUES++))
  fi
}

# --- Run checks ---
printf "\n"

# Tool checks
check_tool "node" "brew install node@22  # or: nvm install 22" 22
check_tool "npm" "# npm comes with Node — reinstall Node to update npm" 10
check_tool "firebase" "npm install -g firebase-tools"
check_tool "gitleaks" "brew install gitleaks"
check_tool "xcodegen" "brew install xcodegen"

# Project setup checks
printf "\n"

# Git hooks
HOOKS_PATH=$(git config core.hooksPath 2>/dev/null || echo "")
if [ "$HOOKS_PATH" = "hooks" ]; then
  check_setup "git hooks" "ok" "hooks/" "npm install  # sets core.hooksPath via postinstall"
else
  check_setup "git hooks" "fail" "not configured (got: '${HOOKS_PATH:-<unset>}')" "npm install  # sets core.hooksPath via postinstall"
fi

# node_modules
if [ -d "node_modules" ]; then
  check_setup "node_modules" "ok" "present" ""
else
  check_setup "node_modules" "fail" "missing" "npm install"
fi

# --- Summary ---
printf "\n"
if [ "$ISSUES" -eq 0 ]; then
  printf "  ${GREEN}${BOLD}PASS${RESET}  ${DIM}All dependencies satisfied.${RESET}\n\n"
else
  printf "  ${RED}${BOLD}FAIL${RESET}  ${DIM}%d issue(s) found. Install missing dependencies:${RESET}\n\n" "$ISSUES"
  for cmd in "${INSTALL_CMDS[@]}"; do
    printf "    %s\n" "$cmd"
  done
  printf "\n"
  exit 1
fi
```

Key design decisions:
- Uses `set -uo pipefail` like `validate.sh` (not `set -e` — we want to continue checking after failures)
- `check_tool` extracts version with `grep -oE` to handle varied output formats (`v22.12.0`, `13.29.1`, etc.)
- Version comparison uses integer comparison on major version only (sufficient for Node ≥ 22, npm ≥ 10)
- Install commands accumulate in `INSTALL_CMDS` array and print at the end — the user gets one actionable block to copy-paste
- Blank line between tool checks and setup checks for visual grouping

### 2. `package.json` (MODIFY)

Add `doctor` script. Insert after the `validate:quick` line:

```json
"doctor": "bash scripts/doctor.sh",
```

The scripts section will have this ordering (showing context):
```json
"validate": "bash scripts/validate.sh",
"validate:quick": "bash scripts/validate.sh --quick",
"doctor": "bash scripts/doctor.sh",
```

### 3. `docs/guides/local-dev-quickstart.md` (MODIFY)

Add a mention of `npm run doctor` in the Prerequisites section, after the manual verify commands. Insert after the "Verify:" code block (after line 22):

```markdown

Or run the automated check:

```bash
npm run doctor
```
```

This gives developers two options: manual spot-checks or the full automated diagnostic.

### 4. `CLAUDE.md` (MODIFY)

Add `npm run doctor` to the Validation section. In the section that starts with "Run all checks with a single command:", add a line after `npm run validate:quick`:

```markdown
npm run doctor            # Check: all required tooling installed
```

---

## Tests

### `scripts/doctor.test.ts` (CREATE)

A vitest test file that spawns `doctor.sh` with manipulated `$PATH` to verify behavior. This follows the pattern used in the codebase where TypeScript tests exercise shell-level tooling.

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const SCRIPT = path.resolve('scripts/doctor.sh');
const ROOT = path.resolve('.');

function runDoctor(envOverrides: Record<string, string> = {}): {
  stdout: string;
  exitCode: number;
} {
  try {
    const stdout = execSync(`bash ${SCRIPT}`, {
      cwd: ROOT,
      env: { ...process.env, ...envOverrides },
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; status?: number };
    return {
      stdout: (e.stdout as string) || '',
      exitCode: (e.status as number) || 1,
    };
  }
}
```

**Test cases:**

1. **`it('exits 0 when all tools are present')`** — Run in the normal dev environment. Since the developer machine should have all tools, this verifies the happy path produces `PASS` and exit code 0.

2. **`it('reports node version')`** — Verify output contains a `✓ node` line with version info.

3. **`it('reports all expected tool names')`** — Verify output mentions `node`, `npm`, `firebase`, `gitleaks`, `xcodegen`, `git hooks`, `node_modules`.

4. **`it('exits 1 when a tool is missing')`** — Set `PATH` to a minimal value (e.g., `/usr/bin` only) so most tools are missing, verify exit code 1 and `FAIL` in output.

5. **`it('prints install commands when tools are missing')`** — With restricted `PATH`, verify the output contains install commands like `brew install gitleaks`.

6. **`it('detects missing node_modules')`** — Run from a temp directory without `node_modules`, verify the output contains `✗ node_modules` and `missing`.

> **Note on test design**: Tests 4-6 require PATH manipulation or running from a different directory. The test must be careful to still find `bash` itself. We set PATH to include `/bin:/usr/bin` (where bash lives) but exclude paths where `firebase`/`gitleaks`/`xcodegen` live.

---

## QA

### 1. Run doctor on the dev machine (happy path)
```bash
npm run doctor
# Expected: all ✓, PASS, exit code 0
echo $?  # should be 0
```

### 2. Simulate a missing tool
```bash
# Temporarily hide gitleaks by restricting PATH
PATH=/usr/bin:/bin bash scripts/doctor.sh
# Expected: ✗ for firebase, gitleaks, xcodegen; ✓ for node, npm
# Expected: FAIL with install commands printed
echo $?  # should be 1
```

### 3. Verify install commands are correct
For each install command printed in step 2, verify it's a valid command:
- `npm install -g firebase-tools` — standard Firebase CLI install
- `brew install gitleaks` — matches what `hooks/pre-commit` says (line 34)
- `brew install xcodegen` — matches quickstart guide

### 4. Simulate missing node_modules
```bash
cd /tmp && bash /path/to/scripts/doctor.sh
# Expected: ✗ node_modules — missing
```

### 5. Simulate wrong Node version (if possible)
If nvm is available:
```bash
nvm use 18 && npm run doctor
# Expected: ✗ node — v18.x.x (need ≥ 22)
nvm use 22  # restore
```

### 6. Validate the build still passes
```bash
npm run validate
# All checks should pass — this change adds a script + docs, no app code
```

### 7. Verify CLAUDE.md reference checker passes
The architecture linter checks that paths in CLAUDE.md and docs resolve to real files. Since we reference `scripts/doctor.sh` from CLAUDE.md (indirectly through the `npm run doctor` command), and the script will exist, this should pass.

### 8. Run the test suite
```bash
npm test
# doctor.test.ts should pass (tests 1-3 in normal env, tests 4-6 with PATH restriction)
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: All changes made in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation commands in subagents to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main --stat` and `git diff main` to review every changed line.
5. **CLAUDE.md — QA**: Exercise what you built — run `npm run doctor` in both happy and failure cases.
6. **Testing convention**: Write tests before implementation (TDD). Use vitest, not jest. Co-locate test file with source (`scripts/doctor.test.ts`).
7. **Shell script conventions**: Follow patterns from `validate.sh` — `set -uo pipefail`, ANSI color variables, `BOLD`/`GREEN`/`RED`/`DIM`/`RESET`, pass/fail summary format.
8. **File must be executable**: `chmod +x scripts/doctor.sh` after creation (like `validate.sh` and `start-emulators.sh`).
9. **Docs updates**: Keep quickstart guide and CLAUDE.md in sync with new commands.
