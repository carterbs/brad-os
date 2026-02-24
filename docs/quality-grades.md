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

| Domain | Grade | Backend Tests | iOS Tests | Coverage | API Complete | iOS Complete | Notes |
|--------|-------|---------------|-----------|----------|--------------|--------------|-------|
| Lifting | **A** | High (23) | Medium (6) | 92% | Yes | Yes | 5 handler, 6 service, 7 repo, 5 integration tests. Full repository, service, and integration test coverage across all lifting layers. |
| Meal Planning | **B+** | High (12) | Medium (7) | 71% | Yes | Yes | 4 handler, 3 service, 3 repo, 1 integration, 1 schema tests. 2 untested file(s). Strong core coverage but barcode scanner and debug handlers remain untested. |
| Cycling | **B-** | Medium (9) | Low (0) | 53% | Yes | Yes | 3 handler, 6 service tests. 1 untested file(s). No iOS unit tests and the lifting-context service remain untested. |
| Stretching | **B-** | Medium (5) | Low (2) | 99% | Yes | Yes | 2 handler, 2 repo, 1 integration tests. Near-perfect branch coverage achieved with a very lean test suite. |
| Calendar | **B-** | Low (3) | Low (1) | 100% | Yes | Yes | 1 handler, 1 service, 1 integration tests. Achieves perfect coverage with just a handler, service, and one integration test. |
| Meditation | **B-** | Medium (5) | Low (1) | 51% | Yes | Yes | 3 handler, 1 repo, 1 integration tests. Below-average coverage likely reflects AI/TTS paths that are difficult to unit-test. |
| Health Sync | **C+** | Medium (4) | Low (0) | 25% | Yes | Yes | 2 handler, 1 service, 1 integration tests. Critical HealthKit sync logic has the project's weakest test coverage. |
| History | **B-** | (shared) | (shared) | -- | Yes | Yes | Reuses Calendar backend/ViewModel. No additional tests needed, but filter logic is untested. |
| Today | **B-** | Low (3) | Low (1) | 67% | Yes | Yes | 1 handler, 2 service tests. AI briefing pipeline is now fully tested, anchoring solid mid-range coverage. |
| Profile | **B-** | (shared) | (shared) | -- | Yes | Yes | Settings hub, no own backend. Relies on health-sync and cycling backends. |

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

**Calendar (3 test files):**
- Handlers: calendar
- Services: calendar
- Integration: calendar

**Today (3 test files):**
- Handlers: today-coach
- Services: today-coach-data, today-coach

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

- [ ] **Cycling repo layer** - No repository tests for cycling (data stored in user subcollections, not top-level repos).
- [ ] **iOS Cycling unit tests** - CyclingViewModel has no unit tests in BradOSCore.
- [ ] **Untested Meal Planning handlers** - `handlers/barcodes.ts` (Low risk) and `handlers/mealplan-debug.ts` (Low risk) have no tests.
- [ ] **Untested Cycling lifting-context service** - `services/lifting-context.service.ts` (Medium risk) has no tests.

### Feature Gaps (from feature-gaps.md, top priorities)

- [ ] **Workout history + volume charts** - Data is collected but no analytics/review UI (exercise history charts partially done).
- [ ] **Personal records tracking** - No PR detection or display.
- [ ] **Body weight logging UI** - Weight data syncs from HealthKit but no dedicated tracking/graphing view beyond WeightGoalView.
- [ ] **RPE/RIR per set** - No effort tracking field on workout sets.
- [ ] **Data export (CSV)** - No export capability.

### Other

- [ ] **Calendar missing cycling activities** - Calendar aggregation only includes workouts, stretching, and meditation. Cycling activities not shown.
- [ ] **No integration tests for Cycling** - 7 unit tests but zero integration tests.

---

## Recently Completed

- [x] **Meal Planning integration tests** - Added `meals.integration.test.ts` covering the meal planning pipeline end-to-end.
- [x] **Firestore Cycling service tests** - Tests added for `firestore-cycling.service.ts` (all cycling data CRUD).
- [x] **Firestore Recovery service tests** - Tests added for `firestore-recovery.service.ts` (all health data CRUD).
- [x] **Guided Meditations handler tests** - Tests added for `guidedMeditations.ts` (browse categories, fetch scripts).
- [x] **Today Coach handler + services tests** - Tests added for `today-coach.ts`, `today-coach.service.ts`, and `today-coach-data.service.ts`.
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
