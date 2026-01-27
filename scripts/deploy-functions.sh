#!/bin/bash
set -e

echo "=== Deploying Cloud Functions ==="

# Navigate to project root
cd "$(dirname "$0")/.."

echo "Building shared package..."
npm run build -w @brad-os/shared

echo "Building functions..."
npm run build -w @brad-os/functions

echo "Deploying to Firebase..."
firebase deploy --only functions

echo "=== Deployment complete! ==="
echo ""
echo "Functions deployed:"
echo "  - health"
echo "  - exercises"
echo "  - plans"
echo "  - mesocycles"
echo "  - workouts"
echo "  - workoutSets"
echo "  - stretchSessions"
echo "  - meditationSessions"
echo "  - calendar"
echo ""
echo "Function URLs: https://us-central1-brad-os.cloudfunctions.net/<function-name>"
