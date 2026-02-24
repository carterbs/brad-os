import Foundation

// MARK: - Shared Types

/// Shared time range for health metric charts (reusable across HRV, RHR, etc.)
public enum HealthChartRange: String, CaseIterable {
    case oneWeek = "1W"
    case twoWeeks = "2W"
    case oneMonth = "1M"
    case sixMonths = "6M"
    case oneYear = "1Y"

    public var days: Int {
        switch self {
        case .oneWeek: return 7
        case .twoWeeks: return 14
        case .oneMonth: return 30
        case .sixMonths: return 180
        case .oneYear: return 365
        }
    }
}

/// Generic data point for health metric charts
public struct HealthMetricChartPoint: Identifiable {
    public let id = UUID()
    public let date: Date
    public let value: Double

    public init(date: Date, value: Double) {
        self.date = date
        self.value = value
    }
}

/// Sleep data point for sleep history charts
public struct SleepChartPoint: Identifiable {
    public let id = UUID()
    public let date: Date
    public let totalHours: Double
    public let coreHours: Double
    public let deepHours: Double
    public let remHours: Double
    public let efficiency: Double

    public init(
        date: Date,
        totalHours: Double,
        coreHours: Double,
        deepHours: Double,
        remHours: Double,
        efficiency: Double
    ) {
        self.date = date
        self.totalHours = totalHours
        self.coreHours = coreHours
        self.deepHours = deepHours
        self.remHours = remHours
        self.efficiency = efficiency
    }
}

// MARK: - Shared Utilities

/// Calculate Simple Moving Average for chart points
public func calculateSMA(points: [HealthMetricChartPoint], window: Int) -> [HealthMetricChartPoint] {
    guard points.count >= 2 else { return points }
    return points.enumerated().map { index, point in
        let windowStart = max(0, index - window + 1)
        let windowSlice = points[windowStart...index]
        let avg = windowSlice.map(\.value).reduce(0, +) / Double(windowSlice.count)
        return HealthMetricChartPoint(date: point.date, value: avg)
    }
}

/// Linear regression returning slope (units/day)
public func linearRegressionSlope(points: [HealthMetricChartPoint]) -> Double {
    let count = Double(points.count)
    guard count >= 2, let firstDate = points.first?.date else { return 0 }

    var sumX = 0.0, sumY = 0.0, sumXY = 0.0, sumX2 = 0.0
    for point in points {
        let xVal = point.date.timeIntervalSince(firstDate) / 86400.0
        let yVal = point.value
        sumX += xVal
        sumY += yVal
        sumXY += xVal * yVal
        sumX2 += xVal * xVal
    }

    let denominator = count * sumX2 - sumX * sumX
    guard abs(denominator) > 1e-10 else { return 0 }
    return (count * sumXY - sumX * sumY) / denominator
}

/// Parse date strings into chart points, deduplicating by day (keeps latest per date)
public func parseDatePoints(_ items: [(dateString: String, value: Double)]) -> [HealthMetricChartPoint] {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current

    let points = items.compactMap { item -> HealthMetricChartPoint? in
        guard let date = formatter.date(from: item.dateString) else { return nil }
        return HealthMetricChartPoint(date: date, value: item.value)
    }.sorted { $0.date < $1.date }

    var seen = Set<String>()
    var deduped: [HealthMetricChartPoint] = []
    for point in points.reversed() {
        let key = formatter.string(from: point.date)
        if !seen.contains(key) {
            seen.insert(key)
            deduped.append(point)
        }
    }
    return deduped.reversed()
}
