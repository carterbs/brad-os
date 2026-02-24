# Add `scripts/setup-ios-testing.sh` referenced by `docs/guides/ios-build-and-run.md`

## Why

`docs/guides/ios-build-and-run.md` tells developers to run `./scripts/setup-ios-testing.sh` as the first step, but the script doesn't exist. Any agent or human following the guide hits a dead end immediately. Adding the script closes a documentation gap and provides a one-command way to verify the iOS toolchain is ready before attempting a build.

## What

Create `scripts/setup-ios-testing.sh` — a bash script that:

1. **Checks prerequisites** — verifies required tools are installed and usable:
   - `xcodebuild` (Xcode CLI tools)
   - `xcodegen` (project generation from `project.yml`)
   - `xcrun simctl` (simulator control)
2. **Generates the Xcode project** — runs `xcodegen generate` in `ios/BradOS/` so the `.xcodeproj` is up-to-date with `project.yml`.
3. **Boots a simulator** — ensures an "iPhone 17 Pro" simulator is available and booted (matches the destination used in the build guide).
4. **Runs a fast sanity build** — executes `xcodebuild build` with the same flags from the build guide but adds `CODE_SIGNING_ALLOWED=NO` to avoid provisioning issues in CI/agent environments, and uses `-quiet` for less noise. This confirms the full toolchain works end-to-end (Swift compilation, SPM dependency resolution, SwiftLint plugin).
5. **Reports a clear pass/fail summary** — green checkmarks for each step that passes, red X with actionable remediation for anything that fails.

The script is idempotent — safe to run multiple times. If the simulator is already booted, it skips that step. If the project is already generated, xcodegen regenerates it (fast no-op if unchanged).

## Files

### 1. `scripts/setup-ios-testing.sh` (create)

```bash
#!/bin/bash
set -euo pipefail

# Setup script for iOS Simulator testing
# Referenced by docs/guides/ios-build-and-run.md
#
# Checks prerequisites, generates the Xcode project, boots a simulator,
# and runs a fast sanity build to verify the toolchain works.
#
# Usage:
#   ./scripts/setup-ios-testing.sh              # Full setup + sanity build
#   ./scripts/setup-ios-testing.sh --skip-build  # Setup only, no build

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IOS_DIR="$PROJECT_DIR/ios/BradOS"
DERIVED_DATA="$HOME/.cache/brad-os-derived-data"
SIMULATOR_NAME="iPhone 17 Pro"

SKIP_BUILD=false
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=true

BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

pass() { printf "  ${GREEN}✓ %s${RESET}\n" "$1"; }
fail() { printf "  ${RED}✗ %s${RESET}\n" "$1"; printf "    ${DIM}%s${RESET}\n" "$2"; exit 1; }

printf "\n${BOLD}iOS Testing Setup${RESET}\n\n"

# --- 1. Check xcodebuild ---
if command -v xcodebuild &>/dev/null; then
  XCODE_VERSION=$(xcodebuild -version | head -1)
  pass "xcodebuild ($XCODE_VERSION)"
else
  fail "xcodebuild not found" "Install Xcode from the App Store, then run: xcode-select --install"
fi

# --- 2. Check xcodegen ---
if command -v xcodegen &>/dev/null; then
  XCODEGEN_VERSION=$(xcodegen --version 2>&1)
  pass "xcodegen ($XCODEGEN_VERSION)"
else
  fail "xcodegen not found" "Install with: brew install xcodegen"
fi

# --- 3. Check xcrun simctl ---
if xcrun simctl list devices &>/dev/null; then
  pass "xcrun simctl"
else
  fail "xcrun simctl not working" "Ensure Xcode CLI tools are installed: xcode-select --install"
fi

# --- 4. Generate Xcode project ---
printf "\n${BOLD}Generating Xcode project...${RESET}\n\n"
cd "$IOS_DIR"
xcodegen generate --quiet 2>/dev/null || xcodegen generate
pass "xcodegen generate (ios/BradOS/project.yml)"
cd "$PROJECT_DIR"

# --- 5. Boot simulator ---
printf "\n${BOLD}Preparing simulator...${RESET}\n\n"
BOOTED=$(xcrun simctl list devices booted | grep "$SIMULATOR_NAME" || true)
if [ -n "$BOOTED" ]; then
  pass "$SIMULATOR_NAME (already booted)"
else
  # Find the device UDID
  UDID=$(xcrun simctl list devices available | grep "$SIMULATOR_NAME" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)
  if [ -z "$UDID" ]; then
    fail "$SIMULATOR_NAME not found" "Available simulators: xcrun simctl list devices available"
  fi
  xcrun simctl boot "$UDID" 2>/dev/null || true
  pass "$SIMULATOR_NAME (booted: $UDID)"
fi

# --- 6. Sanity build ---
if $SKIP_BUILD; then
  printf "\n${DIM}  Skipping sanity build (--skip-build)${RESET}\n"
else
  printf "\n${BOLD}Running sanity build...${RESET}\n"
  printf "  ${DIM}This may take a few minutes on first run (SPM resolution + compilation)${RESET}\n\n"

  BUILD_LOG="$PROJECT_DIR/.validate/ios-setup-build.log"
  mkdir -p "$(dirname "$BUILD_LOG")"

  if xcodebuild \
    -project "$IOS_DIR/BradOS.xcodeproj" \
    -scheme BradOS \
    -destination "platform=iOS Simulator,name=$SIMULATOR_NAME" \
    -derivedDataPath "$DERIVED_DATA" \
    -skipPackagePluginValidation \
    CODE_SIGNING_ALLOWED=NO \
    build \
    > "$BUILD_LOG" 2>&1; then
    pass "Sanity build succeeded"
  else
    printf "  ${RED}✗ Sanity build failed${RESET}\n"
    printf "    ${DIM}Full log: $BUILD_LOG${RESET}\n"
    # Print last 20 lines of errors for quick diagnosis
    printf "    ${DIM}Last errors:${RESET}\n"
    grep -E "error:" "$BUILD_LOG" | tail -10 | while read -r line; do
      printf "    ${RED}%s${RESET}\n" "$line"
    done
    exit 1
  fi
fi

printf "\n  ${GREEN}${BOLD}Ready for iOS testing!${RESET}\n\n"
printf "  ${DIM}Build & install:${RESET}\n"
printf "  ${DIM}  xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS \\${RESET}\n"
printf "  ${DIM}    -destination 'platform=iOS Simulator,name=$SIMULATOR_NAME' \\${RESET}\n"
printf "  ${DIM}    -derivedDataPath ~/.cache/brad-os-derived-data \\${RESET}\n"
printf "  ${DIM}    -skipPackagePluginValidation build${RESET}\n"
printf "  ${DIM}  xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app${RESET}\n"
printf "  ${DIM}  xcrun simctl launch booted com.bradcarter.brad-os${RESET}\n\n"
```

Key design decisions:

| Decision | Rationale |
|----------|-----------|
| `set -euo pipefail` | Strict error handling, matching `validate.sh` conventions |
| `--skip-build` flag | Allows quick prerequisite checks without the expensive build step (~2-5min) |
| `CODE_SIGNING_ALLOWED=NO` | Lets the build succeed without provisioning profiles — agents and CI don't have signing identity |
| Build log to `.validate/ios-setup-build.log` | Follows the project convention of logging verbose output to `.validate/` |
| `xcodegen generate --quiet` with fallback | Older xcodegen versions may not support `--quiet` |
| Simulator boot is idempotent | `xcrun simctl boot` errors if already booted — suppress with `|| true` |
| Same `DERIVED_DATA` path as build guide | `~/.cache/brad-os-derived-data` — reuses cached artifacts from prior builds |
| No `-sdk` flag on xcodebuild | The build guide explicitly warns against this (breaks watchOS companion) |

### 2. `docs/guides/ios-build-and-run.md` (modify)

Expand the Setup section slightly to clarify what the script does:

```markdown
## Setup

Run the setup script to verify iOS toolchain prerequisites and run a sanity build:

```bash
./scripts/setup-ios-testing.sh              # Full setup + sanity build
./scripts/setup-ios-testing.sh --skip-build  # Check tools only, skip build
```

The script checks for `xcodebuild`, `xcodegen`, and `xcrun simctl`, generates the Xcode project from `project.yml`, boots an iPhone 17 Pro simulator, and runs a fast build to verify everything works.
```

### 3. `scripts/setup-ios-testing.sh` permissions

The file must be executable: `chmod +x scripts/setup-ios-testing.sh`

## Tests

This is a shell script (infrastructure tooling), not application logic. No vitest unit tests are needed. However, we validate correctness through:

1. **ShellCheck static analysis** — Run `shellcheck scripts/setup-ios-testing.sh` (if available) to catch common bash pitfalls. Fix any findings.

2. **Architecture lint compatibility** — Run `npm run lint:architecture` to ensure the new file doesn't violate any project structure rules.

3. **Idempotency test** — Run the script twice in succession. Second run should pass without errors and skip already-booted simulator.

## QA

This is the critical section — we must actually run the script and verify it works, not just check that the file exists.

### 1. Run the script from the worktree root

```bash
./scripts/setup-ios-testing.sh
```

**Verify:**
- All 6 checkmarks appear (xcodebuild, xcodegen, simctl, project generation, simulator boot, sanity build)
- The sanity build log exists at `.validate/ios-setup-build.log`
- The build log contains `BUILD SUCCEEDED`
- The script exits with code 0

### 2. Run with `--skip-build`

```bash
./scripts/setup-ios-testing.sh --skip-build
```

**Verify:**
- Tool checks and project generation run
- "Skipping sanity build" message appears
- Completes in under 10 seconds

### 3. Idempotency — run again

```bash
./scripts/setup-ios-testing.sh
```

**Verify:**
- Simulator shows "(already booted)"
- Build uses cached derived data (faster second run)
- Exits 0

### 4. Verify the docs match

Read `docs/guides/ios-build-and-run.md` and confirm the Setup section accurately describes how to invoke the script and what it does.

### 5. Verify build guide commands still work after setup

After the script succeeds, run the full build-and-launch sequence from the guide:

```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

This confirms the setup script left the environment in a correct state.

## Conventions

1. **CLAUDE.md — Worktree workflow**: All changes made in a worktree branch, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing (TypeScript checks won't be affected by a new `.sh` file, but this confirms nothing is broken).
3. **CLAUDE.md — Self-review**: `git diff main --stat` and `git diff main` before committing. Verify only the expected files are touched.
4. **CLAUDE.md — QA**: Actually run the script on the simulator — don't just verify the file exists.
5. **Shell script style**: Follow existing scripts' conventions — `set -e`/`set -euo pipefail`, `SCRIPT_DIR`/`PROJECT_DIR` pattern, colored output with `BOLD`/`GREEN`/`RED`/`RESET` matching `validate.sh`.
6. **docs/conventions/ios-swift.md — XcodeGen**: The script runs `xcodegen generate` which is the canonical way to regenerate the project.
7. **Build flags**: Match exactly what `docs/guides/ios-build-and-run.md` specifies — no `-sdk` flag, use `-skipPackagePluginValidation`, use `~/.cache/brad-os-derived-data` for derived data.
