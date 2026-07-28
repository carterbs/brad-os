# Retire Cycling Coach, Keep Strava Context

Status: Completed 2026-07-27

## Goal

Remove the standalone cycling coaching product and all Peloton-style ride prescriptions while preserving cycling as an input to the unified Today Coach.

## Product boundary

Keep:

- Strava OAuth, webhook ingestion, manual sync, and token handling.
- BradOS's Firestore copy of Strava activities and streams.
- Cycling-derived context that helps Today Coach interpret recovery and recent workload.
- Cycling activities in shared history/calendar surfaces.

Remove:

- Cycling-specific Today, training-block, recommendation, and history screens.
- Peloton class, target-zone, target-TSS, and "next ride" recommendations.
- Eight-week cycling plans and training-block setup.
- The standalone cycling-coach API, OpenAI prompt, and schedule generator.
- Cycling-specific onboarding and FTP/training-block settings.

## Implementation

1. Simplify Today Coach's cycling input to observed ride context: recent rides, aggregate training load, and the latest ride's measured stream summary.
2. Remove the cycling recommendation section from the Today Coach response contract, prompt, fallback, backend tests, and iOS rendering.
3. Delete the standalone cycling coach handler/service/prompt and its registration.
4. Retain the cycling data and Strava APIs required for ingestion, synchronization, storage, and Today Coach aggregation; remove training-block endpoints and planning-only types.
5. Remove standalone cycling navigation, view models, screens, onboarding, FTP entry, and training-block setup from iOS.
6. Keep Strava Connection in Profile under a neutral Connections section and update its copy to describe ride sync for wellness context.
7. Update current architecture documentation to describe cycling as an ingested data source rather than a coaching destination.

## Verification

- Backend typecheck and focused tests for Today Coach, cycling ingestion, Strava webhook/tasks, calendar, and app routing.
- Full `npm run validate`.
- Regenerate the Xcode project after Swift file deletion.
- Build and launch the iOS app in the simulator.
- Verify Profile still exposes Strava Connection and Today Coach renders without a cycling prescription section.
