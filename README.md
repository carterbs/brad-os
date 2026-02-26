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

```text
brad-os/
├── ios/BradOS/          # Native SwiftUI iOS app (XcodeGen project)
│   ├── BradOS/          # Main app target
│   ├── BradOSCore/      # Shared framework (models, services)
│   ├── BradOSWatch/     # watchOS companion
│   ├── BradOSWidget/    # Home screen widgets
│   └── project.yml      # XcodeGen spec
├── packages/functions/  # Firebase Cloud Functions (Express + Firestore)
│   └── src/
│       ├── routes/      # Express route handlers
│       ├── schemas/     # Zod validation schemas
│       ├── types/       # Shared TypeScript types
│       └── services/    # Business logic
├── docs/                # Conventions, architecture maps, guides
└── scripts/             # Dev tooling (validate, seed, lint)
```

- **iOS App** — SwiftUI app with shared APIClient, App Check auth, and HealthKit integration
- **Cloud Functions** — Express APIs deployed as Firebase Cloud Functions, backed by Firestore
- **Emulators** — Local dev uses Firebase emulator suite (Functions on :5001, Firestore on :8080)

## Development

See **[Local Dev Quickstart](docs/guides/local-dev-quickstart.md)** for the full 5-minute bootstrap flow.

```bash
npm install              # Install dependencies (also sets up git hooks)
npm run validate         # Full check: typecheck + lint + test + architecture
npm run emulators        # Start Firebase emulators (port 5001)
npm run build            # Build Cloud Functions
npm run typecheck        # TypeScript compilation
npm run lint             # Oxlint checks
npm run test             # Unit tests
```

## iOS App

See **[iOS Build and Run](docs/guides/ios-build-and-run.md)** for the full guide.

```bash
# Generate Xcode project from project.yml
cd ios/BradOS && xcodegen generate && cd ../..

# Build for simulator
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

# Install and launch
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```
