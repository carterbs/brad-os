# brad-os

A personal operating system for tracking wellness and fitness. Built as a learning project that I actually use daily. Currently focused on workouts, stretching, meditation, and meal planning—will expand as needed.

## Screenshots

<p align="center">
  <img src="docs/meal-plan.png" width="250" alt="Weekly Meal Plan" />
  <img src="docs/lifting.png" width="250" alt="Workout Session" />
  <img src="docs/stretching.png" width="250" alt="Stretching Session" />
  <img src="docs/meal-plan-widget.png" width="250" alt="Meal Plan Widget" />
</p>

## Features

### 🍽️ Meal Planning
- Weekly meal plans with breakfast, lunch, and dinner
- Generate grocery lists from meal plans
- Home screen widget showing today's meals at a glance
- Disk cache with App Group sharing for instant widget updates

### 🏋️ Weightlifting
- 6-week mesocycle training with automatic progression
- Track warmup sets and working sets
- Real-time workout tracking with rest timers

### 🧘 Guided Stretching
- Target specific body regions (neck, shoulders, back, hip flexors, glutes, hamstrings, quads, calves)
- Customizable duration per region (1-2 minutes)
- Session timer with progress tracking
- Optional Spotify playlist integration

### 🧠 Meditation
- Configurable meditation timer
- Simple, distraction-free interface
- Session history tracking

### 📅 Activity Dashboard
- Today view showing current meal plan and active workouts
- Unified calendar of all activities
- Quick access to all wellness features
- Activity history and streaks

## Architecture

- **iOS App**: Native SwiftUI app at `ios/BradOS/`
- **API Server**: Express + SQLite backend at `packages/server/`
- **Shared Types**: Common schemas/types at `packages/shared/`

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start API server (port 3001)
npm run build            # Build all packages
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint checks
npm run test             # Unit tests
```

## iOS App

```bash
# Build for simulator
xcodebuild -workspace ios/BradOS/BradOS.xcworkspace \
  -scheme BradOS \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```