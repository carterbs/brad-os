# Add `scripts/setup-ios-testing.sh` — iOS Development Environment Setup Script

## Why

`docs/guides/ios-build-and-run.md` (line 8) and `.claude/commands/explore-ios.md` (line 13) both reference `./scripts/setup-ios-testing.sh`, but the file doesn't exist. Any agent or developer following the iOS setup guide hits a missing-file error before they can build or test the app. Adding this script closes the gap and provides a one-command way to verify/prepare the iOS toolchain.

## What

Create `scripts/setup-ios-testing.sh` that:

1. **Checks prerequisites** — verifies `xcode-select`, `xcodebuild`, and `xcodegen` are installed, printing actionable install commands for anything missing.
2. **Regenerates the Xcode project** — runs `xcodegen generate` inside `ios/BradOS/`.
3. **Verifies a simulator is available** — checks that an iPhone 17 Pro simulator exists via `xcrun simctl list devices`.
4. **Runs a fast build sanity check** — runs `xcodebuild build` with the standard flags to confirm the project compiles (catches SPM resolution failures, signing issues, missing files early).
5. **Prints a success summary** with next-step commands (boot simulator, install, launch).

The script is idempotent — safe to re-run at any time.

---

## Files

### 1. `scripts/setup-ios-testing.sh` (CREATE)

```bash
#!/bin/bash
#
# Setup iOS Simulator Testing Environment
#
# Verifies required tools, regenerates the Xcode project,
# and runs a sanity build to confirm everything compiles.
#
# Referenced by:
#   - docs/guides/ios-build-and-run.md
#   - .claude/commands/explore-ios.md
#
# Usage:
#   ./scripts/setup-ios-testing.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IOS_DIR="$PROJECT_DIR/ios/BradOS"
SIMULATOR_NAME="iPhone 17 Pro"
DERIVED_DATA="$HOME/.cache/brad-os-derived-data"

# --- Color helpers ---
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; }

ERRORS=0

# ──────────────────────────────────────────────
# Step 1: Check prerequisites
# ──────────────────────────────────────────────
echo ""
printf "${BOLD}Checking prerequisites...${RESET}\n"

# 1a. Xcode command-line tools
if xcode-select -p &>/dev/null; then
  pass "Xcode command-line tools"
else
  fail "Xcode command-line tools not found"
  echo "       Install with: xcode-select --install"
  ERRORS=$((ERRORS + 1))
fi

# 1b. xcodebuild
if command -v xcodebuild &>/dev/null; then
  XCODE_VERSION=$(xcodebuild -version 2>/dev/null | head -1)
  pass "xcodebuild ($XCODE_VERSION)"
else
  fail "xcodebuild not found"
  echo "       Install Xcode from the App Store"
  ERRORS=$((ERRORS + 1))
fi

# 1c. xcodegen
if command -v xcodegen &>/dev/null; then
  XCODEGEN_VERSION=$(xcodegen --version 2>/dev/null)
  pass "xcodegen ($XCODEGEN_VERSION)"
else
  fail "xcodegen not found"
  echo "       Install with: brew install xcodegen"
  ERRORS=$((ERRORS + 1))
fi

# 1d. Simulator runtime — check that the target device exists
if xcrun simctl list devices available 2>/dev/null | grep -q "$SIMULATOR_NAME"; then
  pass "Simulator: $SIMULATOR_NAME"
else
  fail "Simulator '$SIMULATOR_NAME' not found"
  echo "       Available simulators:"
  xcrun simctl list devices available 2>/dev/null | grep "iPhone" | head -5 | sed 's/^/         /'
  echo "       You may need to download a newer iOS runtime in Xcode → Settings → Platforms."
  ERRORS=$((ERRORS + 1))
fi

# Bail early if any prerequisites are missing
if [ $ERRORS -gt 0 ]; then
  echo ""
  printf "  ${RED}${BOLD}SETUP FAILED${RESET} — fix the issues above and re-run.\n\n"
  exit 1
fi

# ──────────────────────────────────────────────
# Step 2: Regenerate Xcode project
# ──────────────────────────────────────────────
echo ""
printf "${BOLD}Regenerating Xcode project...${RESET}\n"

cd "$IOS_DIR"
xcodegen generate --quiet 2>/dev/null || xcodegen generate
pass "project.yml → BradOS.xcodeproj"
cd "$PROJECT_DIR"

# ──────────────────────────────────────────────
# Step 3: Build sanity check
# ──────────────────────────────────────────────
echo ""
printf "${BOLD}Running build sanity check...${RESET}\n"
printf "  ${DIM}(this may take a few minutes on first run — SPM packages need to resolve)${RESET}\n"

BUILD_LOG="$PROJECT_DIR/.validate/ios-build.log"
mkdir -p "$PROJECT_DIR/.validate"

if xcodebuild -project "$IOS_DIR/BradOS.xcodeproj" \
  -scheme BradOS \
  -destination "platform=iOS Simulator,name=$SIMULATOR_NAME" \
  -derivedDataPath "$DERIVED_DATA" \
  -skipPackagePluginValidation \
  build \
  > "$BUILD_LOG" 2>&1; then
  pass "xcodebuild build succeeded"
else
  fail "xcodebuild build failed"
  echo "       See log: .validate/ios-build.log"
  echo "       Tail with: tail -30 .validate/ios-build.log"
  exit 1
fi

# ──────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────
echo ""
printf "  ${GREEN}${BOLD}SETUP COMPLETE${RESET}\n"
echo ""
echo "  Next steps:"
echo "    # Boot the simulator"
echo "    xcrun simctl boot '$SIMULATOR_NAME'"
echo ""
echo "    # Install the app"
echo "    xcrun simctl install booted $DERIVED_DATA/Build/Products/Debug-iphonesimulator/BradOS.app"
echo ""
echo "    # Launch the app"
echo "    xcrun simctl launch booted com.bradcarter.brad-os"
echo ""
```

**Key design decisions:**
- **Same color/formatting conventions** as `validate.sh` (✓/✗ markers, `GREEN`/`RED`/`BOLD`/`RESET`).
- **Same `SCRIPT_DIR`/`PROJECT_DIR` pattern** as `start-emulators.sh`.
- **Build log goes to `.validate/ios-build.log`** — matches the project convention of logging verbose output to `.validate/` and printing summaries.
- **`--quiet` flag for xcodegen** with fallback (older versions don't support it).
- **Hardcoded `iPhone 17 Pro`** — matches every reference in `docs/guides/ios-build-and-run.md`, `explore-ios.md`, and `project.yml` destination strings.
- **Idempotent** — safe to re-run; regenerates the project and rebuilds every time.
- **No `set -u`** — matches `start-emulators.sh` and `deploy-functions.sh` style (only `validate.sh` uses `-u`).
- **No `-sdk` flag on xcodebuild** — per `docs/guides/ios-build-and-run.md`: "Do NOT pass -sdk flag — it breaks the watchOS companion build."
- **`-skipPackagePluginValidation`** — required for SwiftLint SPM build plugin in CLI builds (per the same guide).

### 2. No other files need changes

The references in `docs/guides/ios-build-and-run.md` (line 8) and `.claude/commands/explore-ios.md` (line 13) already point to `./scripts/setup-ios-testing.sh` with correct instructions. No docs need updating.

---

## Tests

This is a shell script, not application code — no vitest unit tests are needed (shell scripts aren't covered by the vitest test suite, matching the convention from `start-emulators.sh`, `deploy-functions.sh`, etc.).

**Verification is done via QA (below).**

Pre-commit verification: run `npm run validate` to confirm the new file doesn't break typecheck, lint, tests, or architecture checks (it shouldn't — it's a standalone `.sh` file not imported by anything).

---

## QA

### 1. Verify the script is executable and runs
```bash
chmod +x scripts/setup-ios-testing.sh
./scripts/setup-ios-testing.sh
```
Expected: all 4 prerequisite checks pass (✓), project regenerates, build succeeds, "SETUP COMPLETE" printed.

### 2. Verify prerequisite failure handling
```bash
# Temporarily hide xcodegen to simulate missing tool
PATH_BACKUP="$PATH"
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v homebrew | tr '\n' ':')
./scripts/setup-ios-testing.sh
# Expected: ✗ xcodegen not found, install command printed, SETUP FAILED, exit 1
export PATH="$PATH_BACKUP"
```

### 3. Verify build log capture
```bash
# After running the script:
ls -la .validate/ios-build.log
# Should exist and contain xcodebuild output
wc -l .validate/ios-build.log
# Should have substantial output (hundreds of lines)
```

### 4. Verify the next-step commands work
```bash
# After setup completes, run the printed commands:
xcrun simctl boot 'iPhone 17 Pro'
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
# App should launch in the simulator
```

### 5. Verify idempotency
```bash
# Run a second time:
./scripts/setup-ios-testing.sh
# Should succeed again with no errors
```

### 6. Verify the reference chain works end-to-end
Follow the docs literally:
1. Open `docs/guides/ios-build-and-run.md`
2. Run the setup command on line 8: `./scripts/setup-ios-testing.sh`
3. Proceed with the "Building and Running" section commands
4. Confirm the app builds and launches

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing to ensure nothing is broken.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — QA**: Exercise the script manually — actually run it and verify the simulator build works, don't just check that it parses.
6. **Shell script style**: Match existing scripts (`set -e`, `SCRIPT_DIR`/`PROJECT_DIR` pattern, emoji log markers, color codes matching `validate.sh`).
7. **`.validate/` for logs**: Verbose build output goes to `.validate/ios-build.log`, matching the project pattern of keeping noisy output out of the terminal.
