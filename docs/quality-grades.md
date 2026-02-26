# Domain Quality Grades

Last updated: 2026-02-26

## Grading Methodology

Grades are based on four dimensions, with line coverage as the primary signal:

1. **Coverage Strength (Primary)** - Domain line coverage drives the baseline grade. 95%+ is top tier, 90-94% is strong, 80-89% is solid, below 80% degrades quickly.
2. **Test Quality** - Assertion density (assertions per test case) adjusts grades up/down to reward strong assertions and penalize weak checks.
3. **API Completeness** - Untested high-risk handlers/services and API gaps apply explicit penalties.
4. **iOS Completeness** - iOS test presence and feature completeness still influence the final grade.

**Grade scale:**
- **A** - Coverage is excellent and quality/completeness checks are strong.
- **B** - Coverage is good but quality/completeness has a meaningful gap.
- **C** - Coverage or quality is weak, or multiple completeness gaps exist.
- **D** - Significant gaps across multiple dimensions. Feature works but is fragile.
- **F** - Broken or non-functional.

Zero TODO/FIXME comments were found in the codebase (a positive signal for architecture health across all domains).

---

## Domain Grades

| Domain | Grade | Backend Tests | iOS Tests | Assertions | Density | Coverage | API Complete | iOS Complete | Notes |
|--------|-------|---------------|-----------|------------|---------|----------|--------------|--------------|-------|
| Lifting | **A** | High (23) | Medium (8) | 1225 | 2.2x | 92% | Yes | Yes | 5 handler, 6 service, 7 repo, 5 integration tests. Broadest test pyramid with handler, service, and repository layers each independently verified. |
| Meal Planning | **A** | High (16) | Medium (7) | 509 | 2.5x | 96% | Yes | Yes | 6 handler, 3 service, 5 repo, 1 integration, 1 schema tests. AI generation, critique, and barcode lookup pipelines each independently covered end-to-end. |
| Cycling | **A** | High (11) | Low (2) | 676 | 2.2x | 95% | Yes | Yes | 3 handler, 7 service, 1 integration tests. Strava integration and AI coach fully tested across the most expansive service layer. |
| Stretching | **B+** | Medium (5) | Medium (4) | 134 | 2.6x | 99% | Yes | Yes | 2 handler, 2 repo, 1 integration tests. Lean suite punches above its weight; every backend layer independently covered. |
| Calendar | **B+** | Medium (4) | Medium (4) | 243 | 2.5x | 100% | Yes | Yes | 1 handler, 1 service, 1 integration, 1 schema tests. Every backend layer covered; cycling activity aggregation is the only remaining known gap. |
| Meditation | **A** | High (10) | Medium (4) | 288 | 2.6x | 100% | Yes | Yes | 3 handler, 2 service, 2 repo, 1 integration, 2 schema tests. Full TTS-to-guided-session pipeline verified end-to-end from script generation through audio delivery. |
| Health Sync | **B+** | Medium (5) | Medium (4) | 315 | 2.4x | 100% | Yes | Yes | 2 handler, 1 service, 1 integration, 1 schema tests. HealthKit sync and recovery scoring covered across handler, service, and integration layers. |
| History | **B-** | (shared) | (shared) | 0 | — | -- | Yes | Yes | Reuses Calendar backend/ViewModel. No additional tests needed, but filter logic is untested. |
| Today | **B+** | Medium (4) | Medium (4) | 123 | 2.5x | 96% | Yes | Yes | 1 handler, 2 service, 1 integration tests. AI briefing pipeline covered end-to-end across handler, data service, and integration layers. |
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

**Meditation (10 test files):**
- Handlers: guidedMeditations, meditationSessions, tts
- Services: guided-meditation, tts
- Repositories: guided-meditation, meditationSession
- Integration: meditationSessions
- Schemas: meditation.schema, tts.schema

**Health Sync (5 test files):**
- Handlers: health-sync, health
- Services: firestore-recovery
- Integration: health
- Schemas: health-sync.schema

**Stretching (5 test files):**
- Handlers: stretchSessions, stretches
- Repositories: stretch, stretchSession
- Integration: stretchSessions

**Calendar (4 test files):**
- Handlers: calendar
- Services: calendar
- Integration: calendar
- Schemas: calendar.schema

**Today (4 test files):**
- Handlers: today-coach
- Services: today-coach-data, today-coach
- Integration: today-coach

**Other:** shared (1)

### iOS (BradOSCore/Tests/)

- Lifting: ExerciseTests, MesocycleTests, PlanTests, WorkoutTests, WorkoutStateManagerTests, ExercisesViewModelTests, MealPlanViewModelTests, ExerciseHistoryViewModelTests (8)
- Meal Planning: MealPlanActionTests, MealPlanDecodingTests, MealPlanCacheServiceTests, RecipeCacheServiceTests, RemindersServiceTests, ShoppingListBuilderTests, ShoppingListFormatterTests (7)
- Stretching: StretchUrgencyTests, CompletedStretchTests, StretchDefinitionTests, StretchSessionTests (4)
- Meditation: GuidedMeditationComponentTests, GuidedMeditationScriptTests, MeditationSessionTests, MeditationStatsTests (4)
- Calendar: CalendarActivityTests, CalendarRecentActivitiesTests, CalendarViewModelTests, APIClientCalendarTests (4)
- Today: DashboardViewModelTests, TodayCoachModelsTests, TodayCoachClientTests, TodayCoachCardStateTests (4)
- Profile: ProfileViewModelTests (1)
- Health Sync: HealthChartModelsTests, HealthSyncModelsTests, HealthMetricConfigurationTests, HealthMetricHistoryViewModelTests (4)
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

### Feature Gaps

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
