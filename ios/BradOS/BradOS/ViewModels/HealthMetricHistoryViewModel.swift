import Foundation
import SwiftUI

// MARK: - Shared Types

/// Shared time range for health metric charts (reusable across HRV, RHR, etc.)
enum HealthChartRange: String, CaseIterable {
    case oneWeek = "1W"
    case twoWeeks = "2W"
    case oneMonth = "1M"
    case sixMonths = "6M"
    case oneYear = "1Y"

    var days: Int {
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
struct HealthMetricChartPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

// MARK: - Shared Utilities

/// Calculate Simple Moving Average for chart points
func calculateSMA(points: [HealthMetricChartPoint], window: Int) -> [HealthMetricChartPoint] {
    guard points.count >= 2 else { return points }
    return points.enumerated().map { index, point in
        let windowStart = max(0, index - window + 1)
        let windowSlice = points[windowStart...index]
        let avg = windowSlice.map(\.value).reduce(0, +) / Double(windowSlice.count)
        return HealthMetricChartPoint(date: point.date, value: avg)
    }
}

/// Linear regression returning slope (units/day)
func linearRegressionSlope(points: [HealthMetricChartPoint]) -> Double {
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
func parseDatePoints(_ items: [(dateString: String, value: Double)]) -> [HealthMetricChartPoint] {
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

// MARK: - Health Metric Configuration

/// Defines all metric-specific behavior and appearance for HRV/RHR-style metrics
enum HealthMetric {
    case hrv
    case rhr

    var navigationTitle: String {
        switch self {
        case .hrv: return "HRV History"
        case .rhr: return "RHR History"
        }
    }

    var currentSectionTitle: String {
        switch self {
        case .hrv: return "Current HRV"
        case .rhr: return "Current RHR"
        }
    }

    var trendTitle: String {
        switch self {
        case .hrv: return "HRV Trend"
        case .rhr: return "RHR Trend"
        }
    }

    var icon: String {
        switch self {
        case .hrv: return "waveform.path.ecg"
        case .rhr: return "heart.fill"
        }
    }

    var color: Color {
        switch self {
        case .hrv: return Theme.interactivePrimary
        case .rhr: return Theme.destructive
        }
    }

    var unit: String {
        switch self {
        case .hrv: return "ms"
        case .rhr: return "bpm"
        }
    }

    var noDataText: String {
        switch self {
        case .hrv: return "No HRV data"
        case .rhr: return "No RHR data"
        }
    }

    var chartLabel: String {
        switch self {
        case .hrv: return "HRV"
        case .rhr: return "RHR"
        }
    }

    /// Whether the icon appears before the value text
    var iconBeforeValue: Bool {
        switch self {
        case .hrv: return false
        case .rhr: return true
        }
    }

    fileprivate var errorMessage: String {
        switch self {
        case .hrv: return "Failed to load HRV history"
        case .rhr: return "Failed to load RHR history"
        }
    }

    fileprivate var defaultYRange: (min: Double, max: Double) {
        switch self {
        case .hrv: return (20, 60)
        case .rhr: return (50, 80)
        }
    }
}

// MARK: - Generic Health Metric ViewModel (replaces HRVHistoryViewModel & RHRHistoryViewModel)

@MainActor
@Observable
class HealthMetricHistoryViewModel {

    let metric: HealthMetric

    // MARK: - State

    var allHistory: [HealthMetricChartPoint] = []
    var allSmoothedHistory: [HealthMetricChartPoint] = []
    var selectedRange: HealthChartRange = .sixMonths
    var isLoading = false
    var error: String?
    var trendSlope: Double?

    private let apiClient = APIClient.shared

    init(_ metric: HealthMetric) {
        self.metric = metric
    }

    // MARK: - Computed

    var history: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allHistory.filter { $0.date >= cutoff }
    }

    var smoothedHistory: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allSmoothedHistory.filter { $0.date >= cutoff }
    }

    var currentValue: Double? {
        allHistory.last?.value
    }

    var projectedTrendPoints: [HealthMetricChartPoint] {
        guard let slope = trendSlope,
              let lastPoint = allSmoothedHistory.last,
              abs(slope) > 0.001 else { return [] }

        var points = [HealthMetricChartPoint(date: lastPoint.date, value: lastPoint.value)]
        for day in 1...14 {
            guard let date = Calendar.current.date(byAdding: .day, value: day, to: lastPoint.date) else { continue }
            points.append(HealthMetricChartPoint(date: date, value: lastPoint.value + slope * Double(day)))
        }
        return points
    }

    var chartYDomain: ClosedRange<Double> {
        let allValues = history.map(\.value) + projectedTrendPoints.map(\.value)
        let minVal = allValues.min() ?? metric.defaultYRange.min
        let maxVal = allValues.max() ?? metric.defaultYRange.max
        let padding = max((maxVal - minVal) * 0.1, 2)
        return (minVal - padding)...(maxVal + padding)
    }

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let rawPoints: [(dateString: String, value: Double)]
            switch metric {
            case .hrv:
                let entries = try await apiClient.getHRVHistory(days: 365)
                rawPoints = entries.map { ($0.date, $0.avgMs) }
            case .rhr:
                let entries = try await apiClient.getRHRHistory(days: 365)
                rawPoints = entries.map { ($0.date, $0.avgBpm) }
            }

            allHistory = parseDatePoints(rawPoints)
            allSmoothedHistory = calculateSMA(points: allHistory, window: 7)
            updateTrend()
        } catch {
            self.error = metric.errorMessage
            DebugLogger.error("[\(metric.chartLabel)HistoryVM] Error: \(error)")
        }
    }

    private func updateTrend() {
        let recentPoints = Array(allSmoothedHistory.suffix(28))
        guard recentPoints.count >= 7 else {
            trendSlope = nil
            return
        }
        trendSlope = linearRegressionSlope(points: recentPoints)
    }
}

// MARK: - Sleep History Data Point

struct SleepChartPoint: Identifiable {
    let id = UUID()
    let date: Date
    let totalHours: Double
    let coreHours: Double
    let deepHours: Double
    let remHours: Double
    let efficiency: Double
}

// MARK: - Sleep History ViewModel

@MainActor
@Observable
class SleepHistoryViewModel {

    // MARK: - State

    var allHistory: [SleepChartPoint] = []
    var selectedRange: HealthChartRange = .sixMonths
    var isLoading = false
    var error: String?

    private let apiClient = APIClient.shared

    // MARK: - Computed

    var history: [SleepChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allHistory.filter { $0.date >= cutoff }
    }

    var currentEntry: SleepChartPoint? {
        allHistory.last
    }

    var averageSleepHours: Double? {
        let recent = Array(allHistory.suffix(7))
        guard !recent.isEmpty else { return nil }
        return recent.map(\.totalHours).reduce(0, +) / Double(recent.count)
    }

    var averageEfficiency: Double? {
        let recent = Array(allHistory.suffix(7))
        guard !recent.isEmpty else { return nil }
        return recent.map(\.efficiency).reduce(0, +) / Double(recent.count)
    }

    /// Total sleep hours as HealthMetricChartPoints for the smoothed line
    var totalSleepPoints: [HealthMetricChartPoint] {
        history.map { HealthMetricChartPoint(date: $0.date, value: $0.totalHours) }
    }

    var smoothedTotalSleep: [HealthMetricChartPoint] {
        calculateSMA(points: totalSleepPoints, window: 7)
    }

    var chartYDomain: ClosedRange<Double> {
        let values = history.map(\.totalHours)
        let minVal = (values.min() ?? 4)
        let maxVal = (values.max() ?? 10)
        let padding = max((maxVal - minVal) * 0.1, 0.5)
        return max(0, minVal - padding)...(maxVal + padding)
    }

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let entries = try await apiClient.getSleepHistory(days: 365)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current

            let points = entries.compactMap { entry -> SleepChartPoint? in
                guard let date = formatter.date(from: entry.date) else { return nil }
                return SleepChartPoint(
                    date: date,
                    totalHours: Double(entry.totalSleepMinutes) / 60.0,
                    coreHours: Double(entry.coreMinutes) / 60.0,
                    deepHours: Double(entry.deepMinutes) / 60.0,
                    remHours: Double(entry.remMinutes) / 60.0,
                    efficiency: entry.sleepEfficiency
                )
            }.sorted { $0.date < $1.date }

            // Deduplicate by date
            var seen = Set<String>()
            var deduped: [SleepChartPoint] = []
            for point in points.reversed() {
                let key = formatter.string(from: point.date)
                if !seen.contains(key) {
                    seen.insert(key)
                    deduped.append(point)
                }
            }
            allHistory = deduped.reversed()
        } catch {
            self.error = "Failed to load sleep history"
            DebugLogger.error("Error: \(error)", attributes: ["source": "SleepHistoryVM"])
        }
    }
}
