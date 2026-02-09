---
date: 2026-02-08
researcher: claude
git_commit: d8e03b4
branch: main
topic: iOS App Uncompleted Features Audit
tags: [ios, audit, incomplete-features, tech-debt]
status: complete
---

# Research Question

What features in the iOS app are incomplete, partially implemented, or defined but not fully surfaced to users?

# Summary

The iOS codebase is remarkably production-ready. No TODO/FIXME comments exist, no stub functions were found, and all navigation destinations are properly wired. However, several features have backend/API support that is never exposed in the UI, and one API feature (meditation streaks) is defined client-side but not yet implemented server-side.

The most significant gaps are: **meditation statistics have no dashboard**, **plan creation has no UI form**, **HRV/RHR historical trends are collected but never charted**, and **ingredients/recipes have no standalone browser**. There are also ~150 debug `print()` statements scattered across the codebase that could be cleaned up for release builds.

# Detailed Findings

## 1. Meditation Statistics - API Exists, No UI

The meditation stats API is fully implemented end-to-end (protocol, service, model) but no view ever calls `fetchStats()` or displays the data.

- **Protocol:** `APIClientProtocol.swift:126` — `func getMeditationStats() async throws -> MeditationStats`
- **Service:** `MeditationAPIService.swift:119-142` — `fetchStats()` fully implemented
- **Model:** `APIModels.swift:17-41` — `MeditationStats` with `totalSessions`, `totalMinutes`, `currentStreak?`, `longestStreak?`
- **Note:** Streak fields are optional because the server doesn't return them yet (`APIModels.swift:20` comment: "streak fields are not yet implemented in the API")

**Impact:** Users complete meditation sessions but never see cumulative stats, streaks, or progress.

## 2. Plan Creation - No UI Form

API methods for full plan CRUD exist but only read/update/delete are surfaced in the UI.

- **API:** `APIClientProtocol.swift:60-75` — `createPlan()`, `updatePlan()`, `deletePlan()` all defined
- **UI:** `PlansView.swift` uses `updatePlan` and `deletePlan` but never calls `createPlan`
- **Current behavior:** Users can only manage pre-existing plans; no way to create new ones from the app

**Impact:** Users must create workout plans outside the iOS app (presumably via API/web).

## 3. HRV/RHR Historical Trends - Data Collected, No Charts

HealthKit data is queried and used for real-time readiness scoring but historical trends are never visualized.

- **Models:** `RecoveryData.swift:162-176` — `HRVReading` and `RHRReading` structs defined
- **Baselines:** `RecoveryData.swift:92-128` — `RecoveryBaseline` calculates 60-day rolling medians
- **UI:** `ReadinessCard.swift` and `RecoveryDetailView.swift` show current recovery score only
- **Missing:** No chart view showing HRV/RHR trends over days/weeks/months

**Impact:** Users see today's recovery score but can't track how their HRV/RHR trends over time.

## 4. Ingredients & Recipes Browser - No Standalone View

API endpoints exist for listing ingredients and recipes, but they're only used internally by the meal plan flow.

- **API:** `APIClientProtocol.swift:153,158` — `getIngredients()`, `getRecipes()`
- **Usage:** Only called within meal plan generation context
- **Missing:** No standalone recipe browser, no ingredient search, no recipe detail view outside meal plans

**Impact:** Users can't browse or search recipes/ingredients independently.

## 5. Watch Workout Controller - Implemented But Possibly Unused

`WatchWorkoutController.swift` has a complete WatchConnectivity implementation (session management, workout commands, heart rate streaming) but it's unclear if the Watch app is deployed or actively used by any ViewModel.

- **Implementation:** `WatchWorkoutController.swift:47-63` — session management; lines 81-199 — workout commands; lines 266-301 — heart rate streaming
- **Watch app:** `BradOSWatch/WorkoutManager.swift` exists with 14 print statements suggesting active development

**Impact:** Possible dead code if the Watch app isn't deployed.

## 6. Debug Print Statements (~150 instances)

Scattered across the codebase, mostly wrapped in `#if DEBUG` but some are unconditional:

| File | Count | Notes |
|------|-------|-------|
| `WatchWorkoutController.swift` | 17 | Watch connectivity logging |
| `WorkoutManager.swift` (Watch) | 14 | Workout state logging |
| `StravaAuthManager.swift` | 14 | OAuth flow logging |
| `CyclingViewModel.swift` | 10 | API call logging |
| `WorkoutView.swift` | 9 | API failure logging |
| `APIClient.swift` | 8 | Network request/response logging |
| Various other files | ~78 | Scattered debug output |

**Impact:** Not a feature gap, but noise for release builds. Consider replacing with `os.Logger` for structured, filterable logging.

## 7. Meditation Manifest Default - Hardcoded Fallback

`MeditationManifestService.swift:52-150` has a hardcoded "Basic Breathing" meditation manifest. Line 27 comment says "In production, this would fetch from server" — currently uses an embedded default as a fallback.

**Impact:** Minor — works as intended but suggests server-side manifest delivery is planned but not yet built.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `BradOSCore/Sources/.../APIClientProtocol.swift` | 126 | `getMeditationStats()` — never called from UI |
| `BradOS/Services/MeditationAPIService.swift` | 119-142 | `fetchStats()` — implemented but unused |
| `BradOSCore/Sources/.../APIModels.swift` | 17-41 | `MeditationStats` model with optional streaks |
| `BradOSCore/Sources/.../APIClientProtocol.swift` | 60-75 | Plan CRUD — `createPlan()` never called |
| `BradOS/Views/Lifting/PlansView.swift` | — | Uses update/delete but not create |
| `BradOS/Models/RecoveryData.swift` | 92-176 | Baseline, HRVReading, RHRReading — no trend UI |
| `BradOSCore/Sources/.../APIClientProtocol.swift` | 153, 158 | `getIngredients()`, `getRecipes()` — no browser UI |
| `BradOS/Services/WatchWorkoutController.swift` | 47-301 | Full Watch integration — usage unclear |
| `BradOS/Services/MeditationManifestService.swift` | 27, 52-150 | Hardcoded fallback manifest |
| `BradOS/Views/Cycling/CyclingTodayView.swift` | 236-274 | Coach placeholder card (intentional empty state) |

# Architecture Insights

- The app follows a clean protocol-based architecture where `APIClientProtocol` defines all endpoints. This makes it easy to spot features defined at the API layer that never get surfaced in the UI.
- `MockAPIClient` exists in BradOSCore for testing, mirroring the full protocol — this means all "missing" features have test infrastructure ready.
- The codebase uses proper empty states (CoachPlaceholderCard, loading skeletons) rather than hiding unfinished features — any incompleteness is in features that simply don't have views yet.

# Open Questions

- Is the Watch app (`BradOSWatch/`) actively deployed or still in development?
- Is meditation streak tracking planned for the backend? (Client models are ready)
- Should plan creation be an iOS feature or is it intentionally server/web only?
- Are standalone recipe/ingredient browsers desired or is the meal plan context sufficient?
