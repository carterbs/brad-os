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
