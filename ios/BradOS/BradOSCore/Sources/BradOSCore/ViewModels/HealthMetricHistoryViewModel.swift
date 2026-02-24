import Foundation
import SwiftUI

// MARK: - Health Metric Configuration

/// Defines all metric-specific behavior and appearance for HRV/RHR-style metrics
public enum HealthMetric {
    case hrv
    case rhr

    public var navigationTitle: String {
        switch self {
        case .hrv: return "HRV History"
        case .rhr: return "RHR History"
        }
    }

    public var currentSectionTitle: String {
        switch self {
        case .hrv: return "Current HRV"
        case .rhr: return "Current RHR"
        }
    }

    public var trendTitle: String {
        switch self {
        case .hrv: return "HRV Trend"
        case .rhr: return "RHR Trend"
        }
    }

    public var icon: String {
        switch self {
        case .hrv: return "waveform.path.ecg"
        case .rhr: return "heart.fill"
        }
    }

    public var color: Color {
        switch self {
        case .hrv: return ThemeColors.lifting
        case .rhr: return Color.red
        }
    }

    public var unit: String {
        switch self {
        case .hrv: return "ms"
        case .rhr: return "bpm"
        }
    }

    public var noDataText: String {
        switch self {
        case .hrv: return "No HRV data"
        case .rhr: return "No RHR data"
        }
    }

    public var chartLabel: String {
        switch self {
        case .hrv: return "HRV"
        case .rhr: return "RHR"
        }
    }

    /// Whether the icon appears before the value text
    public var iconBeforeValue: Bool {
        switch self {
        case .hrv: return false
        case .rhr: return true
        }
    }

    public var errorMessage: String {
        switch self {
        case .hrv: return "Failed to load HRV history"
        case .rhr: return "Failed to load RHR history"
        }
    }

    public var defaultYRange: (min: Double, max: Double) {
        switch self {
        case .hrv: return (20, 60)
        case .rhr: return (50, 80)
        }
    }
}

// MARK: - Generic Health Metric ViewModel (replaces HRVHistoryViewModel & RHRHistoryViewModel)

@MainActor
@Observable
public class HealthMetricHistoryViewModel {

    public let metric: HealthMetric

    // MARK: - State

    public var allHistory: [HealthMetricChartPoint] = []
    public var allSmoothedHistory: [HealthMetricChartPoint] = []
    public var selectedRange: HealthChartRange = .sixMonths
    public var isLoading = false
    public var error: String?
    public var trendSlope: Double?

    private let apiClient: any APIClientProtocol

    public init(_ metric: HealthMetric, apiClient: any APIClientProtocol) {
        self.metric = metric
        self.apiClient = apiClient
    }

    // MARK: - Computed

    public var history: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allHistory.filter { $0.date >= cutoff }
    }

    public var smoothedHistory: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allSmoothedHistory.filter { $0.date >= cutoff }
    }

    public var currentValue: Double? {
        allHistory.last?.value
    }

    public var projectedTrendPoints: [HealthMetricChartPoint] {
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

    public var chartYDomain: ClosedRange<Double> {
        let allValues = history.map(\.value) + projectedTrendPoints.map(\.value)
        let minVal = allValues.min() ?? metric.defaultYRange.min
        let maxVal = allValues.max() ?? metric.defaultYRange.max
        let padding = max((maxVal - minVal) * 0.1, 2)
        return (minVal - padding)...(maxVal + padding)
    }

    // MARK: - Loading

    public func loadData() async {
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
            print("[\(metric.chartLabel)HistoryVM] Error: \(error)")
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

// MARK: - Sleep History ViewModel

@MainActor
@Observable
public class SleepHistoryViewModel {

    // MARK: - State

    public var allHistory: [SleepChartPoint] = []
    public var selectedRange: HealthChartRange = .sixMonths
    public var isLoading = false
    public var error: String?

    private let apiClient: any APIClientProtocol

    public init(apiClient: any APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Computed

    public var history: [SleepChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allHistory.filter { $0.date >= cutoff }
    }

    public var currentEntry: SleepChartPoint? {
        allHistory.last
    }

    public var averageSleepHours: Double? {
        let recent = Array(allHistory.suffix(7))
        guard !recent.isEmpty else { return nil }
        return recent.map(\.totalHours).reduce(0, +) / Double(recent.count)
    }

    public var averageEfficiency: Double? {
        let recent = Array(allHistory.suffix(7))
        guard !recent.isEmpty else { return nil }
        return recent.map(\.efficiency).reduce(0, +) / Double(recent.count)
    }

    /// Total sleep hours as HealthMetricChartPoints for the smoothed line
    public var totalSleepPoints: [HealthMetricChartPoint] {
        history.map { HealthMetricChartPoint(date: $0.date, value: $0.totalHours) }
    }

    public var smoothedTotalSleep: [HealthMetricChartPoint] {
        calculateSMA(points: totalSleepPoints, window: 7)
    }

    public var chartYDomain: ClosedRange<Double> {
        let values = history.map(\.totalHours)
        let minVal = values.min() ?? 4
        let maxVal = values.max() ?? 10
        let padding = max((maxVal - minVal) * 0.1, 0.5)
        return max(0, minVal - padding)...(maxVal + padding)
    }

    // MARK: - Loading

    public func loadData() async {
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
            print("Error: \(error)")
        }
    }
}
