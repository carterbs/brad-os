# Meal Plan Client-Side Caching Layer

## Overview

Add a disk-based caching layer for finalized meal plan sessions so they're loaded instantly from disk and never re-fetched from the API. The cache is bypassed when a new plan is generated, and a long-press gesture on the dashboard card allows manual cache invalidation.

## Current State Analysis

**Data flow today:**
- `MealPlanView` calls `viewModel.loadExistingSession()` on `.task` (`MealPlanView.swift:44`)
- `loadExistingSession()` tries the saved session ID from UserDefaults, then falls back to `getLatestMealPlanSession()` - both hit the API every time (`MealPlanViewModel.swift:85-121`)
- `DashboardViewModel.loadMealPlan()` also calls `getLatestMealPlanSession()` on every dashboard load (`DashboardViewModel.swift:129-145`)
- The session ID is persisted in UserDefaults (`MealPlanViewModel.swift:26,48-57`) but the actual session data is not

**What this means:** Every app launch, every dashboard visit, and every meal plan screen open triggers a network request for data that, once finalized, never changes.

**Existing caching pattern to follow:**
- `TTSAudioCache` (`TTSAudioCache.swift`) - FileManager-based disk cache using SHA256 keys in `.cachesDirectory`. Clean, simple, proven pattern.
- `RecipeCacheService` (`RecipeCacheService.swift`) - In-memory only, no persistence. Not the right pattern for this.

## Desired End State

- Finalized meal plan sessions are cached to disk after first fetch
- All subsequent loads hit disk cache first (instant, no spinner)
- Dashboard card loads instantly from cache
- Generating a new plan writes the new finalized session to cache
- Long-press on the dashboard meal plan card triggers a cache refresh
- Cache is scoped to the latest finalized session (only one session cached at a time)

## What We're NOT Doing

- Caching in-progress (non-finalized) sessions - these are actively being edited via the critique loop
- Caching recipe/ingredient data (already handled by `RecipeCacheService`)
- Any server-side cache headers or ETags
- Migration from existing UserDefaults session ID storage (keep it for in-progress sessions)

## Implementation Approach

Single `MealPlanCacheService` in BradOSCore that serializes the finalized `MealPlanSession` to disk as JSON. The ViewModel and DashboardViewModel check cache before hitting the API. The cache is stored in the **App Group shared container** (`group.com.bradcarter.brad-os`) so the iOS widget can also read cached meal plan data directly (see `thoughts/shared/plans/2026-02-05-meal-plan-widget.md`).

---

## Phase 0: App Group Entitlements

**Overview:** Set up the App Group entitlement that enables the shared container. This is a prerequisite for both caching and the widget.

**File: `ios/BradOS/BradOS/BradOS.entitlements`** (new)
- Add App Group: `group.com.bradcarter.brad-os`

**File: `ios/BradOS/project.yml`** (modify)
- Add entitlements file reference to the `BradOS` target settings:
  ```yaml
  CODE_SIGN_ENTITLEMENTS: BradOS/BradOS.entitlements
  ```

**Success criteria:**
- `xcodegen generate` produces a valid project
- App builds and runs with the entitlement

---

## Phase 1: MealPlanCacheService

**Overview:** Create the disk cache service for meal plan sessions.

**File: `BradOSCore/Sources/BradOSCore/Services/MealPlanCacheService.swift`** (new)
- `MealPlanCacheService` class with `shared` singleton
- Uses `FileManager` to read/write JSON to the App Group shared container at `group.com.bradcarter.brad-os/meal-plan-cache/`
- Falls back to `.cachesDirectory/meal-plan-cache/` if the App Group container is unavailable (e.g., in unit tests)
- Single file: `latest-session.json` (only one finalized plan matters at a time)
- Methods:
  - `getCachedSession() -> MealPlanSession?` - Read from disk, decode, return nil if missing/corrupt
  - `cache(_ session: MealPlanSession)` - Encode and write to disk (only if `isFinalized == true`)
  - `invalidate()` - Delete the cached file
  - `isCached(sessionId: String) -> Bool` - Check if the cached session matches a given ID (avoids unnecessary writes)
- Use `JSONEncoder`/`JSONDecoder` with the same date decoding strategy as the API client
- Protocol `MealPlanCacheServiceProtocol` for testability

**Success criteria:**
- Unit tests pass for read/write/invalidate/corrupt-data-handling
- Corrupt or missing files return nil gracefully (no crashes)

---

## Phase 2: Integrate Cache into MealPlanViewModel

**Overview:** Wire the cache service into the existing ViewModel so finalized sessions load from cache.

**File: `BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift`** (modify)
- Add `MealPlanCacheServiceProtocol` dependency via init injection (default: `.shared`)
- **`loadExistingSession()`** changes:
  1. Check `cacheService.getCachedSession()` first
  2. If cached session exists and is finalized -> use it, skip API call entirely, set `isLoading = false`
  3. If no cache -> fall through to existing API logic
  4. After fetching from API, if session is finalized -> `cacheService.cache(session)`
- **`generatePlan()`** changes:
  - After generation + finalization flow completes, the new plan won't be finalized yet so no cache write here (user still critiques it)
- **`finalize()`** changes:
  - After successful finalization, write the refetched session to cache: `cacheService.cache(fullSession)`
  - This replaces any previous cached session
- **`startNewPlan()`** changes:
  - Call `cacheService.invalidate()` to clear old cached session (user is generating a fresh plan)
- Add `forceRefresh()` method:
  - Calls `cacheService.invalidate()` then `loadExistingSession()` (which will now fall through to API)

**Success criteria:**
- Opening meal plan screen with a finalized plan shows data instantly (no loading spinner)
- Generating a new plan clears the old cache
- Finalizing a plan writes it to cache
- `forceRefresh()` bypasses cache and refetches from API

---

## Phase 3: Integrate Cache into DashboardViewModel

**Overview:** Dashboard also reads from cache for the meal plan card.

**File: `BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`** (modify)
- Add `MealPlanCacheServiceProtocol` dependency via init
- **`loadMealPlan()`** changes:
  1. Check `cacheService.getCachedSession()` first
  2. If cached and finalized -> extract today's meals, skip API call
  3. If no cache -> fall through to existing API call
  4. After API fetch, if finalized -> cache the session
- Add `refreshMealPlan(forceRefresh: Bool = false)` method:
  - When `forceRefresh == true`: invalidate cache first, then load from API
  - Default behavior: use cache

**Success criteria:**
- Dashboard loads meal plan card instantly from cache
- Pull-to-refresh still fetches fresh data from API (existing `loadDashboard()` already handles this)

---

## Phase 4: Long-Press Cache Bypass UI

**Overview:** Add a long-press gesture on the dashboard meal plan card to force-refresh.

**File: `BradOS/Views/Today/MealPlanDashboardCard.swift`** (modify)
- Add `onLongPress: (() -> Void)?` callback parameter
- Add `.onLongPressGesture` modifier to the card
- Show brief haptic feedback (`.impact(.medium)`) on long press
- Optional: brief toast/indicator that refresh was triggered

**File: `BradOS/Views/Today/TodayDashboardView.swift`** (modify)
- Pass `onLongPress` handler to `MealPlanDashboardCard` that calls `dashboardViewModel.refreshMealPlan(forceRefresh: true)`

**Success criteria:**
- Long-pressing the meal plan dashboard card triggers a cache invalidation + API refetch
- Haptic feedback confirms the action
- Card updates with fresh data after refetch

---

## Phase 5: Unit Tests

**Overview:** Comprehensive tests for the cache service and ViewModel integration.

**File: `BradOSCore/Tests/BradOSCoreTests/Services/MealPlanCacheServiceTests.swift`** (new)
- Test writing and reading a session
- Test reading when no file exists (returns nil)
- Test reading corrupt JSON (returns nil, doesn't crash)
- Test invalidation deletes the file
- Test `isCached(sessionId:)` matching
- Test that non-finalized sessions are not cached

**File: `BradOSCore/Tests/BradOSCoreTests/ViewModels/MealPlanViewModelTests.swift`** (modify or create)
- Test `loadExistingSession()` returns cached data without API call
- Test `loadExistingSession()` falls through to API when no cache
- Test `finalize()` writes to cache
- Test `startNewPlan()` invalidates cache
- Test `forceRefresh()` invalidates and refetches

**Success criteria:**
- All unit tests pass
- `npm run typecheck` passes (for any shared types)
- No regressions in existing tests

---

## Testing Strategy

**Automated:**
- Unit tests for `MealPlanCacheService` (read/write/invalidate/corrupt handling)
- Unit tests for ViewModel cache integration
- Typecheck + lint pass

**Manual:**
- Cold launch with finalized plan -> instant display (no spinner)
- Generate new plan -> old cache cleared
- Finalize new plan -> cached
- Long-press dashboard card -> refetch from API
- Kill app and relaunch -> cached plan still loads instantly
- Airplane mode with cached plan -> still displays correctly

## References

- Existing cache pattern: `ios/BradOS/BradOS/Services/TTSAudioCache.swift`
- ViewModel: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift`
- Dashboard VM: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`
- Dashboard card: `ios/BradOS/BradOS/Views/Today/MealPlanDashboardCard.swift`
- Models: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MealPlan.swift`
