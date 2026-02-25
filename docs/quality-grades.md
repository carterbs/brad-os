# Domain Quality Grades

Last updated: 2026-02-25

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
| Lifting | **A** | High (23) | Medium (8) | 1225 | 2.2x | 92% | Yes | Yes | 5 handler, 6 service, 7 repo, 5 integration tests. Deepest test architecture with full repository, service, handler, and integration layers covered. |
| Meal Planning | **A** | High (16) | Medium (7) | 509 | 2.5x | 71% | Yes | Yes | 6 handler, 3 service, 5 repo, 1 integration, 1 schema tests. Broad multi-entity API surface covered at handler, service, and repository layers. |
| Cycling | **A** | High (11) | Low (2) | 566 | 2.2x | 53% | Yes | Yes | 3 handler, 7 service, 1 integration tests. Strong service-layer depth, but iOS tests remain the lightest among A-grade domains. |
| Stretching | **B+** | Medium (5) | Medium (4) | 134 | 2.6x | 99% | Yes | Yes | 2 handler, 2 repo, 1 integration tests. Near-perfect backend line coverage despite the smallest overall test suite. |
| Calendar | **B** | Low (3) | Low (3) | 220 | 2.5x | 100% | Yes | Yes | 1 handler, 1 service, 1 integration tests. Perfect backend coverage but carries the thinnest test suite of any domain. |
| Meditation | **B+** | Medium (6) | Medium (4) | 257 | 2.8x | 51% | Yes | Yes | 3 handler, 2 repo, 1 integration tests. API fully complete but low coverage signals significant untested logic paths. |
| Health Sync | **B-** | Medium (4) | Low (3) | 287 | 2.6x | 25% | Yes | Yes | 2 handler, 1 service, 1 integration tests. Lowest coverage in the project; HealthKit sync logic is substantially undertested. |
| History | **B-** | (shared) | (shared) | 0 | — | -- | Yes | Yes | Reuses Calendar backend/ViewModel. No additional tests needed, but filter logic is untested. |
| Today | **B** | Medium (4) | Low (3) | 93 | 2.3x | 67% | Yes | Yes | 1 handler, 2 service, 1 integration tests. AI briefing pipeline is now tested, but line coverage still has room to grow. |
| Profile | **B-** | (shared) | (shared) | 0 | — | -- | Yes | Yes | Settings hub, no own backend. Relies on health-sync and cycling backends. |

---

## Test File Inventory

### Backend (packages/functions/src/)

**Lifting (23 test files):**
- Handlers: exercises, mesocycles, plans, workoutSets, workouts
- Services: dynamic-progression, mesocycle, plan-modification, progression, workout-set, workout
- Repositories: exercise, mesocycle, plan-day-exercise, plan-day, plan, workout-set, workout
- Integration: exercises, mesocycles, plans, workoutSets, workouts

**Meal Planning (16 test files):**
- Handlers: barcodes, ingredients, mealplan-debug, mealplans, meals, recipes
- Services: mealplan-critique, mealplan-generation, mealplan-operations
- Repositories: barcode, ingredient, meal, mealplan-session, recipe
- Integration: meals
- Schemas: meal.schema

**Cycling (11 test files):**
- Handlers: cycling-coach, cycling, strava-webhook
- Services: cycling-coach, efficiency-factor, firestore-cycling, lifting-context, strava, training-load, vo2max
- Integration: cycling

**Meditation (6 test files):**
- Handlers: guidedMeditations, meditationSessions, tts
- Repositories: guided-meditation, meditationSession
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

- Lifting: ExerciseTests, MesocycleTests, PlanTests, WorkoutTests, WorkoutStateManagerTests, ExercisesViewModelTests, MealPlanViewModelTests, ExerciseHistoryViewModelTests (8)
- Meal Planning: MealPlanActionTests, MealPlanDecodingTests, MealPlanCacheServiceTests, RecipeCacheServiceTests, RemindersServiceTests, ShoppingListBuilderTests, ShoppingListFormatterTests (7)
- Stretching: StretchUrgencyTests, CompletedStretchTests, StretchDefinitionTests, StretchSessionTests (4)
- Meditation: GuidedMeditationComponentTests, GuidedMeditationScriptTests, MeditationSessionTests, MeditationStatsTests (4)
- Calendar: CalendarActivityTests, CalendarViewModelTests, APIClientCalendarTests (3)
- Today: DashboardViewModelTests, TodayCoachClientTests, TodayCoachCardStateTests (3)
- Profile: ProfileViewModelTests (1)
- Health Sync: HealthChartModelsTests, HealthSyncModelsTests, HealthMetricHistoryViewModelTests (3)
- Cycling: CyclingTestDoubles, CyclingViewModelTests (2)
- Shared: DateHelpersTests, TestHelpers, APIErrorTests, LoadStateTests (4)

### Untested Backend Files

All handler and service files have corresponding tests.

---

## Active Tech Debt

### Backend Refactor (from backend-refactor-handoff.md)

- [x] **Concrete BaseRepository** - Removed update control-flow duplication from GuidedMeditationRepository. Extracted `buildUpdatePayload()` hook into BaseRepository; child classes override only for domain-specific behavior. IngredientRepository and RecipeRepository retain intentional read-only guards.
- [ ] **Zod-only types** - Three-layer type duplication (DTO interfaces + Zod schemas + z.infer). Eliminate duplicate DTO interfaces, use `.partial()` for update schemas.
- [ ] **createResourceRouter factory** - No shared CRUD factory. Each handler manually wires the same REST patterns. Create `createResourceRouter` + `createBaseApp` + typed service errors.
- [ ] **Shared test utilities** - Duplicated Firestore mocks, fixtures, and handler setup across 11+ test files. Extract to `packages/functions/src/test-utils/`.
- [x] **Update CLAUDE.md with backend patterns** - After refactor tasks merge, document new BaseRepository, Zod-only, router factory, and test util patterns.

### Test Coverage Gaps

- [x] **Today Coach handler + services** - Handler, service, data service, and integration tests now cover the AI briefing pipeline.
- [x] **Guided Meditations handler** - No tests for `guidedMeditations.ts` (browse categories, fetch scripts).
- [x] **Firestore Recovery service** - No tests for `firestore-recovery.service.ts` (all health data CRUD).
- [x] **Firestore Cycling service** - No tests for `firestore-cycling.service.ts` (all cycling data CRUD).
- [x] **Cycling repo layer** - `CyclingActivityRepository` with comprehensive tests for user-scoped cycling activities and streams persistence.
- [x] **iOS Cycling unit tests** - CyclingViewModel has no unit tests in BradOSCore.

### Other

- [ ] **Calendar missing cycling activities** - Calendar aggregation only includes workouts, stretching, and meditation. Cycling activities not shown.
- [x] **No integration tests for Meal Planning** - 10 unit tests but zero integration tests.
- [x] **No integration tests for Cycling** - 7 unit tests but zero integration tests.

---

## Recently Completed

- [x] **Cycling integration tests** - `cycling.integration.test.ts` now covers the cycling API end-to-end.
- [x] **Guided Meditations handler tests** - `guidedMeditations.test.ts` now covers category browsing and script fetching.
- [x] **Firestore Recovery service tests** - `firestore-recovery.service.test.ts` now covers all health data CRUD.
- [x] **Firestore Cycling service tests** - `firestore-cycling.service.test.ts` now covers all cycling data CRUD.
- [x] **Meal Planning integration tests** - `meals.integration.test.ts` now covers the meal plan API end-to-end.
- [x] **iOS Cycling unit tests** - CyclingViewModel and all models moved to BradOSCore; full mock infrastructure and 15 unit tests added.
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
