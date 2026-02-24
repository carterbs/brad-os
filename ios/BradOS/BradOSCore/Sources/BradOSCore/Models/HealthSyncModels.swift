import Foundation

// MARK: - HRV Sync Models

/// HRV entry for bulk sync to the backend
public struct HRVSyncEntry: Encodable {
    public let date: String       // YYYY-MM-DD
    public let avgMs: Double
    public let minMs: Double
    public let maxMs: Double
    public let sampleCount: Int
    public let source: String     // "healthkit"

    public init(date: String, avgMs: Double, minMs: Double, maxMs: Double, sampleCount: Int, source: String) {
        self.date = date
        self.avgMs = avgMs
        self.minMs = minMs
        self.maxMs = maxMs
        self.sampleCount = sampleCount
        self.source = source
    }
}

/// HRV history entry from the backend
public struct HRVHistoryEntry: Codable, Identifiable {
    public let id: String
    public let date: String       // YYYY-MM-DD
    public let avgMs: Double

    public init(id: String, date: String, avgMs: Double) {
        self.id = id
        self.date = date
        self.avgMs = avgMs
    }
}

// MARK: - RHR Sync Models

/// RHR entry for bulk sync to the backend
public struct RHRSyncEntry: Encodable {
    public let date: String       // YYYY-MM-DD
    public let avgBpm: Double
    public let sampleCount: Int
    public let source: String     // "healthkit"

    public init(date: String, avgBpm: Double, sampleCount: Int, source: String) {
        self.date = date
        self.avgBpm = avgBpm
        self.sampleCount = sampleCount
        self.source = source
    }
}

/// RHR history entry from the backend
public struct RHRHistoryEntry: Codable, Identifiable {
    public let id: String
    public let date: String       // YYYY-MM-DD
    public let avgBpm: Double

    public init(id: String, date: String, avgBpm: Double) {
        self.id = id
        self.date = date
        self.avgBpm = avgBpm
    }
}

// MARK: - Sleep Sync Models

/// Sleep entry for bulk sync to the backend
public struct SleepSyncEntry: Encodable {
    public let date: String       // YYYY-MM-DD
    public let totalSleepMinutes: Int
    public let inBedMinutes: Int
    public let coreMinutes: Int
    public let deepMinutes: Int
    public let remMinutes: Int
    public let awakeMinutes: Int
    public let sleepEfficiency: Double  // 0-100
    public let source: String           // "healthkit"

    public init(
        date: String,
        totalSleepMinutes: Int,
        inBedMinutes: Int,
        coreMinutes: Int,
        deepMinutes: Int,
        remMinutes: Int,
        awakeMinutes: Int,
        sleepEfficiency: Double,
        source: String
    ) {
        self.date = date
        self.totalSleepMinutes = totalSleepMinutes
        self.inBedMinutes = inBedMinutes
        self.coreMinutes = coreMinutes
        self.deepMinutes = deepMinutes
        self.remMinutes = remMinutes
        self.awakeMinutes = awakeMinutes
        self.sleepEfficiency = sleepEfficiency
        self.source = source
    }
}

/// Sleep history entry from the backend
public struct SleepHistoryEntry: Codable, Identifiable {
    public let id: String
    public let date: String       // YYYY-MM-DD
    public let totalSleepMinutes: Int
    public let coreMinutes: Int
    public let deepMinutes: Int
    public let remMinutes: Int
    public let awakeMinutes: Int
    public let sleepEfficiency: Double

    public init(
        id: String,
        date: String,
        totalSleepMinutes: Int,
        coreMinutes: Int,
        deepMinutes: Int,
        remMinutes: Int,
        awakeMinutes: Int,
        sleepEfficiency: Double
    ) {
        self.id = id
        self.date = date
        self.totalSleepMinutes = totalSleepMinutes
        self.coreMinutes = coreMinutes
        self.deepMinutes = deepMinutes
        self.remMinutes = remMinutes
        self.awakeMinutes = awakeMinutes
        self.sleepEfficiency = sleepEfficiency
    }
}
