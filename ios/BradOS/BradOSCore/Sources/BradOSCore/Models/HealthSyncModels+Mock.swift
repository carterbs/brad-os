import Foundation

// MARK: - HRVHistoryEntry Mock Data

public extension HRVHistoryEntry {
    static let mockEntries: [HRVHistoryEntry] = {
        let today = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return (0..<30).map { dayOffset in
            let date = Calendar.current.date(byAdding: .day, value: -dayOffset, to: today) ?? today
            return HRVHistoryEntry(
                id: "hrv-\(dayOffset)",
                date: formatter.string(from: date),
                avgMs: 35.0 + Double(dayOffset % 10) - 5.0
            )
        }
    }()
}

// MARK: - RHRHistoryEntry Mock Data

public extension RHRHistoryEntry {
    static let mockEntries: [RHRHistoryEntry] = {
        let today = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return (0..<30).map { dayOffset in
            let date = Calendar.current.date(byAdding: .day, value: -dayOffset, to: today) ?? today
            return RHRHistoryEntry(
                id: "rhr-\(dayOffset)",
                date: formatter.string(from: date),
                avgBpm: 58.0 + Double(dayOffset % 6) - 3.0
            )
        }
    }()
}

// MARK: - SleepHistoryEntry Mock Data

public extension SleepHistoryEntry {
    static let mockEntries: [SleepHistoryEntry] = {
        let today = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return (0..<30).map { dayOffset in
            let date = Calendar.current.date(byAdding: .day, value: -dayOffset, to: today) ?? today
            let totalMinutes = 420 + (dayOffset % 5) * 10 - 20
            let deepMinutes = totalMinutes / 5
            let coreMinutes = totalMinutes / 2
            let remMinutes = totalMinutes / 4
            let awakeMinutes = 15
            let inBedMinutes = totalMinutes + awakeMinutes
            let efficiency = Double(totalMinutes) / Double(inBedMinutes) * 100
            return SleepHistoryEntry(
                id: "sleep-\(dayOffset)",
                date: formatter.string(from: date),
                totalSleepMinutes: totalMinutes,
                coreMinutes: coreMinutes,
                deepMinutes: deepMinutes,
                remMinutes: remMinutes,
                awakeMinutes: awakeMinutes,
                sleepEfficiency: efficiency
            )
        }
    }()
}
