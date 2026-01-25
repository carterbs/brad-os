# Lifting - Workout Tracker

A mobile-first workout tracker with stretching and meditation. Track progressive overload across 6-week mesocycles.

## Screenshots

| Today | Workout | Calendar |
|-------|---------|----------|
| ![Today](docs/screenshots/today.png) | ![Workout](docs/screenshots/workout-tracker.png) | ![Calendar](docs/screenshots/calendar.png) |

## Features

- **Workout Plans**: Build custom plans with exercises, sets, reps, and rest periods
- **Progressive Overload**: Automatic weight/rep progression across 6-week mesocycles
- **Stretch Routines**: Guided stretching sessions by body region
- **Meditation Timer**: Simple meditation with configurable duration
- **Activity Calendar**: Track all activities with visual history

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start client (3000) + server (3001)
npm run validate         # Run all checks (lint, types, tests)
npm run build            # Build all packages
```

## Structure

- `packages/shared` - Shared types/schemas
- `packages/server` - Express API + SQLite
- `packages/client` - React + Radix UI
- `e2e` - Playwright E2E tests

## Deployment

```bash
./scripts/deploy.sh      # Build + deploy to remote server
```
