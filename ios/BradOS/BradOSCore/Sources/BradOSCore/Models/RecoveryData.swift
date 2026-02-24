import Foundation

// MARK: - Recovery State

/// Recovery state indicating training readiness
public enum RecoveryState: String, Codable, CaseIterable {
    case ready     // Green - train as planned
    case moderate  // Yellow - reduce intensity
    case recover   // Red - rest or easy only

    public var displayName: String {
        switch self {
        case .ready: return "Ready"
        case .moderate: return "Moderate"
        case .recover: return "Recover"
        }
    }
}

// MARK: - Recovery Data

/// Complete recovery assessment data from HealthKit
public struct RecoveryData: Codable, Equatable {
    public let date: Date
    public let hrvMs: Double
    public let hrvVsBaseline: Double      // % difference from 60-day median
    public let rhrBpm: Double
    public let rhrVsBaseline: Double      // BPM difference from baseline
    public let sleepHours: Double
    public let sleepEfficiency: Double    // 0-100
    public let deepSleepPercent: Double   // 0-100
    public let score: Int                 // 0-100
    public let state: RecoveryState

    public init(
        date: Date,
        hrvMs: Double,
        hrvVsBaseline: Double,
        rhrBpm: Double,
        rhrVsBaseline: Double,
        sleepHours: Double,
        sleepEfficiency: Double,
        deepSleepPercent: Double,
        score: Int,
        state: RecoveryState
    ) {
        self.date = date
        self.hrvMs = hrvMs
        self.hrvVsBaseline = hrvVsBaseline
        self.rhrBpm = rhrBpm
        self.rhrVsBaseline = rhrVsBaseline
        self.sleepHours = sleepHours
        self.sleepEfficiency = sleepEfficiency
        self.deepSleepPercent = deepSleepPercent
        self.score = score
        self.state = state
    }

    /// Create recovery data with calculated score and state
    public static func calculate(
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
public struct RecoveryBaseline: Codable, Equatable {
    public let hrvMedian: Double      // 60-day rolling median HRV
    public let hrvStdDev: Double      // For smallest worthwhile change
    public let rhrMedian: Double      // 60-day rolling median RHR

    public init(hrvMedian: Double, hrvStdDev: Double, rhrMedian: Double) {
        self.hrvMedian = hrvMedian
        self.hrvStdDev = hrvStdDev
        self.rhrMedian = rhrMedian
    }

    /// Calculate baseline from historical readings
    public static func calculate(hrvReadings: [Double], rhrReadings: [Double]) -> RecoveryBaseline {
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
    public static var `default`: RecoveryBaseline {
        RecoveryBaseline(hrvMedian: 36.0, hrvStdDev: 15.0, rhrMedian: 60.0)
    }
}

// MARK: - Sleep Metrics

/// Sleep stage breakdown from HealthKit
public struct SleepMetrics: Equatable {
    public var inBed: TimeInterval
    public var totalSleep: TimeInterval
    public var core: TimeInterval
    public var deep: TimeInterval
    public var rem: TimeInterval
    public var awake: TimeInterval

    /// Sleep efficiency as percentage (0-100)
    public var efficiency: Double {
        inBed > 0 ? (totalSleep / inBed) * 100 : 0
    }

    /// Deep sleep as percentage of total sleep (0-100)
    public var deepPercent: Double {
        totalSleep > 0 ? (deep / totalSleep) * 100 : 0
    }

    public init(
        inBed: TimeInterval = 0,
        totalSleep: TimeInterval = 0,
        core: TimeInterval = 0,
        deep: TimeInterval = 0,
        rem: TimeInterval = 0,
        awake: TimeInterval = 0
    ) {
        self.inBed = inBed
        self.totalSleep = totalSleep
        self.core = core
        self.deep = deep
        self.rem = rem
        self.awake = awake
    }
}

// MARK: - HRV Reading

/// Historical HRV reading for baseline calculation
public struct HRVReading: Equatable {
    public let date: Date
    public let valueMs: Double

    public init(date: Date, valueMs: Double) {
        self.date = date
        self.valueMs = valueMs
    }
}

// MARK: - RHR Reading

/// Historical resting heart rate reading for baseline calculation
public struct RHRReading: Equatable {
    public let date: Date
    public let valueBpm: Double

    public init(date: Date, valueBpm: Double) {
        self.date = date
        self.valueBpm = valueBpm
    }
}
