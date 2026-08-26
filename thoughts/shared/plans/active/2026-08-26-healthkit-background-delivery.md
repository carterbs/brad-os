# HealthKit Background Delivery Plan

## Overview
Use HealthKit observer queries and hourly background delivery to trigger the existing HealthKit-to-Firebase pipeline when supported recovery samples reach the iPhone. Add a dedicated light sync mode so an OS wake never performs historical backfills.

## Current State Analysis
- `ios/BradOS/BradOS/App/BradOSApp.swift:18-51` registers a `BGAppRefreshTask`, but the generated Info.plist does not declare the task identifier or background fetch mode.
- `ios/BradOS/BradOS/App/BradOSApp.swift:113-124` preserves the desired foreground `syncIfNeeded()` reconciliation and separately schedules the dormant refresh task.
- `ios/BradOS/BradOS/Services/HealthKitManager.swift:35-84` keeps authorization only in memory, so a background cold launch starts unauthorized even after a successful earlier request.
- `ios/BradOS/BradOS/Services/HealthKitSyncService.swift:54-105` has only a full sync path, including a recovery baseline query and all history uploads.
- `ios/BradOS/BradOS/Services/HealthKitSyncService+HistorySync.swift:8-135` can expand HRV, RHR, and sleep to 3,650 days when backfill flags are absent.
- `ios/BradOS/project.yml:65-84` enables HealthKit reads but does not add the background-delivery entitlement.

## Desired End State
- Register observers for HRV SDNN, sleep analysis, resting heart rate, and body mass during app initialization.
- Enable `.hourly` HealthKit background delivery for those types.
- Complete every observer callback after a throttled light sync finishes, including error paths.
- Restore authorization-request state on cold launches and silently reconcile legacy authorization state.
- Keep foreground/manual sync behavior and its historical backfills unchanged.

## What We're NOT Doing
- No second network or persistence path; uploads continue through `HealthKitSyncService` and `APIClient`.
- No background 60-day baseline rebuild, 90-day weight fetch, or 10-year history backfill.
- No workaround for force-quit, disabled Background App Refresh, or system-timed Watch-to-iPhone transfer.
- No BGAppRefresh safety net; remove the incomplete scheduler rather than expand scope beyond the observer-first design.

## Implementation Approach

### Phase 1: HealthKit lifecycle and authorization
- Persist successful authorization requests and query HealthKit's request status on launch for existing installs.
- Execute retained `HKObserverQuery` instances and enable `.hourly` delivery for the four supported sample types.
- Route callbacks to foreground reconciliation while active and light sync while backgrounded.

**Success criteria:** observers start from app initialization; every callback invokes its completion handler; cold background launches can query previously authorized data.

### Phase 2: Light delta sync
- Persist the last calculated recovery baseline for reuse without a 60-day background query.
- Add a throttled background sync using today's snapshot plus seven-day HRV, RHR, sleep, and weight deltas.
- Parameterize existing history helpers so only foreground/manual calls can select normal backfill windows.

**Success criteria:** background code cannot select 90 or 3,650 days; foreground `sync()` and force-sync controls retain their current behavior.

### Phase 3: Capabilities, documentation, and verification
- Add `com.apple.developer.healthkit.background-delivery` to release and debug entitlements.
- Document architecture, OS limitations, and physical-device verification.
- Regenerate the Xcode project, run SwiftLint/build tests, full repository validation, and simulator QA where supported.

**Success criteria:** relevant automated gates pass; documentation explicitly states that background delivery requires a device, Background App Refresh, and a non-force-quit app.

## Testing Strategy
- Automated: XcodeGen drift check, SwiftLint/build/test through the project scheme, and `npm run validate`.
- Manual/simulator: launch and verify existing app behavior; HealthKit delivery itself remains device-only.
- Physical device (PR instructions): grant Health access, install without force-quitting, add/update each supported sample, and inspect telemetry/Firebase after the system-delivered wake.

## References
- Apple HealthKit `HKObserverQuery`
- Apple HealthKit `enableBackgroundDelivery(for:frequency:withCompletion:)`
- `docs/architecture/health.md`
