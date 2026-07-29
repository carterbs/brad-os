---
date: 2026-07-28
researcher: codex
git_commit: 82c5fcb
branch: codex/progressive-today-load
topic: Today dashboard first-load latency
tags: [ios, startup, today-coach]
status: complete
---

# Research Question

Why does the Today dashboard's first load wait on network work, and how should it progressively reveal content?

# Summary

Dashboard cards already fetch their data concurrently, but the Today Coach card independently ran a serial HealthKit sync, recovery API read, and Coach API request. The app lifecycle separately starts the same kind of HealthKit sync when the scene becomes active.

The Coach card should immediately read the existing recovery snapshot and use its persisted Coach cache while the shared lifecycle sync continues independently. This avoids duplicate sync instances and prevents an expensive first-sync/backfill from delaying the Coach card.

# Detailed Findings

## Dashboard cards

`DashboardViewModel.loadDashboard()` uses `async let` for workout, stretch, meditation, and meal-plan calls, so those cards can independently transition out of loading.

## Coach path

The Coach card previously awaited `syncIfNeeded()` before fetching recovery and requesting the AI briefing. This created a serial, user-visible path. `BradOSApp` also invokes the shared sync service on every transition to active.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift` | 55-62 | Starts parallel dashboard-card loads and HealthKit refresh. |
| `ios/BradOS/BradOS/Views/Today/TodayCoachCard.swift` | 127-167 | Coach recovery and briefing load path. |
| `ios/BradOS/BradOS/App/BradOSApp.swift` | 113-119 | Shared lifecycle HealthKit sync. |
| `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift` | 54-72 | Parallel dashboard requests. |

# Architecture Insights

The app-scoped `HealthKitSyncService` is the correct owner for periodic synchronization. Views should consume cached/API snapshots rather than construct their own sync service and await it during rendering.

# Historical Context

Earlier live profiling measured a roughly 4.7-second cold Cloud Run startup, so avoiding startup-critical dependency chains matters even when each call is correct in isolation.

# Open Questions

- Add structured timing telemetry around API calls if launch latency remains high after this change.
