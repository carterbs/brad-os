# Health

## Data Flow
HealthKitManager -> HealthKitSyncService -> APIClient -> health-sync handler -> recoveryService -> Firestore
HealthView/HealthMetricHistoryView -> HealthMetricHistoryViewModel -> APIClient -> health-sync handler -> Firestore

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Health/HealthView.swift` — main health dashboard
  - `ios/BradOS/BradOS/Views/Profile/HealthSyncView.swift` — sync status/controls
  - `ios/BradOS/BradOS/Views/Profile/HealthMetricHistoryView.swift` — metric history charts
- **ViewModels:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/HealthMetricHistoryViewModel.swift`
- **Models:** `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/HealthChartModels.swift`
- **Services:**
  - `ios/BradOS/BradOS/Services/HealthKitManager.swift` — HealthKit data access
  - `ios/BradOS/BradOS/Services/HealthKitManager+SleepRecovery.swift` — sleep/recovery queries
  - `ios/BradOS/BradOS/Services/HealthKitSyncService.swift` — sync orchestration
  - `ios/BradOS/BradOS/Services/HealthKitSyncService+HistorySync.swift` — bulk history sync

## Backend Layer
- **Handlers:**
  - `packages/functions/src/handlers/health-sync.ts` — sync, recovery, weight, HRV, RHR, sleep endpoints
  - `packages/functions/src/handlers/health.ts` — health check endpoint (status/version)
- **Services:** `packages/functions/src/services/firestore-recovery.service.ts` — Firestore CRUD for all health data
- **Schemas:** `packages/functions/src/schemas/recovery.schema.ts`
- **Types:** `packages/functions/src/types/recovery.ts` — RecoverySnapshot, RecoveryBaseline, WeightEntry

## Firestore Collections
- `users/{uid}/recoverySnapshots` — daily recovery data (HRV, RHR, sleep, score, state) keyed by date
- `users/{uid}/settings/recoveryBaseline` — 60-day rolling median baselines (HRV, RHR)
- `users/{uid}/weightHistory` — weight entries from HealthKit
- `users/{uid}/hrvHistory` — HRV history
- `users/{uid}/rhrHistory` — resting heart rate history
- `users/{uid}/sleepHistory` — sleep data history

## Key Endpoints
- `POST /health-sync/sync` — sync recovery snapshot, baseline, and weight from iOS
- `GET /health-sync/recovery` — get recovery snapshot (latest or by date)
- `GET /health-sync/recovery/history` — recovery history
- `GET /health-sync/baseline` — get recovery baseline
- `POST /health-sync/weight/bulk` — bulk weight sync
- `GET /health-sync/weight` — weight history
- `POST /health-sync/hrv/bulk` — bulk HRV sync
- `GET /health-sync/hrv` — HRV history
- `POST /health-sync/rhr/bulk` — bulk RHR sync
- `GET /health-sync/rhr` — RHR history
- `POST /health-sync/sleep/bulk` — bulk sleep sync
- `GET /health-sync/sleep` — sleep history
- `GET /health/` — health check (status, version)

## Notes
- HealthKit is the source of truth for raw metrics; iOS calculates recovery scores and syncs to Firebase
- Recovery scoring: HRV vs baseline (60-day median), RHR vs baseline, sleep hours/efficiency/deep%
- Recovery states: ready (score >= 70), moderate (50-69), recover (< 50)
- Bulk sync endpoints support batch upsert with date-keyed documents (idempotent)
- Recovery and stored ride data feed the unified Today Coach
- HealthKitSyncService handles both daily sync and historical backfill
- At app launch, iOS registers `HKObserverQuery` observers and enables hourly background delivery for HRV SDNN, sleep analysis, resting heart rate, and body mass. Observer callbacks reuse `HealthKitSyncService` and the existing API endpoints.
- Background wakes run a light sync only: today's recovery snapshot plus seven days of HRV, RHR, sleep, and weight deltas. The 60-day baseline rebuild, 90-day weight sync, and up-to-10-year history backfills remain foreground/manual work.
- HealthKit background delivery requires the background-delivery entitlement and Background App Refresh on a physical device. It does not run after the user force-quits the app. Watch samples trigger observers only after iOS transfers them into the iPhone HealthKit store, so morning recovery can lag.
- HealthKit background delivery cannot be exercised in Simulator; verify observer wakes and Firebase writes on a signed physical-device build.

## See Also
- [Today](today.md) — recovery/readiness shown in daily briefing
- [Cycling Data](cycling.md) — recent ride workload used as recovery context
- [Profile](profile.md) — health settings and metric history views
