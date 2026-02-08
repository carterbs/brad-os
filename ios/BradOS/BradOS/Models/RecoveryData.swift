import Foundation

// MARK: - Recovery State

/// Recovery state indicating training readiness
enum RecoveryState: String, Codable, CaseIterable {
    case ready     // Green - train as planned
    case moderate  // Yellow - reduce intensity
    case recover   // Red - rest or easy only

    var displayName: String {
        switch self {
        case .ready: return "Ready"
        case .moderate: return "Moderate"
        case .recover: return "Recover"
        }
    }
}

// MARK: - Recovery Data

/// Complete recovery assessment data from HealthKit
struct RecoveryData: Codable, Equatable {
    let date: Date
    let hrvMs: Double
    let hrvVsBaseline: Double      // % difference from 60-day median
    let rhrBpm: Double
    let rhrVsBaseline: Double      // BPM difference from baseline
    let sleepHours: Double
    let sleepEfficiency: Double    // 0-100
    let deepSleepPercent: Double   // 0-100
    let score: Int                 // 0-100
    let state: RecoveryState

    /// Create recovery data with calculated score and state
    static func calculate(
        date: Date,
        hrvMs: Double,
        hrvBaseline: RecoveryBaseline,
        rhrBpm: Double,
        sleepMetrics: SleepMetrics
    ) -> RecoveryData {
        // HRV component (0-100, 70% weight)
        let hrvDelta = hrvBaseline.hrvStdDev > 0
            ? (hrvMs - hrvBaseline.hrvMedian) / hrvBaseline.hrvStdDev
            : 0
        let hrvScore = min(100, max(0, 50 + (hrvDelta * 25)))
        let hrvVsBaseline = hrvBaseline.hrvMedian > 0
            ? ((hrvMs - hrvBaseline.hrvMedian) / hrvBaseline.hrvMedian) * 100
            : 0

        // RHR component (0-100, 20% weight) - lower is better
        let rhrDelta = (hrvBaseline.rhrMedian - rhrBpm) / 5.0  // 5 BPM = 1 std dev approx
        let rhrScore = min(100, max(0, 50 + (rhrDelta * 25)))
        let rhrVsBaseline = rhrBpm - hrvBaseline.rhrMedian

        // Sleep component (0-100, 10% weight)
        let sleepHours = sleepMetrics.totalSleep / 3600.0
        var sleepScore = 0.0
        sleepScore += sleepHours >= 7 ? 40 : (sleepHours / 7) * 40
        sleepScore += sleepMetrics.efficiency >= 85 ? 30 : (sleepMetrics.efficiency / 85) * 30
        sleepScore += sleepMetrics.deepPercent >= 15 ? 30 : (sleepMetrics.deepPercent / 15) * 30

        // Weighted combination
        let totalScore = Int(hrvScore * 0.7 + rhrScore * 0.2 + sleepScore * 0.1)

        // State determination
        let state: RecoveryState
        if totalScore >= 70 {
            state = .ready
        } else if totalScore >= 50 {
            state = .moderate
        } else {
            state = .recover
        }

        return RecoveryData(
            date: date,
            hrvMs: hrvMs,
            hrvVsBaseline: hrvVsBaseline,
            rhrBpm: rhrBpm,
            rhrVsBaseline: rhrVsBaseline,
            sleepHours: sleepHours,
            sleepEfficiency: sleepMetrics.efficiency,
            deepSleepPercent: sleepMetrics.deepPercent,
            score: totalScore,
            state: state
        )
    }
}

// MARK: - Recovery Baseline

/// Baseline values for recovery calculation (60-day rolling medians)
struct RecoveryBaseline: Codable, Equatable {
    let hrvMedian: Double      // 60-day rolling median HRV
    let hrvStdDev: Double      // For smallest worthwhile change
    let rhrMedian: Double      // 60-day rolling median RHR

    /// Calculate baseline from historical readings
    static func calculate(hrvReadings: [Double], rhrReadings: [Double]) -> RecoveryBaseline {
        // Use median (resistant to outliers)
        let hrvSorted = hrvReadings.sorted()
        let rhrSorted = rhrReadings.sorted()

        let hrvMedian = hrvSorted.isEmpty ? 0 : hrvSorted[hrvSorted.count / 2]
        let rhrMedian = rhrSorted.isEmpty ? 0 : rhrSorted[rhrSorted.count / 2]
        let hrvStdDev = RecoveryBaseline.standardDeviation(hrvReadings)

        return RecoveryBaseline(
            hrvMedian: hrvMedian,
            hrvStdDev: hrvStdDev,
            rhrMedian: rhrMedian
        )
    }

    private static func standardDeviation(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let mean = values.reduce(0, +) / Double(values.count)
        let sumOfSquaredDiffs = values.map { pow($0 - mean, 2) }.reduce(0, +)
        return sqrt(sumOfSquaredDiffs / Double(values.count - 1))
    }

    /// Default baseline for new users (average Apple Watch user values)
    static var `default`: RecoveryBaseline {
        RecoveryBaseline(hrvMedian: 36.0, hrvStdDev: 15.0, rhrMedian: 60.0)
    }
}

// MARK: - Sleep Metrics

/// Sleep stage breakdown from HealthKit
struct SleepMetrics: Equatable {
    var inBed: TimeInterval = 0
    var totalSleep: TimeInterval = 0
    var core: TimeInterval = 0
    var deep: TimeInterval = 0
    var rem: TimeInterval = 0
    var awake: TimeInterval = 0

    /// Sleep efficiency as percentage (0-100)
    var efficiency: Double {
        inBed > 0 ? (totalSleep / inBed) * 100 : 0
    }

    /// Deep sleep as percentage of total sleep (0-100)
    var deepPercent: Double {
        totalSleep > 0 ? (deep / totalSleep) * 100 : 0
    }

    /// REM sleep as percentage of total sleep (0-100)
    var remPercent: Double {
        totalSleep > 0 ? (rem / totalSleep) * 100 : 0
    }

    /// Total sleep in hours
    var hoursSlept: Double {
        totalSleep / 3600.0
    }
}

// MARK: - HRV Reading

/// Historical HRV reading for baseline calculation
struct HRVReading: Equatable {
    let date: Date
    let valueMs: Double
}

// MARK: - RHR Reading

/// Historical resting heart rate reading for baseline calculation
struct RHRReading: Equatable {
    let date: Date
    let valueBpm: Double
}
