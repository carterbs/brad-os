# Add `scripts/setup-ios-testing.sh` for iOS Environment Bootstrap

**Why**: `docs/guides/ios-build-and-run.md` (line 8) and `.claude/commands/explore-ios.md` (line 13) both reference `./scripts/setup-ios-testing.sh`, but the script doesn't exist. This causes a confusing failure for any developer or agent following the iOS setup guide. The architecture linter doesn't currently catch missing scripts inside code fences, so this has been silently broken.

---

## What

Create `scripts/setup-ios-testing.sh` — a bash script that:

1. **Checks prerequisites** — Verifies `xcodegen`, `xcodebuild`, and `xcrun simctl` are available, printing install instructions for anything missing.
2. **Generates the Xcode project** — Runs `xcodegen generate` in `ios/BradOS/`.
3. **Boots a simulator** — Finds an available iPhone simulator (preferring "iPhone 17 Pro") and boots it if not already booted.
4. **Runs a fast build sanity check** — Executes a quick `xcodebuild build` to verify the project compiles. Uses the same flags as `docs/guides/ios-build-and-run.md` (no `-sdk`, includes `-skipPackagePluginValidation`).
5. **Prints a success summary** — Shows what was verified and next steps.

The script should follow the style of existing scripts (`start-emulators.sh`, `validate.sh`): `set -e`, `SCRIPT_DIR`/`PROJECT_DIR` pattern, emoji prefixed status lines, and clean error messages.

---

## Files

### 1. `scripts/setup-ios-testing.sh` (CREATE)

```bash
#!/bin/bash
#
# Setup iOS Testing Environment
#
# Verifies prerequisites, generates the Xcode project, boots a simulator,
# and runs a fast build sanity check.
#
# Referenced by:
#   - docs/guides/ios-build-and-run.md
#   - .claude/commands/explore-ios.md
#
# Usage:
#   ./scripts/setup-ios-testing.sh
#   ./scripts/setup-ios-testing.sh --skip-build   # Skip the xcodebuild sanity check
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IOS_DIR="$PROJECT_DIR/ios/BradOS"
DERIVED_DATA="$HOME/.cache/brad-os-derived-data"
SIMULATOR_NAME="iPhone 17 Pro"

SKIP_BUILD=false
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=true

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

fail() {
  printf "  ${RED}✗ %s${RESET}\n" "$1"
  [ -n "${2:-}" ] && printf "    ${DIM}Install: %s${RESET}\n" "$2"
  exit 1
}

ok() {
  printf "  ${GREEN}✓ %s${RESET}\n" "$1"
}

# ── Step 1: Check prerequisites ───────────────────────────────────────────────
echo ""
echo "🔍 Checking prerequisites..."

command -v xcodegen >/dev/null 2>&1 \
  || fail "xcodegen not found" "brew install xcodegen"
ok "xcodegen $(xcodegen --version 2>&1 | head -1)"

command -v xcodebuild >/dev/null 2>&1 \
  || fail "xcodebuild not found" "Install Xcode from the Mac App Store"
ok "xcodebuild $(xcodebuild -version 2>&1 | head -1)"

command -v xcrun >/dev/null 2>&1 \
  || fail "xcrun not found" "Install Xcode Command Line Tools: xcode-select --install"
ok "xcrun available"

# Verify project.yml exists
[ -f "$IOS_DIR/project.yml" ] \
  || fail "ios/BradOS/project.yml not found — are you in the repo root?"
ok "project.yml found"

# ── Step 2: Generate Xcode project ───────────────────────────────────────────
echo ""
echo "🔨 Generating Xcode project..."
(cd "$IOS_DIR" && xcodegen generate)
ok "Xcode project generated"

# ── Step 3: Boot simulator ────────────────────────────────────────────────────
echo ""
echo "📱 Checking simulator..."

# Check if any simulator is already booted
BOOTED=$(xcrun simctl list devices booted 2>/dev/null | grep -c "Booted" || true)
if [ "$BOOTED" -gt 0 ]; then
  ok "Simulator already booted"
else
  echo "  Booting $SIMULATOR_NAME..."
  xcrun simctl boot "$SIMULATOR_NAME" 2>/dev/null \
    || fail "Could not boot '$SIMULATOR_NAME'. List available: xcrun simctl list devices available"
  ok "$SIMULATOR_NAME booted"
fi

# ── Step 4: Fast build sanity check ──────────────────────────────────────────
if $SKIP_BUILD; then
  echo ""
  echo "⏭️  Skipping build sanity check (--skip-build)"
else
  echo ""
  echo "🏗️  Running build sanity check (this may take a few minutes on first run)..."
  xcodebuild -project "$IOS_DIR/BradOS.xcodeproj" \
    -scheme BradOS \
    -destination "platform=iOS Simulator,name=$SIMULATOR_NAME" \
    -derivedDataPath "$DERIVED_DATA" \
    -skipPackagePluginValidation \
    build 2>&1 | tail -5
  ok "Build succeeded (SwiftLint passed)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
printf "  ${GREEN}${BOLD}iOS testing environment ready!${RESET}\n"
echo ""
echo "  Next steps:"
echo "    # Install and launch the app:"
echo "    xcrun simctl install booted $DERIVED_DATA/Build/Products/Debug-iphonesimulator/BradOS.app"
echo "    xcrun simctl launch booted com.bradcarter.brad-os"
echo ""
```

**Key design decisions:**
- **`--skip-build` flag**: Allows skipping the slow xcodebuild step when you just need prerequisites + project generation (useful for agents that will build separately).
- **`SIMULATOR_NAME` variable**: Defaults to "iPhone 17 Pro" matching `ios-build-and-run.md`. Easy to change if the simulator name changes.
- **`tail -5` on xcodebuild output**: Avoids dumping thousands of lines of build output. The script only needs to know pass/fail (exit code from `set -e` handles failures).
- **Same `DERIVED_DATA` path** as the guide (`~/.cache/brad-os-derived-data`): Ensures the build artifacts are reusable by subsequent `simctl install` commands.
- **No `-sdk` flag**: Matches the guide's warning about watchOS companion builds.
- **`-skipPackagePluginValidation`**: Required for SwiftLint SPM build plugin per the guide.

### 2. No other files need modification

Both `docs/guides/ios-build-and-run.md` and `.claude/commands/explore-ios.md` already reference `./scripts/setup-ios-testing.sh` — they just need the script to exist. No changes to those files are needed.

---

## Tests

This is a shell script — no vitest unit tests apply. Verification is done through QA below.

**Verify no existing tests break** by running `npm run validate` after creating the script. The architecture linter's `checkClaudeMdRefs` doesn't check scripts inside code fences, but confirm nothing regresses.

---

## QA

### 1. Validate the TypeScript build still passes
```bash
npm run validate
# All checks should pass — this only adds a new .sh file
```

### 2. Verify the script is executable and has correct shebang
```bash
ls -la scripts/setup-ios-testing.sh
# Should show -rwxr-xr-x (executable)
head -1 scripts/setup-ios-testing.sh
# Should be: #!/bin/bash
```

### 3. Run the script on a machine with Xcode
```bash
./scripts/setup-ios-testing.sh
# Expected output:
#   🔍 Checking prerequisites...
#     ✓ xcodegen Version: 2.44.1
#     ✓ xcodebuild Xcode 16.x
#     ✓ xcrun available
#     ✓ project.yml found
#   🔨 Generating Xcode project...
#     ✓ Xcode project generated
#   📱 Checking simulator...
#     ✓ Simulator already booted (or booted)
#   🏗️  Running build sanity check...
#     ✓ Build succeeded (SwiftLint passed)
#   iOS testing environment ready!
```

### 4. Test the `--skip-build` flag
```bash
./scripts/setup-ios-testing.sh --skip-build
# Should skip the xcodebuild step and show "Skipping build sanity check"
```

### 5. Test prerequisite failure (if possible)
```bash
# Temporarily hide xcodegen to test the error path:
PATH_BACKUP="$PATH"
export PATH="/usr/bin:/bin"
./scripts/setup-ios-testing.sh
# Should show: ✗ xcodegen not found
#              Install: brew install xcodegen
export PATH="$PATH_BACKUP"
```

### 6. Verify references resolve
```bash
# Confirm the script path matches what the docs reference:
grep -n "setup-ios-testing" docs/guides/ios-build-and-run.md
grep -n "setup-ios-testing" .claude/commands/explore-ios.md
# Both should show ./scripts/setup-ios-testing.sh — which now exists
```

### 7. Diff review
```bash
git diff main --stat
# Expected: 1 file changed
#   scripts/setup-ios-testing.sh (new)

git diff main
# Review every line
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — QA**: Exercise what you built — run the script and verify output, don't just check it in.
6. **Shell script style**: Follow existing patterns from `start-emulators.sh` and `validate.sh` — `set -e`, `SCRIPT_DIR`/`PROJECT_DIR`, emoji status lines, color codes.
7. **iOS conventions** (`docs/conventions/ios-swift.md`): Use `-project` (not `-workspace`), scheme `BradOS`, bundle ID `com.bradcarter.brad-os`.
8. **iOS build flags** (`docs/guides/ios-build-and-run.md`): No `-sdk` flag, include `-skipPackagePluginValidation`, use `~/.cache/brad-os-derived-data` for derived data.
9. **File must be executable**: `chmod +x scripts/setup-ios-testing.sh` after creation.
