# Domain Quality Grades

Last updated: 2026-02-24

## Grading Methodology

Grades are based on four dimensions, each weighted equally:

1. **Test Coverage** - Count of backend test files (handler + service + repository + integration) and iOS test files per domain. High = 10+, Medium = 4-9, Low = 0-3.
2. **API Completeness** - Does the backend have all endpoints the iOS app needs? Are there handlers without tests?
3. **iOS Completeness** - Are all views, view models, and services present for the full user flow?
4. **Architecture Health** - Clean layer separation, no TODO/FIXME debt, schemas validated, proper typing.

**Grade scale:**
- **A** - All four dimensions are strong. High test coverage, complete API and iOS, clean architecture.
- **B** - Most dimensions are strong but one area has a gap (e.g., medium test coverage, or one untested handler).
- **C** - Multiple gaps. Low test coverage, missing tests for key services, or incomplete feature.
- **D** - Significant gaps across multiple dimensions. Feature works but is fragile.
- **F** - Broken or non-functional.

Zero TODO/FIXME comments were found in the codebase (a positive signal for architecture health across all domains).

---

## Domain Grades

| Domain | Grade | Backend Tests | iOS Tests | Assertions | Density | Coverage | API Complete | iOS Complete | Notes |
|--------|-------|---------------|-----------|------------|---------|----------|--------------|--------------|-------|
| Lifting | **A** | High (23) | Medium (6) | 1225 | 2.2x | -- | Yes | Yes | 5 handler, 6 service, 7 repo, 5 integration tests. |
| Meal Planning | **A** | High (12) | Medium (7) | 405 | 2.5x | -- | Yes | Yes | 4 handler, 3 service, 3 repo, 1 integration, 1 schema tests. 2 untested file(s). |
| Cycling | **B-** | Medium (9) | Low (0) | 461 | 2.0x | -- | Yes | Yes | 3 handler, 6 service tests. 1 untested file(s). |
| Stretching | **B** | Medium (5) | Low (2) | 134 | 2.6x | -- | Yes | Yes | 2 handler, 2 repo, 1 integration tests. |
| Calendar | **B** | Low (3) | Low (1) | 141 | 2.5x | -- | Yes | Yes | 1 handler, 1 service, 1 integration tests. |
| Meditation | **B** | Medium (5) | Low (1) | 175 | 2.7x | -- | Yes | Yes | 3 handler, 1 repo, 1 integration tests. |
| Health Sync | **B** | Medium (4) | Low (0) | 109 | 2.9x | -- | Yes | Yes | 2 handler, 1 service, 1 integration tests. |
| History | **B-** | (shared) | (shared) | 0 | — | -- | Yes | Yes | Reuses Calendar backend/ViewModel. No additional tests needed, but filter logic is untested. |
| Today | **B** | Medium (4) | Low (1) | 71 | 2.4x | -- | Yes | Yes | 1 handler, 2 service, 1 integration tests. |
| Profile | **B-** | (shared) | (shared) | 0 | — | -- | Yes | Yes | Settings hub, no own backend. Relies on health-sync and cycling backends. |

---

## Test File Inventory

### Backend (packages/functions/src/)

**Lifting (23 test files):**
- Handlers: exercises, mesocycles, plans, workoutSets, workouts
- Services: dynamic-progression, mesocycle, plan-modification, progression, workout-set, workout
- Repositories: exercise, mesocycle, plan-day-exercise, plan-day, plan, workout-set, workout
- Integration: exercises, mesocycles, plans, workoutSets, workouts

**Meal Planning (12 test files):**
- Handlers: ingredients, mealplans, meals, recipes
- Services: mealplan-critique, mealplan-generation, mealplan-operations
- Repositories: ingredient, meal, recipe
- Integration: meals
- Schemas: meal.schema

**Cycling (9 test files):**
- Handlers: cycling-coach, cycling, strava-webhook
- Services: cycling-coach, efficiency-factor, firestore-cycling, strava, training-load, vo2max

**Meditation (5 test files):**
- Handlers: guidedMeditations, meditationSessions, tts
- Repositories: meditationSession
- Integration: meditationSessions

**Stretching (5 test files):**
- Handlers: stretchSessions, stretches
- Repositories: stretch, stretchSession
- Integration: stretchSessions

**Health Sync (4 test files):**
- Handlers: health-sync, health
- Services: firestore-recovery
- Integration: health

**Today (4 test files):**
- Handlers: today-coach
- Services: today-coach-data, today-coach
- Integration: today-coach

**Calendar (3 test files):**
- Handlers: calendar
- Services: calendar
- Integration: calendar

**Other:** shared (1)

### iOS (BradOSCore/Tests/)

- Lifting: ExerciseTests, MesocycleTests, PlanTests, WorkoutTests, WorkoutStateManagerTests, ExercisesViewModelTests (6)
- Meal Planning: MealPlanActionTests, MealPlanDecodingTests, MealPlanCacheServiceTests, RecipeCacheServiceTests, RemindersServiceTests, ShoppingListBuilderTests, ShoppingListFormatterTests (7)
- Stretching: StretchUrgencyTests, StretchSessionTests (2)
- Meditation: MeditationSessionTests (1)
- Calendar: CalendarViewModelTests (1)
- Today: DashboardViewModelTests (1)
- Profile: ProfileViewModelTests (1)
- Shared: DateHelpersTests, TestHelpers, APIErrorTests, LoadStateTests (4)

### Untested Backend Files

These handlers/services have no corresponding test file:

| File | Domain | Risk |
|------|--------|------|
| `handlers/barcodes.ts` | Meal Planning | Low - uses createResourceRouter (generated CRUD) |
| `handlers/mealplan-debug.ts` | Meal Planning | Low - debug UI only |
| `services/lifting-context.service.ts` | Cycling | Medium - feeds cycling coach + today briefing with lifting data |

---

## Active Tech Debt

### Backend Refactor (from backend-refactor-handoff.md)

- [ ] **Concrete BaseRepository** - `findById`, `delete`, `update` duplicated across ~13 child repos. Make them concrete in `base.repository.ts`.
- [ ] **Zod-only types** - Three-layer type duplication (DTO interfaces + Zod schemas + z.infer). Eliminate duplicate DTO interfaces, use `.partial()` for update schemas.
- [ ] **createResourceRouter factory** - No shared CRUD factory. Each handler manually wires the same REST patterns. Create `createResourceRouter` + `createBaseApp` + typed service errors.
- [ ] **Shared test utilities** - Duplicated Firestore mocks, fixtures, and handler setup across 11+ test files. Extract to `packages/functions/src/test-utils/`.
- [ ] **Update CLAUDE.md with backend patterns** - After refactor tasks merge, document new BaseRepository, Zod-only, router factory, and test util patterns.

### Test Coverage Gaps

- [ ] **Today Coach handler + services** - Zero tests for the AI briefing pipeline (`today-coach.ts`, `today-coach.service.ts`, `today-coach-data.service.ts`).
- [ ] **Guided Meditations handler** - No tests for `guidedMeditations.ts` (browse categories, fetch scripts).
- [ ] **Firestore Recovery service** - No tests for `firestore-recovery.service.ts` (all health data CRUD).
- [ ] **Firestore Cycling service** - No tests for `firestore-cycling.service.ts` (all cycling data CRUD).
- [ ] **Cycling repo layer** - No repository tests for cycling (data stored in user subcollections, not top-level repos).
- [ ] **iOS Cycling unit tests** - CyclingViewModel has no unit tests in BradOSCore.

### Feature Gaps (from feature-gaps.md, top priorities)

- [ ] **Workout history + volume charts** - Data is collected but no analytics/review UI (exercise history charts partially done).
- [ ] **Personal records tracking** - No PR detection or display.
- [ ] **Body weight logging UI** - Weight data syncs from HealthKit but no dedicated tracking/graphing view beyond WeightGoalView.
- [ ] **RPE/RIR per set** - No effort tracking field on workout sets.
- [ ] **Data export (CSV)** - No export capability.

### Other

- [ ] **Calendar missing cycling activities** - Calendar aggregation only includes workouts, stretching, and meditation. Cycling activities not shown.
- [ ] **No integration tests for Meal Planning** - 10 unit tests but zero integration tests.
- [ ] **No integration tests for Cycling** - 7 unit tests but zero integration tests.

---

## Recently Completed

- [x] **LoadStateView + Error.displayMessage (iOS)** - Generic loading state wrapper. Migrated ExercisesView, ExerciseHistoryView, CalendarViewModel.
- [x] **Snake case encoder + CodingKeys cleanup (iOS)** - Added `snakeCaseEncoder` to APIClient, removed 6 manual CodingKeys enums.
- [x] **Architecture layer violation fixes** - Fixed all 51 iOS architecture layer violations (Views referencing Service types directly).
- [x] **Architecture lint consolidation** - Consolidated 5 separate lint scripts into single unified `lint-architecture.ts` runner.
- [x] **Exercise history charts** - Per-exercise history view with workout data visualization.
- [x] **Meal Plan widget** - BradOSWidget with MealPlanCacheService in App Group shared container.
- [x] **AI cycling coach** - OpenAI-powered training recommendations considering recovery, lifting interference, and Peloton class types.
- [x] **Today Coach AI briefing** - Daily wellness briefing aggregating all activity domains.
- [x] **Guided meditation with TTS** - Full guided meditation pipeline with pre-fetched TTS audio and script browsing.
- [x] **Stretching TTS narration** - Voice-guided stretching sessions with audio caching.
- [x] **HealthKit sync pipeline** - Bi-directional sync for HRV, RHR, sleep, weight with recovery scoring.
