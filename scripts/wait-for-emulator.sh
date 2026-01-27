#!/bin/bash
#
# Wait for Firebase Emulator to be Ready
#
# This script waits for the emulator health endpoint to respond.
# Useful in CI pipelines to ensure the emulator is ready before running tests.
#
# Usage:
#   ./scripts/wait-for-emulator.sh
#   ./scripts/wait-for-emulator.sh --timeout 60  # Custom timeout in seconds
#

set -e

HEALTH_URL="${HEALTH_URL:-http://localhost:5000/api/dev/health}"
TIMEOUT="${2:-120}"  # Default 120 seconds
INTERVAL=2

echo "⏳ Waiting for emulator at $HEALTH_URL..."
echo "   Timeout: ${TIMEOUT}s"

start_time=$(date +%s)

while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -ge $TIMEOUT ]; then
    echo "❌ Timeout reached. Emulator did not become ready within ${TIMEOUT}s"
    exit 1
  fi

  # Try to hit the health endpoint
  if curl -s -f "$HEALTH_URL" > /dev/null 2>&1; then
    echo "✅ Emulator is ready! (took ${elapsed}s)"
    exit 0
  fi

  echo "   Waiting... (${elapsed}s elapsed)"
  sleep $INTERVAL
done
