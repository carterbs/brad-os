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

    private let healthKitManager: HealthKitManager
    private let minimumSyncInterval: TimeInterval = 3600 // 1 hour

    /// UserDefaults key for persisting last sync date
    private let lastSyncKey = "healthkit_last_sync_date"

    /// UserDefaults keys for tracking whether initial backfills are done
    private let hrvBackfillCompleteKey = "healthkit_hrv_backfill_complete"
    private let rhrBackfillCompleteKey = "healthkit_rhr_backfill_complete"
    private let sleepBackfillCompleteKey = "healthkit_sleep_backfill_complete"

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

    /// Sync on app foreground (always syncs)
    func syncIfNeeded() async {
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
            async let w: Void = syncWeightHistory()
            async let h: Void = syncHRVHistory()
            async let r: Void = syncRHRHistory()
            async let s: Void = syncSleepHistory()
            _ = await (w, h, r, s)

            // Update last sync date
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: lastSyncKey)

            print("[HealthKitSyncService] Sync completed successfully")
        } catch {
            print("[HealthKitSyncService] Sync failed: \(error)")
            lastError = error.localizedDescription
        }
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

    /// Sync HRV history from HealthKit to Firebase in bulk.
    /// First sync does a full 10-year backfill; subsequent syncs only check the last 7 days.
    private func syncHRVHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: hrvBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkReadings = try await healthKitManager.fetchHRVHistory(days: syncDays)
            print("[HealthKitSyncService] HRV sync (\(backfillDone ? "incremental" : "backfill")): \(hkReadings.count) HealthKit samples for last \(syncDays) days")
            guard !hkReadings.isEmpty else {
                print("[HealthKitSyncService] No HealthKit HRV data to sync")
                if !backfillDone { UserDefaults.standard.set(true, forKey: hrvBackfillCompleteKey) }
                return
            }

            // Aggregate by date: avg, min, max, count per date
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.locale = Locale(identifier: "en_US_POSIX")

            var dailyReadings: [String: [Double]] = [:]
            for reading in hkReadings {
                let dateStr = dateFormatter.string(from: reading.date)
                dailyReadings[dateStr, default: []].append(reading.valueMs)
            }

            // Fetch existing Firebase dates to diff
            let existingEntries = try await APIClient.shared.getHRVHistory(days: syncDays)
            let existingDates = Set(existingEntries.map(\.date))

            let newEntries = dailyReadings.compactMap { (dateStr, values) -> HRVSyncEntry? in
                guard !existingDates.contains(dateStr) else { return nil }
                let avg = values.reduce(0, +) / Double(values.count)
                let min = values.min() ?? avg
                let max = values.max() ?? avg
                return HRVSyncEntry(
                    date: dateStr,
                    avgMs: avg,
                    minMs: min,
                    maxMs: max,
                    sampleCount: values.count,
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                print("[HealthKitSyncService] HRV data already up to date")
                if !backfillDone { UserDefaults.standard.set(true, forKey: hrvBackfillCompleteKey) }
                return
            }

            // Batch in 500s
            var totalAdded = 0
            for batchStart in stride(from: 0, to: newEntries.count, by: 500) {
                let batchEnd = min(batchStart + 500, newEntries.count)
                let batch = Array(newEntries[batchStart..<batchEnd])
                let added = try await APIClient.shared.syncHRVBulk(entries: batch)
                totalAdded += added
            }
            print("[HealthKitSyncService] Synced \(totalAdded) HRV entries to Firebase")

            if !backfillDone {
                UserDefaults.standard.set(true, forKey: hrvBackfillCompleteKey)
                print("[HealthKitSyncService] Initial HRV backfill complete")
            }
        } catch {
            print("[HealthKitSyncService] HRV sync failed (non-fatal): \(error)")
        }
    }

    /// Sync RHR history from HealthKit to Firebase in bulk.
    /// First sync does a full 10-year backfill; subsequent syncs only check the last 7 days.
    private func syncRHRHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: rhrBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkReadings = try await healthKitManager.fetchRHRHistory(days: syncDays)
            print("[HealthKitSyncService] RHR sync (\(backfillDone ? "incremental" : "backfill")): \(hkReadings.count) HealthKit samples for last \(syncDays) days")
            guard !hkReadings.isEmpty else {
                print("[HealthKitSyncService] No HealthKit RHR data to sync")
                if !backfillDone { UserDefaults.standard.set(true, forKey: rhrBackfillCompleteKey) }
                return
            }

            // Aggregate by date: avg, count per date
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.locale = Locale(identifier: "en_US_POSIX")

            var dailyReadings: [String: [Double]] = [:]
            for reading in hkReadings {
                let dateStr = dateFormatter.string(from: reading.date)
                dailyReadings[dateStr, default: []].append(reading.valueBpm)
            }

            // Fetch existing Firebase dates to diff
            let existingEntries = try await APIClient.shared.getRHRHistory(days: syncDays)
            let existingDates = Set(existingEntries.map(\.date))

            let newEntries = dailyReadings.compactMap { (dateStr, values) -> RHRSyncEntry? in
                guard !existingDates.contains(dateStr) else { return nil }
                let avg = values.reduce(0, +) / Double(values.count)
                return RHRSyncEntry(
                    date: dateStr,
                    avgBpm: avg,
                    sampleCount: values.count,
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                print("[HealthKitSyncService] RHR data already up to date")
                if !backfillDone { UserDefaults.standard.set(true, forKey: rhrBackfillCompleteKey) }
                return
            }

            var totalAdded = 0
            for batchStart in stride(from: 0, to: newEntries.count, by: 500) {
                let batchEnd = min(batchStart + 500, newEntries.count)
                let batch = Array(newEntries[batchStart..<batchEnd])
                let added = try await APIClient.shared.syncRHRBulk(entries: batch)
                totalAdded += added
            }
            print("[HealthKitSyncService] Synced \(totalAdded) RHR entries to Firebase")

            if !backfillDone {
                UserDefaults.standard.set(true, forKey: rhrBackfillCompleteKey)
                print("[HealthKitSyncService] Initial RHR backfill complete")
            }
        } catch {
            print("[HealthKitSyncService] RHR sync failed (non-fatal): \(error)")
        }
    }

    /// Sync sleep history from HealthKit to Firebase in bulk.
    /// First sync does a full 10-year backfill; subsequent syncs only check the last 7 days.
    private func syncSleepHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: sleepBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkNights = try await healthKitManager.fetchSleepHistory(days: syncDays)
            print("[HealthKitSyncService] Sleep sync (\(backfillDone ? "incremental" : "backfill")): \(hkNights.count) nights for last \(syncDays) days")
            guard !hkNights.isEmpty else {
                print("[HealthKitSyncService] No HealthKit sleep data to sync")
                if !backfillDone { UserDefaults.standard.set(true, forKey: sleepBackfillCompleteKey) }
                return
            }

            // Fetch existing Firebase dates to diff
            let existingEntries = try await APIClient.shared.getSleepHistory(days: syncDays)
            let existingDates = Set(existingEntries.map(\.date))

            let newEntries = hkNights.compactMap { (dateStr, metrics) -> SleepSyncEntry? in
                guard !existingDates.contains(dateStr) else { return nil }
                // Skip nights with no sleep data
                guard metrics.totalSleep > 0 else { return nil }
                return SleepSyncEntry(
                    date: dateStr,
                    totalSleepMinutes: Int(metrics.totalSleep / 60),
                    inBedMinutes: Int(metrics.inBed / 60),
                    coreMinutes: Int(metrics.core / 60),
                    deepMinutes: Int(metrics.deep / 60),
                    remMinutes: Int(metrics.rem / 60),
                    awakeMinutes: Int(metrics.awake / 60),
                    sleepEfficiency: metrics.efficiency,
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                print("[HealthKitSyncService] Sleep data already up to date")
                if !backfillDone { UserDefaults.standard.set(true, forKey: sleepBackfillCompleteKey) }
                return
            }

            var totalAdded = 0
            for batchStart in stride(from: 0, to: newEntries.count, by: 500) {
                let batchEnd = min(batchStart + 500, newEntries.count)
                let batch = Array(newEntries[batchStart..<batchEnd])
                let added = try await APIClient.shared.syncSleepBulk(entries: batch)
                totalAdded += added
            }
            print("[HealthKitSyncService] Synced \(totalAdded) sleep entries to Firebase")

            if !backfillDone {
                UserDefaults.standard.set(true, forKey: sleepBackfillCompleteKey)
                print("[HealthKitSyncService] Initial sleep backfill complete")
            }
        } catch {
            print("[HealthKitSyncService] Sleep sync failed (non-fatal): \(error)")
        }
    }

    private func sendSyncRequest(
        recovery: RecoveryData,
        baseline: RecoveryBaseline?
    ) async throws {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")

        let syncData = RecoverySyncData(
            date: formatter.string(from: recovery.date),
            hrvMs: recovery.hrvMs,
            hrvVsBaseline: recovery.hrvVsBaseline,
            rhrBpm: recovery.rhrBpm,
            rhrVsBaseline: recovery.rhrVsBaseline,
            sleepHours: recovery.sleepHours,
            sleepEfficiency: recovery.sleepEfficiency,
            deepSleepPercent: recovery.deepSleepPercent,
            score: recovery.score,
            state: recovery.state.rawValue,
            source: "healthkit"
        )

        let baselineData = baseline.map {
            RecoveryBaselineSyncData(
                hrvMedian: $0.hrvMedian,
                hrvStdDev: $0.hrvStdDev,
                rhrMedian: $0.rhrMedian,
                sampleCount: 60
            )
        }

        let response = try await APIClient.shared.syncRecovery(recovery: syncData, baseline: baselineData)
        guard response.synced else {
            throw URLError(.badServerResponse)
        }
    }
}
