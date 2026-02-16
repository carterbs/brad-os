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
            print("[HealthKitSyncService] Skipping sync — last sync was \(Int(Date().timeIntervalSince(lastSyncDate ?? .distantPast)))s ago")
            return
        }
        await sync()
    }

    /// Force a sync regardless of timing
    func sync() async {
        guard !isSyncing else {
            print("[HealthKitSyncService] Already syncing, skipping")
            return
        }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        do {
            // Ensure we have authorization
            guard healthKitManager.isAuthorized else {
                print("[HealthKitSyncService] HealthKit not authorized")
                lastError = "HealthKit not authorized"
                return
            }

            // Calculate recovery score (this fetches all needed data)
            let recovery = try await healthKitManager.calculateRecoveryScore()

            // Get baseline if available
            let baseline = await healthKitManager.getCachedBaseline()

            // Sync recovery snapshot to Firebase (no weight — weight syncs separately in bulk)
            try await sendSyncRequest(recovery: recovery, baseline: baseline)

            // Sync all health history in parallel (each is non-fatal)
            async let weightSync: Void = syncWeightHistory()
            async let hrvSync: Void = syncHRVHistory()
            async let rhrSync: Void = syncRHRHistory()
            async let sleepSync: Void = syncSleepHistory()
            _ = await (weightSync, hrvSync, rhrSync, sleepSync)

            // Update last sync date
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: lastSyncKey)

            print("[HealthKitSyncService] Sync completed successfully")
        } catch {
            print("[HealthKitSyncService] Sync failed: \(error)")
            lastError = error.localizedDescription
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
            print("[HealthKitSyncService] Recovery sync completed")
        } catch {
            print("[HealthKitSyncService] Recovery sync failed: \(error)")
            lastError = error.localizedDescription
        }
    }

    /// Reset backfill flags so next sync does a full 10-year backfill for all types
    func resetBackfill() {
        UserDefaults.standard.removeObject(forKey: hrvBackfillCompleteKey)
        UserDefaults.standard.removeObject(forKey: rhrBackfillCompleteKey)
        UserDefaults.standard.removeObject(forKey: sleepBackfillCompleteKey)
        print("[HealthKitSyncService] Backfill flags reset — next sync will do full backfill")
    }

    // MARK: - Private Methods

    /// Sync weight history from HealthKit to Firebase in bulk.
    /// Fetches 90 days from HealthKit, diffs against Firebase, sends only new entries.
    private func syncWeightHistory() async {
        do {
            // Fetch weight history from HealthKit (90 days)
            let hkWeights = try await healthKitManager.fetchWeightHistory(days: 90)
            guard !hkWeights.isEmpty else {
                print("[HealthKitSyncService] No HealthKit weight data to sync")
                return
            }

            // Fetch existing weight data from Firebase (90 days)
            let existingEntries = try await APIClient.shared.getWeightHistory(days: 90)
            let existingDates = Set(existingEntries.map(\.date))

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
                print("[HealthKitSyncService] Weight data already up to date")
                return
            }

            let added = try await APIClient.shared.syncWeightBulk(weights: newEntries)
            print("[HealthKitSyncService] Synced \(added) new weight entries to Firebase")
        } catch {
            // Don't fail the overall sync if weight sync fails
            print("[HealthKitSyncService] Weight sync failed (non-fatal): \(error)")
        }
    }
}
