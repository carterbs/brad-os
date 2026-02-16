import Foundation
import BradOSCore

// MARK: - History Sync Methods

extension HealthKitSyncService {

    /// Sync HRV history from HealthKit to Firebase in bulk.
    func syncHRVHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: hrvBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkReadings = try await healthKitManager.fetchHRVHistory(days: syncDays)
            guard !hkReadings.isEmpty else {
                if !backfillDone {
                    UserDefaults.standard.set(true, forKey: hrvBackfillCompleteKey)
                }
                return
            }

            let dailyReadings = aggregateByDate(hkReadings) { $0.valueMs }
            let existingDates = try await existingHRVDates(days: syncDays)

            let newEntries = dailyReadings.compactMap { dateStr, values -> HRVSyncEntry? in
                guard !existingDates.contains(dateStr) else { return nil }
                let avg = values.reduce(0, +) / Double(values.count)
                return HRVSyncEntry(
                    date: dateStr,
                    avgMs: avg,
                    minMs: values.min() ?? avg,
                    maxMs: values.max() ?? avg,
                    sampleCount: values.count,
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                markBackfillComplete(forKey: hrvBackfillCompleteKey, done: backfillDone)
                return
            }

            let totalAdded = try await syncInBatches(newEntries) { batch in
                try await APIClient.shared.syncHRVBulk(entries: batch)
            }
            print("[HealthKitSyncService] Synced \(totalAdded) HRV entries")
            markBackfillComplete(forKey: hrvBackfillCompleteKey, done: backfillDone)
        } catch {
            print("[HealthKitSyncService] HRV sync failed (non-fatal): \(error)")
        }
    }

    /// Sync RHR history from HealthKit to Firebase in bulk.
    func syncRHRHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: rhrBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkReadings = try await healthKitManager.fetchRHRHistory(days: syncDays)
            guard !hkReadings.isEmpty else {
                markBackfillComplete(forKey: rhrBackfillCompleteKey, done: backfillDone)
                return
            }

            let dailyReadings = aggregateByDate(hkReadings) { $0.valueBpm }
            let existingDates = try await existingRHRDates(days: syncDays)

            let newEntries = dailyReadings.compactMap { dateStr, values -> RHRSyncEntry? in
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
                markBackfillComplete(forKey: rhrBackfillCompleteKey, done: backfillDone)
                return
            }

            let totalAdded = try await syncInBatches(newEntries) { batch in
                try await APIClient.shared.syncRHRBulk(entries: batch)
            }
            print("[HealthKitSyncService] Synced \(totalAdded) RHR entries")
            markBackfillComplete(forKey: rhrBackfillCompleteKey, done: backfillDone)
        } catch {
            print("[HealthKitSyncService] RHR sync failed (non-fatal): \(error)")
        }
    }

    /// Sync sleep history from HealthKit to Firebase in bulk.
    func syncSleepHistory() async {
        do {
            let backfillDone = UserDefaults.standard.bool(forKey: sleepBackfillCompleteKey)
            let syncDays = backfillDone ? 7 : 3650

            let hkNights = try await healthKitManager.fetchSleepHistory(days: syncDays)
            guard !hkNights.isEmpty else {
                markBackfillComplete(forKey: sleepBackfillCompleteKey, done: backfillDone)
                return
            }

            let existingDates = try await existingSleepDates(days: syncDays)

            let newEntries = hkNights.compactMap { dateStr, metrics -> SleepSyncEntry? in
                guard !existingDates.contains(dateStr), metrics.totalSleep > 0 else { return nil }
                return SleepSyncEntry(
                    date: dateStr,
                    totalSleepMinutes: Int(metrics.totalSleep / 60),
                    inBedMinutes: Int(metrics.inBed / 60),
                    coreMinutes: Int(metrics.core / 60),
                    deepMinutes: Int(metrics.deep / 60),
                    remMinutes: Int(metrics.rem / 60),
                    awakeMinutes: Int(metrics.awake / 60),
                    sleepEfficiency: min(metrics.efficiency, 100),
                    source: "healthkit"
                )
            }

            guard !newEntries.isEmpty else {
                markBackfillComplete(forKey: sleepBackfillCompleteKey, done: backfillDone)
                return
            }

            let totalAdded = try await syncInBatches(newEntries) { batch in
                try await APIClient.shared.syncSleepBulk(entries: batch)
            }
            print("[HealthKitSyncService] Synced \(totalAdded) sleep entries")
            markBackfillComplete(forKey: sleepBackfillCompleteKey, done: backfillDone)
        } catch {
            print("[HealthKitSyncService] Sleep sync failed (non-fatal): \(error)")
        }
    }

    func sendSyncRequest(
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

        let response = try await APIClient.shared.syncRecovery(
            recovery: syncData, baseline: baselineData
        )
        guard response.synced else {
            throw URLError(.badServerResponse)
        }
    }

    // MARK: - Helpers

    private func aggregateByDate<T>(
        _ readings: [T],
        valueExtractor: (T) -> Double
    ) -> [String: [Double]] where T: DateBearing {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")

        var daily: [String: [Double]] = [:]
        for reading in readings {
            let dateStr = dateFormatter.string(from: reading.date)
            daily[dateStr, default: []].append(valueExtractor(reading))
        }
        return daily
    }

    private func existingHRVDates(days: Int) async throws -> Set<String> {
        let entries = try await APIClient.shared.getHRVHistory(days: days)
        return Set(entries.map(\.date))
    }

    private func existingRHRDates(days: Int) async throws -> Set<String> {
        let entries = try await APIClient.shared.getRHRHistory(days: days)
        return Set(entries.map(\.date))
    }

    private func existingSleepDates(days: Int) async throws -> Set<String> {
        let entries = try await APIClient.shared.getSleepHistory(days: days)
        return Set(entries.map(\.date))
    }

    private func syncInBatches<T>(
        _ entries: [T],
        upload: ([T]) async throws -> Int
    ) async throws -> Int {
        var totalAdded = 0
        for batchStart in stride(from: 0, to: entries.count, by: 500) {
            let batchEnd = min(batchStart + 500, entries.count)
            let batch = Array(entries[batchStart..<batchEnd])
            totalAdded += try await upload(batch)
        }
        return totalAdded
    }

    private func markBackfillComplete(forKey key: String, done: Bool) {
        if !done {
            UserDefaults.standard.set(true, forKey: key)
        }
    }
}

/// Protocol for types with a date property
protocol DateBearing {
    var date: Date { get }
}

extension HRVReading: DateBearing {}
extension RHRReading: DateBearing {}
