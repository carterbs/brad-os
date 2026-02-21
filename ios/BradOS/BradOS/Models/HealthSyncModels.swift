import Foundation

// MARK: - HRV Sync Models

/// HRV entry for bulk sync to the backend
struct HRVSyncEntry: Encodable {
    let date: String       // YYYY-MM-DD
    let avgMs: Double
    let minMs: Double
    let maxMs: Double
    let sampleCount: Int
    let source: String     // "healthkit"
}

/// HRV history entry from the backend
struct HRVHistoryEntry: Codable, Identifiable {
    let id: String
    let date: String       // YYYY-MM-DD
    let avgMs: Double
}

// MARK: - RHR Sync Models

/// RHR entry for bulk sync to the backend
struct RHRSyncEntry: Encodable {
    let date: String       // YYYY-MM-DD
    let avgBpm: Double
    let sampleCount: Int
    let source: String     // "healthkit"
}

/// RHR history entry from the backend
struct RHRHistoryEntry: Codable, Identifiable {
    let id: String
    let date: String       // YYYY-MM-DD
    let avgBpm: Double
}

// MARK: - Sleep Sync Models

/// Sleep entry for bulk sync to the backend
struct SleepSyncEntry: Encodable {
    let date: String       // YYYY-MM-DD
    let totalSleepMinutes: Int
    let inBedMinutes: Int
    let coreMinutes: Int
    let deepMinutes: Int
    let remMinutes: Int
    let awakeMinutes: Int
    let sleepEfficiency: Double  // 0-100
    let source: String     // "healthkit"
}

/// Sleep history entry from the backend
struct SleepHistoryEntry: Codable, Identifiable {
    let id: String
    let date: String       // YYYY-MM-DD
    let totalSleepMinutes: Int
    let coreMinutes: Int
    let deepMinutes: Int
    let remMinutes: Int
    let awakeMinutes: Int
    let sleepEfficiency: Double
}
