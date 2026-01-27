#!/bin/bash
#
# Start Firebase Emulators
#
# This script builds the functions and starts the Firebase emulators.
# By default, it uses seed data if available.
#
# Usage:
#   ./scripts/start-emulators.sh          # Start with seed data (if exists)
#   ./scripts/start-emulators.sh --fresh  # Start with empty database
#   ./scripts/start-emulators.sh --persist # Start with persistent data
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔨 Building shared package..."
npm run build -w @brad-os/shared

echo "🔨 Building functions..."
npm run build -w @brad-os/functions

# Parse arguments
MODE="${1:---seed}"

case "$MODE" in
  --fresh)
    echo "🚀 Starting emulators with fresh database..."
    firebase emulators:start
    ;;
  --persist)
    echo "🚀 Starting emulators with persistent data..."
    firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
    ;;
  --seed|*)
    if [ -d "./seed-data" ]; then
      echo "🌱 Starting emulators with seed data..."
      firebase emulators:start --import=./seed-data
    else
      echo "⚠️  No seed-data directory found. Starting fresh..."
      echo "   Run 'npm run seed:generate' while emulators are running to create seed data."
      firebase emulators:start
    fi
    ;;
esac
