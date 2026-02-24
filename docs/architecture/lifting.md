# Lifting

## Data Flow
View -> AppState/WorkoutStateManager -> APIClient -> Cloud Function Handler -> Service -> Firestore

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Lifting/LiftingTabView.swift` — tab container (Meso, Plans, Exercises)
  - `ios/BradOS/BradOS/Views/Lifting/MesoView.swift` — active mesocycle view
  - `ios/BradOS/BradOS/Views/Lifting/MesoView+Components.swift` — mesocycle UI components
  - `ios/BradOS/BradOS/Views/Lifting/PlansView.swift` — plan list/management
  - `ios/BradOS/BradOS/Views/Lifting/PlansView+Components.swift` — plan UI components
  - `ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift` — exercise library
  - `ios/BradOS/BradOS/Views/Lifting/ExerciseHistoryView.swift` — per-exercise history
  - `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift` — active workout tracking
  - `ios/BradOS/BradOS/Views/Lifting/WorkoutView+UI.swift` — workout UI components
  - `ios/BradOS/BradOS/Views/Lifting/WorkoutView+Actions.swift` — workout action handlers
  - `ios/BradOS/BradOS/Views/Lifting/WorkoutView+State.swift` — local state helpers & rest timer
  - `ios/BradOS/BradOS/Views/Lifting/WorkoutSetViews.swift` — individual set logging UI
- **ViewModels:**
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/ExercisesViewModel.swift` — exercise list logic
  - `ios/BradOS/BradOS/ViewModels/ExerciseHistoryViewModel.swift` — exercise history logic
- **Models:**
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Workout.swift` — Workout, WorkoutSet types
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Exercise.swift` — Exercise type
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/WorkoutStateManager.swift` — pending edits & rest timer

## Backend Layer
- **Handlers:**
  - `packages/functions/src/handlers/exercises.ts` — exercise CRUD + history
  - `packages/functions/src/handlers/plans.ts` — plan CRUD + days + day exercises
  - `packages/functions/src/handlers/mesocycles.ts` — mesocycle lifecycle (create/start/complete/cancel)
  - `packages/functions/src/handlers/workouts.ts` — workout CRUD + start/complete/skip + sets
  - `packages/functions/src/handlers/workoutSets.ts` — set log/skip/unlog
- **Services:**
  - `packages/functions/src/services/workout.service.ts` — workout creation & completion logic
  - `packages/functions/src/services/workout-set.service.ts` — set logging with progression
  - `packages/functions/src/services/mesocycle.service.ts` — mesocycle start (generates workouts)
  - `packages/functions/src/services/progression.service.ts` — progressive overload calculations
  - `packages/functions/src/services/dynamic-progression.service.ts` — dynamic weight/rep adjustments
  - `packages/functions/src/services/plan-modification.service.ts` — mid-cycle plan changes
- **Repositories:**
  - `packages/functions/src/repositories/exercise.repository.ts`
  - `packages/functions/src/repositories/plan.repository.ts`
  - `packages/functions/src/repositories/plan-day.repository.ts`
  - `packages/functions/src/repositories/plan-day-exercise.repository.ts`
  - `packages/functions/src/repositories/mesocycle.repository.ts`
  - `packages/functions/src/repositories/workout.repository.ts`
  - `packages/functions/src/repositories/workout-set.repository.ts`
- **Schemas:**
  - `packages/functions/src/schemas/exercise.schema.ts`
  - `packages/functions/src/schemas/plan.schema.ts`
  - `packages/functions/src/schemas/mesocycle.schema.ts`
  - `packages/functions/src/schemas/workout.schema.ts`
- **Types:**
  - `packages/functions/src/types/progression.ts` — ExerciseProgression, WeekTargets, NextWeekResponse
  - `packages/functions/src/types/plan-modification.ts` — mid-cycle modification types

## Firestore Collections
- `exercises` — exercise library (default + custom)
- `plans` — workout plan templates
- `plan_days` — days within a plan
- `plan_day_exercises` — exercises configured per plan day
- `mesocycles` — 6-week training blocks
- `workouts` — individual workout instances
- `workout_sets` — sets within workouts

## Key Endpoints
- `GET /api/exercises` — list all (default + custom)
- `GET /api/exercises/:id/history` — exercise performance history
- `POST /api/plans` — create plan with days/exercises
- `POST /api/mesocycles` — create mesocycle from plan
- `PUT /api/mesocycles/:id/start` — start mesocycle (generates workouts)
- `GET /api/workouts/today` — get today's workout
- `PUT /api/workouts/:id/start` — begin workout
- `PUT /api/workouts/:id/complete` — finish workout
- `PUT /api/workout-sets/:id/log` — log weight/reps for a set
- `PUT /api/workout-sets/:id/skip` — skip a set

## Notes
- Progressive overload: odd weeks +1 rep, even weeks +weight (default 5 lbs per exercise)
- Mesocycle = 6 training weeks + 1 deload week (50% volume)
- WorkoutView uses @State-based local state (no separate ViewModel class) with WorkoutStateManager for pending edits
- LiftingTabView has 3 sub-tabs: Meso (active cycle), Plans (templates), Exercises (library)
