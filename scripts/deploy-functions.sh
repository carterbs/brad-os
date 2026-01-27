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
echo "DEV Functions deployed:"
echo "  - devHealth, devExercises, devPlans, devMesocycles"
echo "  - devWorkouts, devWorkoutSets, devStretchSessions"
echo "  - devMeditationSessions, devCalendar"
echo ""
echo "PROD Functions deployed:"
echo "  - prodHealth, prodExercises, prodPlans, prodMesocycles"
echo "  - prodWorkouts, prodWorkoutSets, prodStretchSessions"
echo "  - prodMeditationSessions, prodCalendar"
echo ""
echo "Hosting URLs:"
echo "  DEV:  https://brad-os.web.app/api/dev/<endpoint>"
echo "  PROD: https://brad-os.web.app/api/prod/<endpoint>"
