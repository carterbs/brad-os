import Foundation
import BradOSCore

// MARK: - HealthKitSyncService

/// Service for syncing HealthKit data to Firebase.
///
/// Architecture: HealthKit → Firebase → App
/// - This service is the ONLY place that reads from HealthKit
/// - All views/viewmodels read from Firebase via APIClient
@MainActor
class HealthKitSyncService: ObservableObject {

    // MARK: - Published Properties

    @Published var lastSyncDate: Date?
    @Published var isSyncing = false
    @Published var lastError: String?

    // MARK: - Private Properties

    let healthKitManager: HealthKitManager
    private let minimumSyncInterval: TimeInterval = 3600 // 1 hour

    /// UserDefaults key for persisting last sync date
    private let lastSyncKey = "healthkit_last_sync_date"

    /// UserDefaults keys for tracking whether initial backfills are done
    let hrvBackfillCompleteKey = "healthkit_hrv_backfill_complete"
    let rhrBackfillCompleteKey = "healthkit_rhr_backfill_complete"
    let sleepBackfillCompleteKey = "healthkit_sleep_backfill_complete"

    // MARK: - Initialization

    init(healthKitManager: HealthKitManager) {
        self.healthKitManager = healthKitManager
        // Load persisted last sync date
        if let storedDate = UserDefaults.standard.object(forKey: lastSyncKey) as? Date {
            lastSyncDate = storedDate
        }
    }

    // MARK: - Public Properties

    /// Whether a sync is needed (no recent sync or data is stale)
    var needsSync: Bool {
        guard let lastSync = lastSyncDate else { return true }
        return Date().timeIntervalSince(lastSync) > minimumSyncInterval
    }

    // MARK: - Public Methods

    /// Sync only if enough time has passed since last sync
    func syncIfNeeded() async {
        guard needsSync else {
            DebugLogger.warn("Skipping sync — last sync was \(Int(Date().timeIntervalSince(lastSyncDate ?? .distantPast)))s ago", attributes: ["source": "HealthKitSyncService"])
            return
        }
        await sync()
    }

    /// Performs a throttled, recent-only sync suitable for a short HealthKit background wake.
    func syncForBackground() async {
        guard needsSync else {
            DebugLogger.info(
                "Skipping background sync because recent health data is already synced",
                attributes: ["source": "HealthKitSyncService"]
            )
            return
        }
        await performSync(mode: .background)
    }

    /// Force a sync regardless of timing
    func sync() async {
        await performSync(mode: .foreground)
    }

    // MARK: - Sync Modes

    private enum SyncMode {
        case foreground
        case background
    }

    private func performSync(mode: SyncMode) async {
        guard !isSyncing else {
            DebugLogger.warn("Already syncing, skipping", attributes: ["source": "HealthKitSyncService"])
            return
        }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        do {
            // Ensure we have authorization
            guard healthKitManager.isAuthorized else {
                DebugLogger.info("HealthKit not authorized", attributes: ["source": "HealthKitSyncService"])
                lastError = "HealthKit not authorized"
                return
            }

            let recoveryResult = try await recoveryData(for: mode)

            // Sync recovery snapshot to Firebase (no weight — weight syncs separately in bulk)
            try await sendSyncRequest(
                recovery: recoveryResult.recovery,
                baseline: recoveryResult.baseline
            )

            await syncHistory(for: mode)

            // Update last sync date
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: lastSyncKey)

            let label: String
            switch mode {
            case .foreground:
                label = "Sync"
            case .background:
                label = "Background sync"
            }
            DebugLogger.info("\(label) completed successfully", attributes: ["source": "HealthKitSyncService"])
        } catch {
            DebugLogger.error("Sync failed: \(error)", attributes: ["source": "HealthKitSyncService"])
            lastError = error.localizedDescription
        }
    }

    private func recoveryData(for mode: SyncMode) async throws -> (
        recovery: RecoveryData,
        baseline: RecoveryBaseline?
    ) {
        switch mode {
        case .foreground:
            let recovery = try await healthKitManager.calculateRecoveryScore()
            let baseline = await healthKitManager.getCachedBaseline()
            return (recovery, baseline)
        case .background:
            return try await healthKitManager.calculateRecoveryScoreForBackground()
        }
    }

    private func syncHistory(for mode: SyncMode) async {
        switch mode {
        case .foreground:
            async let weightSync: Void = syncWeightHistory()
            async let hrvSync: Void = syncHRVHistory()
            async let rhrSync: Void = syncRHRHistory()
            async let sleepSync: Void = syncSleepHistory()
            _ = await (weightSync, hrvSync, rhrSync, sleepSync)
        case .background:
            let recentDays = 7
            async let weightSync: Void = syncWeightHistory(days: recentDays, uploadsExistingDates: true)
            async let hrvSync: Void = syncHRVHistory(days: recentDays)
            async let rhrSync: Void = syncRHRHistory(days: recentDays)
            async let sleepSync: Void = syncSleepHistory(days: recentDays)
            _ = await (weightSync, hrvSync, rhrSync, sleepSync)
        }
    }

    // MARK: - Force Sync Individual Types

    /// Force sync only weight data from HealthKit to Firebase
    func forceSyncWeight() async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }
        await syncWeightHistory()
    }

    /// Force sync only HRV data from HealthKit to Firebase
    func forceSyncHRV() async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }
        await syncHRVHistory()
    }

    /// Force sync only RHR data from HealthKit to Firebase
    func forceSyncRHR() async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }
        await syncRHRHistory()
    }

    /// Force sync only sleep data from HealthKit to Firebase
    func forceSyncSleep() async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }
        await syncSleepHistory()
    }

    /// Force sync recovery snapshot to Firebase
    func forceSyncRecovery() async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }
        do {
            guard healthKitManager.isAuthorized else {
                lastError = "HealthKit not authorized"
                return
            }
            let recovery = try await healthKitManager.calculateRecoveryScore()
            let baseline = await healthKitManager.getCachedBaseline()
            try await sendSyncRequest(recovery: recovery, baseline: baseline)
            DebugLogger.info("Recovery sync completed", attributes: ["source": "HealthKitSyncService"])
        } catch {
            DebugLogger.error("Recovery sync failed: \(error)", attributes: ["source": "HealthKitSyncService"])
            lastError = error.localizedDescription
        }
    }

    /// Reset backfill flags so next sync does a full 10-year backfill for all types
    func resetBackfill() {
        UserDefaults.standard.removeObject(forKey: hrvBackfillCompleteKey)
        UserDefaults.standard.removeObject(forKey: rhrBackfillCompleteKey)
        UserDefaults.standard.removeObject(forKey: sleepBackfillCompleteKey)
        DebugLogger.info("Backfill flags reset — next sync will do full backfill", attributes: ["source": "HealthKitSyncService"])
    }

    // MARK: - Private Methods

    /// Sync weight history from HealthKit to Firebase in bulk.
    /// Foreground sync defaults to 90 new days; background sync upserts its recent window.
    private func syncWeightHistory(days: Int = 90, uploadsExistingDates: Bool = false) async {
        do {
            let hkWeights = try await healthKitManager.fetchWeightHistory(days: days)
            guard !hkWeights.isEmpty else {
                DebugLogger.info("No HealthKit weight data to sync", attributes: ["source": "HealthKitSyncService"])
                return
            }

            let existingDates: Set<String>
            if uploadsExistingDates {
                existingDates = []
            } else {
                let existingEntries = try await APIClient.shared.getWeightHistory(days: days)
                existingDates = Set(existingEntries.map(\.date))
            }

            // Find HealthKit entries not yet in Firebase
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.locale = Locale(identifier: "en_US_POSIX")

            let newEntries = hkWeights.compactMap { reading -> WeightSyncEntry? in
                let dateStr = dateFormatter.string(from: reading.date)
                guard !existingDates.contains(dateStr) else { return nil }
                return WeightSyncEntry(
                    weightLbs: reading.valueLbs,
                    date: dateStr,
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                DebugLogger.info("Weight data already up to date", attributes: ["source": "HealthKitSyncService"])
                return
            }

            let added = try await APIClient.shared.syncWeightBulk(weights: newEntries)
            DebugLogger.info("Synced \(added) new weight entries to Firebase", attributes: ["source": "HealthKitSyncService"])
        } catch {
            // Don't fail the overall sync if weight sync fails
            DebugLogger.error("Weight sync failed (non-fatal): \(error)", attributes: ["source": "HealthKitSyncService"])
        }
    }
}
