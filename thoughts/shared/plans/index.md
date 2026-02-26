# Implementation Plans Index

## Active

| Plan | Summary | Created |
|------|---------|---------|
| [rust-migrate-qa-start](active/2026-02-26-rust-migrate-qa-start.md) | Migrate `scripts/qa-start.sh` orchestration engine to Rust with parity contracts and >=90% coverage gate | 2026-02-26 |
| [rust-migrate-qa-stop](active/2026-02-26-rust-migrate-qa-stop.md) | Migrate `scripts/qa-stop.sh` teardown/lock lifecycle logic to Rust with parity and >=90% coverage | 2026-02-26 |
| [rust-migrate-validate](active/2026-02-26-rust-migrate-validate.md) | Migrate `scripts/validate.sh` parallel validation pipeline to Rust with unchanged `.validate` contracts | 2026-02-26 |
| [rust-migrate-doctor](active/2026-02-26-rust-migrate-doctor.md) | Migrate `scripts/doctor.sh` environment diagnostics to Rust with equivalent remediation output | 2026-02-26 |
| [rust-migrate-setup-ios-testing](active/2026-02-26-rust-migrate-setup-ios-testing.md) | Migrate `scripts/setup-ios-testing.sh` iOS bootstrap orchestration to Rust | 2026-02-26 |
| [rust-migrate-run-integration-tests](active/2026-02-26-rust-migrate-run-integration-tests.md) | Migrate `scripts/run-integration-tests.sh` emulator/test lifecycle runner to Rust | 2026-02-26 |
| [rust-migrate-pre-commit-hook](active/2026-02-26-rust-migrate-pre-commit-hook.md) | Migrate complex `hooks/pre-commit` routing/policy logic to Rust engine with shim hook | 2026-02-26 |
| [shell-complexity-guardrail](active/2026-02-26-shell-complexity-guardrail.md) | Add architecture lint check to prevent complex shell scripts from creeping back in | 2026-02-26 |
| [agents-rust-dev-tooling-guidance](active/2026-02-26-agents-rust-dev-tooling-guidance.md) | Add explicit agent guidance to prefer Rust for non-trivial dev tooling | 2026-02-26 |
| [google-auth-phase1](active/2026-02-11-google-auth-phase1.md) | Google OAuth via Firebase Auth to gate app access and verify ID tokens | 2026-02-11 |
| [usage-instrumentation](active/2026-02-11-usage-instrumentation.md) | Self-instrumentation for Cloud Functions to track API usage against free-tier limits | 2026-02-11 |
| [training-block-enhancement](active/2026-02-09-training-block-enhancement.md) | Configurable cycling schedule + Peloton-aware AI coach recommendations (Draft) | 2026-02-09 |

## Completed

| Plan | Summary | Completed |
|------|---------|-----------|
| [oxlint-migration](completed/2026-02-26-oxlint-migration.md) | Speed-first legacy-lint to Oxlint migration with strict no-`any` enforcement and staged type-aware unsafe checks | 2026-02-26 |
| [today-coach](completed/2026-02-09-today-coach.md) | Holistic daily AI briefing aggregating all activity domains | ~2026-02-09 |
| [ai-cycling-coach](completed/2026-02-08-ai-cycling-coach.md) | AI-powered cycling coach with HealthKit + Strava + Peloton integration | ~2026-02-08 |
| [vo2-max-estimation](completed/2026-02-08-vo2-max-estimation.md) | Estimated VO2 max from cycling power/HR data with Efficiency Factor trend | ~2026-02-08 |
| [weight-goal](completed/2026-02-08-weight-goal.md) | Functional weight goal tracking replacing mock data | ~2026-02-08 |
| [meal-plan-widget](completed/2026-02-05-meal-plan-widget.md) | WidgetKit home screen widget showing today's meal plan | ~2026-02-05 |
| [meal-plan-caching](completed/2026-02-05-meal-plan-caching.md) | Disk-based caching layer for finalized meal plan sessions | ~2026-02-05 |
| [aurora-glass-redesign](completed/2026-02-01-aurora-glass-redesign.md) | Full app UI rewrite to visionOS-inspired glassmorphism design system | ~2026-02-01 |
| [guided-meditation-tts](completed/2026-02-01-guided-meditation-tts.md) | Meditation categories with TTS-backed guided audio pipeline | ~2026-02-01 |
| [mealplan-firebase-seeding](completed/2026-02-01-mealplan-firebase-seeding.md) | Firebase Firestore seeding for meal plan data (dev + prod) | ~2026-02-01 |
| [stretching-firebase-tts-migration](completed/2026-02-01-stretching-firebase-tts-migration.md) | Stretch definitions to Firestore + TTS audio replacing bundled WAV files | ~2026-02-01 |
| [meal-plan-agent-critique-loop](completed/2026-01-31-meal-plan-agent-critique-loop.md) | Algorithmic meal plan generation + LLM-powered iterative critique loop | ~2026-01-31 |
| [meal-planner-sequencing](completed/2026-01-31-meal-planner-sequencing.md) | Sequencing and parallelization plan for meal planner implementation | ~2026-01-31 |
| [mealplanner-firebase-migration](completed/2026-01-31-mealplanner-firebase-migration.md) | Meal planner Firebase schema and data migration from PostgreSQL | ~2026-01-31 |
| [shopping-list-generation](completed/2026-01-31-shopping-list-generation.md) | Client-side shopping list from cached ingredient/recipe data | ~2026-01-31 |
| [post-workout-stretch-prompt](completed/2026-01-28-post-workout-stretch-prompt.md) | Alert after workout completion offering to start a stretch session | ~2026-01-28 |
| [warmup-sets](completed/2026-01-28-warmup-sets.md) | Automatic warm-up sets at 40%/60% of working weight (API-computed) | ~2026-01-28 |
| [api-key-auth](completed/2026-01-27-api-key-auth.md) | Firebase App Check setup for API request verification | ~2026-01-27 |
| [cloud-functions-migration](completed/2026-01-27-cloud-functions-migration.md) | Express server to Firebase Cloud Functions v2 migration | ~2026-01-27 |
| [comprehensive-testing](completed/2026-01-27-comprehensive-testing.md) | Testing infrastructure with mock repos, fixtures, and vitest setup | ~2026-01-27 |
| [firebase-emulator](completed/2026-01-27-firebase-emulator.md) | Firebase Emulators with seed data and App Check bypass | ~2026-01-27 |
| [ios-api-client](completed/2026-01-26-ios-api-client.md) | Foundational iOS networking layer for Brad OS server API | ~2026-01-26 |
| [ios-api-url-config](completed/2026-01-26-ios-api-url-config.md) | iOS API base URL configuration for different environments | ~2026-01-26 |
| [ios-calendar-history](completed/2026-01-26-ios-calendar-history.md) | iOS Calendar and History views with ViewModel and live API data | ~2026-01-26 |
| [ios-dashboard](completed/2026-01-26-ios-dashboard.md) | iOS Dashboard (Today) with activity cards for workout/stretch/meditation | ~2026-01-26 |
| [ios-exercise-library](completed/2026-01-26-ios-exercise-library.md) | iOS Exercise Library with CRUD, history charts, and PR tracking | ~2026-01-26 |
| [ios-implementation-sequencing](completed/2026-01-26-ios-implementation-sequencing.md) | Optimal sequencing strategy for 8 iOS feature plans | ~2026-01-26 |
| [ios-meditation](completed/2026-01-26-ios-meditation.md) | iOS meditation with guided breathing, audio narration, and crash recovery | ~2026-01-26 |
| [ios-profile-settings](completed/2026-01-26-ios-profile-settings.md) | iOS Profile and Settings with activity stats and notification management | ~2026-01-26 |
| [ios-stretching](completed/2026-01-26-ios-stretching.md) | iOS stretching with guided sessions, audio narration, and Spotify | ~2026-01-26 |
| [ios-unit-testing](completed/2026-01-26-ios-unit-testing.md) | iOS unit test coverage with Swift Testing via Swift Package architecture | ~2026-01-26 |
| [ios-workout-tracking](completed/2026-01-26-ios-workout-tracking.md) | iOS workout tracking with mesocycle view, set logging, and rest timers | ~2026-01-26 |
| [stretch-session-detail-page](completed/2026-01-26-stretch-session-detail-page.md) | Detailed stretch session history with individual stretch data | ~2026-01-26 |
| [rename-to-brad-os](completed/2026-01-25-rename-to-brad-os.md) | Repository rename from lifting to brad-os with scope codemod | ~2026-01-25 |
| [activity-launcher-model](completed/2026-01-25-activity-launcher-model.md) | Activity launcher model for BradOS app navigation | ~2026-01-25 |
| [calendar-view](completed/2026-01-24-calendar-view.md) | Calendar view with activity dot indicators | ~2026-01-24 |
| [guided-meditation](completed/2026-01-24-guided-meditation.md) | Guided meditation sessions implementation | ~2026-01-24 |
| [narrated-stretching](completed/2026-01-24-narrated-stretching.md) | Narrated stretching sessions with TTS audio generation | ~2026-01-24 |
| [exercise-history-charts](completed/2026-01-23-exercise-history-charts.md) | Exercise history with charts visualization | ~2026-01-23 |
| [calendar-view-combined](completed/calendar-view-combined.md) | Combined calendar view implementation plans | ~2026-01-24 |

## Content Data (not plans)

The `stretching/` and `meditation/` subdirectories contain stretch definitions and meditation scripts used as source data, not implementation plans.
