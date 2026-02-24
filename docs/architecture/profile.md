# Profile

## Data Flow
ProfileView -> NavigationLink destinations -> various ViewModels/Services -> APIClient -> backend handlers

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Profile/ProfileView.swift` (main settings hub)
  - `ios/BradOS/BradOS/Views/Profile/FTPEntryView.swift` (cycling FTP)
  - `ios/BradOS/BradOS/Views/Profile/TrainingBlockSetupView.swift` (cycling training plan)
  - `ios/BradOS/BradOS/Views/Profile/TrainingBlockSetupView+Steps.swift`
  - `ios/BradOS/BradOS/Views/Profile/TrainingBlockSetupView+Helpers.swift`
  - `ios/BradOS/BradOS/Views/Profile/StravaConnectionView.swift` (Strava OAuth)
  - `ios/BradOS/BradOS/Views/Profile/StravaConnectionView+Sections.swift`
  - `ios/BradOS/BradOS/Views/Profile/WeightGoalView.swift` (weight tracking)
  - `ios/BradOS/BradOS/Views/Profile/WeightGoalView+Charts.swift`
  - `ios/BradOS/BradOS/Views/Profile/HealthMetricHistoryView.swift` (HRV/RHR charts)
  - `ios/BradOS/BradOS/Views/Profile/SleepHistoryView.swift`
  - `ios/BradOS/BradOS/Views/Profile/FoodScannerView.swift`
  - `ios/BradOS/BradOS/Views/Profile/TextToSpeechView.swift`
  - `ios/BradOS/BradOS/Views/Profile/HealthSyncView.swift`
- **ViewModels:**
  - `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift`
  - `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift` (HealthMetricHistoryViewModel + SleepHistoryViewModel)
  - `ios/BradOS/BradOS/ViewModels/TextToSpeechViewModel.swift`
  - `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift` (injected via EnvironmentObject)
- **Services:**
  - `ios/BradOS/BradOS/Services/HealthKitSyncService.swift`
  - `ios/BradOS/BradOS/Services/StravaAuthManager.swift`

## Backend Layer
- **Handlers:** `packages/functions/src/handlers/health-sync.ts`
- **Services:** `packages/functions/src/services/firestore-recovery.service.ts`
- **Schemas:** `packages/functions/src/schemas/recovery.schema.ts`
- **Types:** `packages/functions/src/types/recovery.ts`

## Key Endpoints
- `POST /health-sync/sync` -- Sync recovery, baseline, and weight from HealthKit
- `GET /health-sync/recovery` -- Get recovery snapshot (latest or by date)
- `GET /health-sync/recovery/history` -- Recovery history (last N days)
- `GET /health-sync/baseline` -- Get recovery baseline
- `POST /health-sync/weight/bulk` -- Bulk sync weight entries
- `GET /health-sync/weight` -- Get weight (latest or history)
- `POST /health-sync/hrv/bulk` -- Bulk sync HRV entries
- `GET /health-sync/hrv` -- Get HRV data
- `POST /health-sync/rhr/bulk` -- Bulk sync RHR entries
- `GET /health-sync/rhr` -- Get RHR data
- `POST /health-sync/sleep/bulk` -- Bulk sync sleep entries
- `GET /health-sync/sleep` -- Get sleep data

## Firestore Collections
- `users/{uid}/recoverySnapshots/{YYYY-MM-DD}` -- Daily recovery scores
- `users/{uid}/recoveryBaseline` -- 60-day rolling medians (single doc)
- `users/{uid}/weightHistory/{YYYY-MM-DD}` -- Weight entries
- `users/{uid}/hrvHistory/{YYYY-MM-DD}` -- HRV entries
- `users/{uid}/rhrHistory/{YYYY-MM-DD}` -- RHR entries
- `users/{uid}/sleepHistory/{YYYY-MM-DD}` -- Sleep entries

## Notes
- Profile is a settings hub, not a single feature -- it links to cycling (FTP, Strava, training blocks), health metrics, and utilities
- Sections: Cycling, Health, Settings, About
- Health metrics support configurable time ranges (1W, 2W, 1M, 6M, 1Y) with SMA trend lines
- HealthMetricHistoryView is generic -- initialized with `.hrv` or `.rhr` enum case
- Health sync uses date-as-doc-ID pattern for upsert semantics
