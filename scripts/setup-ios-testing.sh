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

set -eo pipefail

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
