# Fix start-emulators.sh: Remove @brad-os/shared Build and Align Modes with npm Scripts

**Why**: `scripts/start-emulators.sh` fails immediately because it runs `npm run build -w @brad-os/shared` — a workspace that doesn't exist (the only workspace is `packages/functions` with name `@brad-os/functions`). Additionally, the script's three modes (`--seed` default, `--fresh`, `--persist`) don't match the three `npm run emulators*` scripts in `package.json` (`emulators` = persist default, `emulators:fresh`, `emulators:seed`). This means a developer running `./scripts/start-emulators.sh` gets different behavior than `npm run emulators`, and the script can't start at all due to the broken build step.

**What**: Fix the build step, align the script's modes with the npm scripts, and make the default mode match `npm run emulators` (persist mode, not seed mode).

---

## Current State (Problems)

### Problem 1: Non-existent workspace build
```bash
# Line 22 of start-emulators.sh — fails because @brad-os/shared doesn't exist
npm run build -w @brad-os/shared
```
There is no `packages/shared/` directory. The only workspace is `packages/functions/` (`@brad-os/functions`).

### Problem 2: Mode mismatch
| Mode | `npm run emulators*` | `start-emulators.sh` |
|------|---------------------|---------------------|
| **Default** | `emulators` → persist (`--import=./emulator-data --export-on-exit=./emulator-data`) | `--seed` → seed (`--import=./seed-data`) |
| Fresh | `emulators:fresh` → no flags | `--fresh` → no flags ✓ |
| Seed | `emulators:seed` → `--import=./seed-data` | `--seed` → `--import=./seed-data` ✓ |
| Persist | *(is the default)* | `--persist` → `--import=./emulator-data --export-on-exit=./emulator-data` ✓ |

The default behavior differs: npm defaults to **persist**, the script defaults to **seed**.

### Problem 3: Build command inconsistency
- `package.json` `"build"` script: `npm run build -w @brad-os/functions`
- `npm run emulators`: calls `npm run build` (the root script)
- `start-emulators.sh`: calls `npm run build -w @brad-os/shared` then `npm run build -w @brad-os/functions` (two separate workspace builds, one of which doesn't exist)

---

## Files

### 1. `scripts/start-emulators.sh` (modify)

Replace the entire file with:

```bash
#!/bin/bash
#
# Start Firebase Emulators
#
# This script builds the functions and starts the Firebase emulators.
# Modes match the npm run emulators* scripts in package.json.
#
# Usage:
#   ./scripts/start-emulators.sh            # Persist data (matches: npm run emulators)
#   ./scripts/start-emulators.sh --fresh    # Empty database  (matches: npm run emulators:fresh)
#   ./scripts/start-emulators.sh --seed     # Seed data       (matches: npm run emulators:seed)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔨 Building functions..."
npm run build

# Parse arguments — default to persist mode (same as `npm run emulators`)
MODE="${1:---persist}"

case "$MODE" in
  --fresh)
    echo "🚀 Starting emulators with fresh database..."
    firebase emulators:start
    ;;
  --seed)
    if [ -d "./seed-data" ]; then
      echo "🌱 Starting emulators with seed data..."
      firebase emulators:start --import=./seed-data
    else
      echo "⚠️  No seed-data directory found. Starting fresh..."
      echo "   Run 'npm run seed:generate' while emulators are running to create seed data."
      firebase emulators:start
    fi
    ;;
  --persist|*)
    echo "🚀 Starting emulators with persistent data..."
    firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
    ;;
esac
```

**Changes from current file:**

1. **Remove line 21-22** (`npm run build -w @brad-os/shared`) — workspace doesn't exist.
2. **Replace line 25** (`npm run build -w @brad-os/functions`) with `npm run build` — use the root build script for consistency with npm scripts. The root `build` already does `npm run build -w @brad-os/functions`.
3. **Change default from `--seed` to `--persist`** — aligns with `npm run emulators` (the default npm script).
4. **Reorder case branches** — `--persist` is now the default/fallback, `--seed` is explicit. Fresh stays the same.
5. **Update header comments** — document the alignment with npm scripts.

### 2. No other files need changes

The `package.json` npm scripts are already correct:
- `"emulators"`: persist mode (default) ✓
- `"emulators:fresh"`: fresh mode ✓
- `"emulators:seed"`: seed mode ✓

`firebase.json` emulator config is correct. `ci.yml` doesn't use `start-emulators.sh` (it calls `firebase emulators:start` directly). `wait-for-emulator.sh` is independent of this script.

---

## Tests

This is a shell script fix, not application code. No new vitest unit tests are needed (shell scripts aren't covered by the vitest test suite).

**Verification is done via QA (below).**

One thing to verify in existing tests: confirm no test or CI config references `@brad-os/shared`:
- `ci.yml` uses `npm run build` — no reference to shared ✓
- `package.json` `"build"` uses `-w @brad-os/functions` — no reference to shared ✓
- No integration test references start-emulators.sh directly ✓

---

## QA

### 1. Verify the build step succeeds
```bash
# In the worktree, run just the build portion
npm run build
# Should succeed — builds @brad-os/functions via tsc
```

### 2. Verify default mode (persist) matches npm run emulators
```bash
# Run the script with no arguments
./scripts/start-emulators.sh
# Expected output:
#   🔨 Building functions...
#   🚀 Starting emulators with persistent data...
# Emulators should start with --import=./emulator-data --export-on-exit=./emulator-data
# This matches: npm run emulators
```

### 3. Verify --fresh mode
```bash
./scripts/start-emulators.sh --fresh
# Expected output:
#   🔨 Building functions...
#   🚀 Starting emulators with fresh database...
# Emulators should start with no import/export flags
# This matches: npm run emulators:fresh
```

### 4. Verify --seed mode
```bash
./scripts/start-emulators.sh --seed
# Expected output (if seed-data/ exists):
#   🔨 Building functions...
#   🌱 Starting emulators with seed data...
# Expected output (if seed-data/ doesn't exist):
#   🔨 Building functions...
#   ⚠️  No seed-data directory found. Starting fresh...
# This matches: npm run emulators:seed
```

### 5. Verify the old broken command no longer runs
```bash
# Confirm @brad-os/shared is nowhere in the script
grep -c "@brad-os/shared" scripts/start-emulators.sh
# Expected: 0
```

### 6. Verify emulators actually respond
```bash
# After starting with any mode, in a separate terminal:
curl -sf http://127.0.0.1:5001/brad-os/us-central1/devHealth
# Should return a health check response (HTTP 200)
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing to ensure nothing is broken.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — QA**: Exercise the script manually — don't just verify it parses. Actually start the emulators and hit the health endpoint.
