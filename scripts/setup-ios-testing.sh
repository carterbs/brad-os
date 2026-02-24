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
