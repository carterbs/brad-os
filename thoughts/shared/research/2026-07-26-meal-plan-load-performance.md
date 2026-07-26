---
date: 2026-07-26
researcher: codex
git_commit: 45a1931dac2c7336ac90526c24008389d21e1183
branch: codex/mealplan-load-performance
topic: meal-plan cached load and refresh latency
tags: [ios, meal-planning, performance, firebase]
status: complete
---

# Research Question

Why does the iOS weekly meal-plan screen take seven to eight seconds to appear, and how can cached loads become effectively immediate while forced refresh remains reasonably fast?

# Summary

The existing disk cache is not a general screen cache. It only stores finalized sessions for the Today dashboard and widget. Draft sessions therefore reconstruct the screen through Cloud Functions on every new `MealPlanView`, even when the user reasonably expects the weekly plan to be cached.

For finalized sessions, the plan is published before shopping-list hydration, but `loadExistingSession()` still awaits a fresh per-screen `RecipeCacheService` that fetches ingredients and recipes serially. That work should be explicitly removed from the cached-load critical path and the recipe cache should be reused.

Forced refresh has a separate backend scaling issue: `GET /mealplans/latest` orders every Firestore session, downloads and fully parses all of them, then returns only the first. Live Cloud Run logs also show a warm request near 0.5 seconds and cold requests around three to five seconds. The user accepts three to four seconds for forced refresh, so this change will not add minimum instances; it will bound the query and keep current content visible during refresh.

# Detailed Findings

## iOS cache and rendering path

- `MealPlanView` creates a new view model when the conditional Meals tab is reconstructed and invokes `loadExistingSession()` from `.task`.
- `MealPlanViewModel.loadExistingSession()` accepts only a finalized `MealPlanCacheService` entry.
- Draft state is represented only by a saved session ID, so it requires a network request before rendering.
- A stale saved ID can create two sequential requests: session-by-ID, then latest.
- The cache service writes to the App Group and works in simulator data; the limitation is policy, not a categorically broken entitlement.
- Recipe hydration uses a new cache object per view and loads ingredients then recipes serially.

## Backend latest-session path

- `GET /mealplans/latest` calls `MealPlanSessionRepository.findAll()` and takes element zero.
- `findAll()` has no Firestore `limit`, and each document includes the plan, full meal snapshot, and critique history.
- Other repositories already implement the correct `orderBy(...).limit(1)` pattern.
- The unbounded query will become slower and more expensive as sessions accumulate.

## Live latency evidence

- Recent production `GET /mealplans/latest` requests ranged from about 0.5 seconds warm to roughly three to five seconds cold.
- In one 3.334-second request, the startup probe completed about 2.97 seconds after the request began.
- This demonstrates that cold start dominated that sample, not that every delay is a cold start.
- There is no application-level in-memory meal-plan response cache. Warm instances reuse the initialized process, Firebase Admin client, and network connections, and may benefit from lower-level client or platform caches.

## Observability gaps

- The existing iOS OTel HTTP span begins after App Check token acquisition.
- It ends before response validation and JSON decoding.
- There is no end-to-end cached-load or refresh timing around view-model state publication.
- Datadog is not integrated in this repo, so simulator OTel, unified logs, and Cloud Run request logs are the fastest path.

# Code References

| File | Description |
|------|-------------|
| `ios/BradOS/BradOS/Views/MealPlan/MealPlanView.swift` | Full-screen loading state and refresh action |
| `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift` | Cache, saved-session, latest-session, refresh, and shopping hydration flow |
| `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/MealPlanCacheService.swift` | Finalized-only App Group cache |
| `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/RecipeCacheService.swift` | Serial ingredient and recipe requests |
| `ios/BradOS/BradOS/App/DefaultServices.swift` | Fresh recipe cache created for each meal-plan view model |
| `ios/BradOS/BradOS/Services/APIClient.swift` | App Check and network span boundaries |
| `packages/functions/src/handlers/mealplans.ts` | Latest handler calls `findAll()` |
| `packages/functions/src/repositories/mealplan-session.repository.ts` | Unbounded ordered query and full-session parsing |

# Architecture Insights

The App Group cache serves two consumers with different requirements. Widgets and the Today dashboard must use only finalized plans, while the meal-plan editing screen needs fast restoration of both draft and finalized state. Keeping a second screen-state cache file preserves the finalized widget contract without forcing draft screens through the network.

# Historical Context

The finalized cache was introduced with the home-screen widget. A later fix moved `isLoading = false` ahead of shopping hydration, improving first publication without changing the cache's finalized-only scope.

# Open Questions

- The physical device's exact cache contents and decode result still need live verification; simulator cache files are valid.
- Simulator GUI profiling needs macOS unlocked to dismiss the first-launch Health permission sheet.
