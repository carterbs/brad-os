import Foundation

/// Trend direction for recent body-weight movement.
enum BodyWeightTrendState: String {
    case decreasing
    case increasing
    case stable

    var iconName: String {
        switch self {
        case .decreasing: return "arrow.down.right"
        case .increasing: return "arrow.up.right"
        case .stable: return "minus"
        }
    }
}

/// A short trend summary used on the body-weight screen.
struct BodyWeightTrendSummary: Identifiable {
    let id = UUID()
    let windowLabel: String
    let delta: Double
    let state: BodyWeightTrendState

    var formattedDelta: String {
        let absDelta = abs(delta)
        return String(format: "%.1f lbs", absDelta)
    }
}

/// Time range for the weight chart
enum WeightChartRange: String, CaseIterable {
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

/// Data point for the body-weight chart.
struct WeightChartPoint: Identifiable {
    let id = UUID()
    let date: Date
    let weight: Double
}

@MainActor
@Observable
class BodyWeightViewModel {

    // MARK: - State

    var allWeightHistory: [WeightChartPoint] = []
    var allSmoothedHistory: [WeightChartPoint] = []
    var selectedRange: WeightChartRange = .sixMonths
    var recentTrends: [BodyWeightTrendSummary] = []

    var currentWeight: Double?
    var currentWeightDate: String?
    var entryWeight: String = ""
    var entryDate: Date = Date()

    var isLoading = false
    var isLogging = false
    var logSuccess = false
    var error: String?

    private let apiClient: any BodyWeightAPIClientProtocol
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        return formatter
    }()

    init(apiClient: any BodyWeightAPIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Computed

    var weightHistory: [WeightChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allWeightHistory.filter { $0.date >= cutoff }
    }

    var smoothedHistory: [WeightChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allSmoothedHistory.filter { $0.date >= cutoff }
    }

    var chartYDomain: ClosedRange<Double> {
        let allWeights = weightHistory.map(\.weight) + smoothedHistory.map(\.weight)
        var minWeight = allWeights.min() ?? 150
        var maxWeight = allWeights.max() ?? 200

        if let current = currentWeight {
            minWeight = min(minWeight, current)
            maxWeight = max(maxWeight, current)
        }

        let padding = max((maxWeight - minWeight) * 0.1, 2)
        return (minWeight - padding)...(maxWeight + padding)
    }

    var entryDateString: String {
        dateFormatter.string(from: entryDate)
    }

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let entries = try await apiClient.getWeightHistory(days: 365)
            let points = entries.compactMap { entry -> WeightChartPoint? in
                guard let date = entry.parsedDate else { return nil }
                return WeightChartPoint(date: date, weight: entry.weightLbs)
            }

            let sortedPoints = points.sorted { $0.date < $1.date }
            allWeightHistory = deduplicateByDate(points: sortedPoints)
            allSmoothedHistory = calculateSMA(points: allWeightHistory, window: 7)

            if let latest = allWeightHistory.last {
                currentWeight = latest.weight
                currentWeightDate = dateFormatter.string(from: latest.date)
            } else {
                currentWeight = nil
                currentWeightDate = nil
            }

            updateRecentTrends()
        } catch let apiError as APIError where apiError.code == .notFound {
            allWeightHistory = []
            allSmoothedHistory = []
            currentWeight = nil
            currentWeightDate = nil
            recentTrends = []
        } catch {
            error = "Failed to load weight history"
            allWeightHistory = []
            allSmoothedHistory = []
            currentWeight = nil
            currentWeightDate = nil
            recentTrends = []
            DebugLogger.error("Error loading weight data: \(error)", attributes: ["source": "BodyWeightVM"])
        }
    }

    // MARK: - Logging

    func logEntry() async {
        guard let weight = parse(entryWeight) else {
            error = "Please enter a valid weight"
            return
        }

        isLogging = true
        logSuccess = false
        defer { isLogging = false }

        do {
            let entry = try await apiClient.logWeightEntry(
                weightLbs: weight,
                date: entryDateString,
                source: "manual"
            )
            currentWeight = entry.weightLbs
            currentWeightDate = entry.date
            logSuccess = true
            entryWeight = ""
            entryDate = Date()
            error = nil
            await loadData()
        } catch {
            logSuccess = false
            error = "Failed to log entry"
            DebugLogger.error("Error logging weight entry: \(error)", attributes: ["source": "BodyWeightVM"])
        }
    }

    // MARK: - Trends

    func updateRecentTrends() {
        guard let current = currentWeight else {
            recentTrends = []
            return
        }

        recentTrends = [
            buildTrendSummary(label: "7-Day", window: 7, current: current),
            buildTrendSummary(label: "30-Day", window: 30, current: current),
        ]
        .compactMap { $0 }
    }

    private func buildTrendSummary(label: String, window: Int, current: Double) -> BodyWeightTrendSummary? {
        let windowPoints = Array(allWeightHistory.suffix(window))
        guard !windowPoints.isEmpty else { return nil }

        let average = windowPoints.reduce(0, { $0 + $1.weight }) / Double(windowPoints.count)
        let delta = current - average

        return BodyWeightTrendSummary(
            windowLabel: label,
            delta: delta,
            state: classifyTrend(delta: delta)
        )
    }

    private func classifyTrend(delta: Double) -> BodyWeightTrendState {
        if delta <= -0.5 { return .decreasing }
        if delta >= 0.5 { return .increasing }
        return .stable
    }

    // MARK: - Chart helpers

    /// Calculate a simple moving average over the given window.
    private func calculateSMA(points: [WeightChartPoint], window: Int) -> [WeightChartPoint] {
        guard points.count >= 2 else { return points }

        return points.enumerated().map { index, point in
            let windowStart = max(0, index - window + 1)
            let windowSlice = points[windowStart...index]
            let avg = windowSlice.map(\.weight).reduce(0, +) / Double(windowSlice.count)
            return WeightChartPoint(date: point.date, weight: avg)
        }
    }

    private func deduplicateByDate(points: [WeightChartPoint]) -> [WeightChartPoint] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current

        var seen: Set<String> = []
        var deduped: [WeightChartPoint] = []

        for point in points {
            let key = formatter.string(from: point.date)
            if seen.contains(key) {
                continue
            }
            seen.insert(key)
            deduped.append(point)
        }

        return deduped
    }

    private func parse(_ value: String) -> Double? {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        guard let number = Double(normalized), number > 0 else {
            return nil
        }
        return number
    }
}
