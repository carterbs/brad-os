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
