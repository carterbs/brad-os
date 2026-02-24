#!/bin/bash
#
# Run Integration Tests with Firebase Emulators
#
# Starts emulators in the background, waits for readiness,
# runs integration tests, and always tears down cleanly.
#
# Usage:
#   ./scripts/run-integration-tests.sh
#   npm run test:integration:emulator
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

EMULATOR_PID=""
TEST_EXIT_CODE=1

cleanup() {
  if [ -n "$EMULATOR_PID" ]; then
    echo ""
    echo "🧹 Tearing down emulators (PID $EMULATOR_PID)..."
    # Kill the emulator process group (firebase spawns child processes)
    kill -- -"$EMULATOR_PID" 2>/dev/null || kill "$EMULATOR_PID" 2>/dev/null || true
    # Wait briefly for clean shutdown
    wait "$EMULATOR_PID" 2>/dev/null || true
    echo "✅ Emulators stopped."
  fi
}

# Always clean up, even on Ctrl+C or test failure
trap cleanup EXIT

# --- Step 1: Build ---
echo "🔨 Building functions..."
npm run build
echo ""

# --- Step 2: Start emulators in background (fresh database, no import/export) ---
echo "🚀 Starting emulators (fresh database)..."
# Use setsid to create a new process group so we can kill all children
# Fall back to plain background process if setsid is unavailable (macOS)
if command -v setsid &>/dev/null; then
  setsid firebase emulators:start --project brad-os &
  EMULATOR_PID=$!
else
  firebase emulators:start --project brad-os &
  EMULATOR_PID=$!
fi
echo "   Emulator PID: $EMULATOR_PID"
echo ""

# --- Step 3: Wait for readiness ---
"$SCRIPT_DIR/wait-for-emulator.sh" --timeout 120
WAIT_EXIT=$?
if [ $WAIT_EXIT -ne 0 ]; then
  echo "❌ Emulators failed to start. Aborting."
  exit 1
fi

echo ""

# --- Step 4: Run integration tests ---
echo "🧪 Running integration tests..."
npm run test:integration
TEST_EXIT_CODE=$?
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Integration tests passed."
else
  echo "❌ Integration tests failed (exit code $TEST_EXIT_CODE)."
fi

# cleanup runs via trap
exit $TEST_EXIT_CODE
