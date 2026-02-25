import Foundation
import BradOSCore

/// A weight entry from the backend (synced from HealthKit)
struct WeightHistoryEntry: Codable, Identifiable {
    let id: String
    let date: String       // YYYY-MM-DD
    let weightLbs: Double
    let source: String? = nil
    let syncedAt: String? = nil

    /// Parse the date string into a Date
    var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        return formatter.date(from: date)
    }
}

/// A weight entry for bulk sync to the backend
struct WeightSyncEntry: Encodable {
    let weightLbs: Double
    let date: String       // YYYY-MM-DD
    let source: String     // "healthkit" or "manual"
}

/// Recovery data for sync to the backend
struct RecoverySyncData: Encodable {
    let date: String
    let hrvMs: Double
    let hrvVsBaseline: Double
    let rhrBpm: Double
    let rhrVsBaseline: Double
    let sleepHours: Double
    let sleepEfficiency: Double
    let deepSleepPercent: Double
    let score: Int
    let state: String
    let source: String
}

/// Recovery baseline for sync to the backend
struct RecoveryBaselineSyncData: Encodable {
    let hrvMedian: Double
    let hrvStdDev: Double
    let rhrMedian: Double
    let sampleCount: Int
}

/// Response from the recovery sync endpoint
struct RecoverySyncResponse: Decodable {
    let synced: Bool
}

/// Recovery snapshot from the backend (stored in Firebase)
struct RecoverySnapshotResponse: Decodable {
    let date: String           // YYYY-MM-DD
    let hrvMs: Double
    let hrvVsBaseline: Double
    let rhrBpm: Double
    let rhrVsBaseline: Double
    let sleepHours: Double
    let sleepEfficiency: Double
    let deepSleepPercent: Double
    let score: Int
    let state: String          // "ready", "moderate", "recover"

    /// Convert to the app's RecoveryData model
    func toRecoveryData() -> RecoveryData? {
        guard let recoveryState = RecoveryState(rawValue: state) else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        guard let parsedDate = formatter.date(from: date) else { return nil }

        return RecoveryData(
            date: parsedDate,
            hrvMs: hrvMs,
            hrvVsBaseline: hrvVsBaseline,
            rhrBpm: rhrBpm,
            rhrVsBaseline: rhrVsBaseline,
            sleepHours: sleepHours,
            sleepEfficiency: sleepEfficiency,
            deepSleepPercent: deepSleepPercent,
            score: score,
            state: recoveryState
        )
    }
}
