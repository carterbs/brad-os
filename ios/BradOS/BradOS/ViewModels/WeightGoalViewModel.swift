import Foundation
import SwiftUI
import BradOSCore

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

/// Data point for the weight chart (actual or smoothed)
struct WeightChartPoint: Identifiable {
    let id = UUID()
    let date: Date
    let weight: Double
}

/// Prediction result from linear regression
struct WeightPrediction {
    let predictedDate: Date?         // nil if moving away from goal
    let weeklyRateLbs: Double        // lbs/week (negative = losing)
    let isOnTrack: Bool              // reaching goal by target date?
    let daysRemaining: Int?          // nil if not on track
}

/// Trend classification state
enum WeightTrendState {
    case losing
    case stable
    case gaining
}

/// Recent trend window with computed delta and state
struct RecentWeightTrend {
    let windowDays: Int
    let deltaLbs: Double
    let state: WeightTrendState
}

@MainActor
@Observable
class WeightGoalViewModel {

    // MARK: - State

    var allWeightHistory: [WeightChartPoint] = []
    var allSmoothedHistory: [WeightChartPoint] = []
    var selectedRange: WeightChartRange = .sixMonths
    var currentWeight: Double?
    var targetWeight: String = ""
    var targetDate = Date().addingTimeInterval(60 * 60 * 24 * 56) // 8 weeks default
    var prediction: WeightPrediction?
    var trendSlope: Double?              // lbs/day from regression (independent of goal)
    var existingGoal: WeightGoalResponse?
    var isLoading = false
    var isSaving = false
    var error: String?
    var saveSuccess = false

    // Manual entry state
    var entryWeight: String = ""
    var entryDate = Date()
    var isLoggingEntry = false
    var entryLogSuccess = false

    private let apiClient: any WeightGoalAPIClientProtocol

    init(apiClient: any WeightGoalAPIClientProtocol = APIClient.shared) {
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

    /// 14-day projected trend line from regression, starting at last smoothed point
    var projectedTrendPoints: [WeightChartPoint] {
        guard let slope = trendSlope,
              let lastPoint = allSmoothedHistory.last,
              abs(slope) > 0.001 else { return [] }

        // Include the last real point so the line connects seamlessly
        var points = [WeightChartPoint(date: lastPoint.date, weight: lastPoint.weight)]
        for day in 1...14 {
            guard let date = Calendar.current.date(byAdding: .day, value: day, to: lastPoint.date) else { continue }
            points.append(WeightChartPoint(date: date, weight: lastPoint.weight + slope * Double(day)))
        }
        return points
    }

    /// Projected weight 2 weeks from now based on current trend
    var twoWeekProjectedWeight: Double? {
        guard let slope = trendSlope,
              let lastPoint = allSmoothedHistory.last,
              abs(slope) > 0.001 else { return nil }
        return lastPoint.weight + slope * 14
    }

    var weeklyRate: Double? {
        guard let current = currentWeight,
              let target = Double(targetWeight) else { return nil }
        let weeks = Calendar.current.dateComponents([.weekOfYear], from: Date(), to: targetDate).weekOfYear ?? 1
        return (current - target) / Double(max(weeks, 1))
    }

    var rateLabel: String {
        guard let rate = weeklyRate else { return "" }
        let absRate = abs(rate)
        if absRate > 2 { return "Aggressive" }
        if absRate > 1 { return "Moderate" }
        return "Conservative"
    }

    var rateColor: Color {
        guard let rate = weeklyRate else { return Theme.textSecondary }
        let absRate = abs(rate)
        if absRate > 2 { return Theme.warning }
        return Theme.success
    }

    /// Recent 7-day and 30-day trend states computed from weight history
    var recentTrendStates: [RecentWeightTrend] {
        computeTrendStates()
    }

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        // Fetch current weight + history + goal from Firebase in parallel
        async let latestWeight = loadLatestWeight()
        async let loadHistory: Void = loadWeightHistory()
        async let loadGoal: Void = loadWeightGoal()

        currentWeight = await latestWeight
        await loadHistory
        await loadGoal

        // Compute trend slope (works without a goal set)
        updateTrend()

        // Calculate goal prediction if we have a target
        updatePrediction()
    }

    private func loadLatestWeight() async -> Double? {
        do {
            let entry = try await apiClient.getLatestWeight()
            return entry?.weightLbs
        } catch {
            DebugLogger.error("Error loading latest weight: \(error)", attributes: ["source": "WeightGoalVM"])
            return nil
        }
    }

    private func loadWeightHistory() async {
        do {
            let entries = try await apiClient.getWeightHistory(days: 365)
            let points = entries.compactMap { entry -> WeightChartPoint? in
                guard let date = entry.parsedDate else { return nil }
                return WeightChartPoint(date: date, weight: entry.weightLbs)
            }.sorted { $0.date < $1.date }

            // Deduplicate by date (keep latest entry per day)
            var seen = Set<String>()
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            var deduped: [WeightChartPoint] = []
            for point in points.reversed() {
                let key = formatter.string(from: point.date)
                if !seen.contains(key) {
                    seen.insert(key)
                    deduped.append(point)
                }
            }
            allWeightHistory = deduped.reversed()

            // Calculate 7-day SMA on full history
            allSmoothedHistory = calculateSMA(points: allWeightHistory, window: 7)
        } catch let apiError as APIError where apiError.code == .notFound {
            // No weight data yet — treat as empty
            allWeightHistory = []
            allSmoothedHistory = []
        } catch {
            self.error = "Failed to load weight history"
            DebugLogger.error("Error loading history: \(error)", attributes: ["source": "WeightGoalVM"])
        }
    }

    private func loadWeightGoal() async {
        do {
            existingGoal = try await apiClient.getWeightGoal()
            if let goal = existingGoal {
                targetWeight = String(format: "%.0f", goal.targetWeightLbs)
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = .current
                if let date = formatter.date(from: goal.targetDate) {
                    targetDate = date
                }
            }
        } catch {
            // 404 = no goal set, that's fine
            existingGoal = nil
        }
    }

    // MARK: - 7-Day Simple Moving Average

    private func calculateSMA(points: [WeightChartPoint], window: Int) -> [WeightChartPoint] {
        guard points.count >= 2 else { return points }

        return points.enumerated().map { index, point in
            let windowStart = max(0, index - window + 1)
            let windowSlice = points[windowStart...index]
            let avg = windowSlice.map(\.weight).reduce(0, +) / Double(windowSlice.count)
            return WeightChartPoint(date: point.date, weight: avg)
        }
    }

    // MARK: - Trend (independent of goal)

    /// Compute regression slope from recent smoothed data. Requires at least 7 data points.
    func updateTrend() {
        let recentPoints = Array(allSmoothedHistory.suffix(28))
        guard recentPoints.count >= 7 else {
            trendSlope = nil
            return
        }
        trendSlope = linearRegression(points: recentPoints).slope
    }

    // MARK: - Prediction via Linear Regression

    func updatePrediction() {
        guard let target = Double(targetWeight), !allSmoothedHistory.isEmpty else {
            prediction = nil
            return
        }

        // Reuse already-computed trend slope, or compute from visible range
        let dailyRate: Double
        if let slope = trendSlope {
            dailyRate = slope
        } else {
            let recentPoints = Array(allSmoothedHistory.suffix(28))
            guard recentPoints.count >= 3 else {
                prediction = nil
                return
            }
            dailyRate = linearRegression(points: recentPoints).slope
        }

        // If rate is zero or moving away from goal, can't predict
        guard let lastPoint = allSmoothedHistory.last else { return }
        let current = lastPoint.weight
        let needToLose = current > target
        let movingRight = (needToLose && dailyRate < 0) || (!needToLose && dailyRate > 0)

        guard movingRight, abs(dailyRate) > 0.001 else {
            prediction = WeightPrediction(
                predictedDate: nil,
                weeklyRateLbs: dailyRate * 7,
                isOnTrack: false,
                daysRemaining: nil
            )
            return
        }

        // Days until target weight
        let lbsToGo = target - current
        let daysToGoal = lbsToGo / dailyRate
        let predictedDate = Calendar.current.date(byAdding: .day, value: Int(daysToGoal), to: Date())
        let isOnTrack = predictedDate.map { $0 <= targetDate } ?? false

        prediction = WeightPrediction(
            predictedDate: predictedDate,
            weeklyRateLbs: dailyRate * 7,
            isOnTrack: isOnTrack,
            daysRemaining: Int(daysToGoal)
        )
    }

    /// Least-squares linear regression. Returns (slope, intercept) where
    /// x = days since first point, y = weight.
    private func linearRegression(points: [WeightChartPoint]) -> (slope: Double, intercept: Double) {
        let count = Double(points.count)
        guard count >= 2, let firstDate = points.first?.date else {
            return (slope: 0, intercept: points.first?.weight ?? 0)
        }

        var sumX = 0.0, sumY = 0.0, sumXY = 0.0, sumX2 = 0.0

        for point in points {
            let x = point.date.timeIntervalSince(firstDate) / 86400.0 // days
            let y = point.weight
            sumX += x
            sumY += y
            sumXY += x * y
            sumX2 += x * x
        }

        let denominator = count * sumX2 - sumX * sumX
        guard abs(denominator) > 1e-10 else {
            return (slope: 0, intercept: sumY / count)
        }

        let slope = (count * sumXY - sumX * sumY) / denominator
        let intercept = (sumY - slope * sumX) / count

        return (slope: slope, intercept: intercept)
    }

    // MARK: - Save

    func saveGoal() async {
        guard let target = Double(targetWeight),
              let current = currentWeight ?? smoothedHistory.last?.weight else { return }

        isSaving = true
        saveSuccess = false
        defer { isSaving = false }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")

        let targetDateStr = formatter.string(from: targetDate)
        let startDateStr = existingGoal?.startDate ?? formatter.string(from: Date())
        let startWeight = existingGoal?.startWeightLbs ?? current

        do {
            existingGoal = try await apiClient.saveWeightGoal(
                targetWeightLbs: target,
                targetDate: targetDateStr,
                startWeightLbs: startWeight,
                startDate: startDateStr
            )
            saveSuccess = true
        } catch {
            self.error = "Failed to save goal"
            DebugLogger.error("Error saving goal: \(error)", attributes: ["source": "WeightGoalVM"])
        }
    }

    // MARK: - Manual Entry

    /// Log a manual body-weight entry (lbs) for the given date
    func logBodyWeightEntry() async {
        // Validate input
        guard !entryWeight.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "Weight is required"
            return
        }

        guard let weight = Double(entryWeight), weight > 0 else {
            error = "Weight must be a positive number"
            return
        }

        isLoggingEntry = true
        entryLogSuccess = false
        error = nil
        defer { isLoggingEntry = false }

        // Format date as yyyy-MM-dd
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let dateStr = formatter.string(from: entryDate)

        do {
            // Send a single manual weight entry
            let entry = WeightSyncEntry(weightLbs: weight, date: dateStr, source: "manual")
            _ = try await apiClient.syncWeightBulk(weights: [entry])

            // Reload data to reflect new entry
            await loadLatestWeightAndHistory()
            updateTrend()
            updatePrediction()

            entryLogSuccess = true
            entryWeight = ""
            entryDate = Date()
        } catch {
            self.error = "Failed to log weight entry"
            DebugLogger.error("Error logging weight entry: \(error)", attributes: ["source": "WeightGoalVM"])
        }
    }

    /// Reload latest weight and history after a manual entry
    private func loadLatestWeightAndHistory() async {
        currentWeight = await loadLatestWeight()
        await loadWeightHistory()
    }

    // MARK: - Trend State Computation

    /// Compute 7-day and 30-day trend states from weight history
    private func computeTrendStates() -> [RecentWeightTrend] {
        guard !allWeightHistory.isEmpty else { return [] }

        var trends: [RecentWeightTrend] = []

        // 7-day window
        let sevenDayState = computeWindowState(windowDays: 7)
        trends.append(sevenDayState)

        // 30-day window
        let thirtyDayState = computeWindowState(windowDays: 30)
        trends.append(thirtyDayState)

        return trends
    }

    /// Compute trend state for a specific window size
    /// Current weight - average(window) determines the state
    private func computeWindowState(windowDays: Int) -> RecentWeightTrend {
        guard let lastPoint = allWeightHistory.last else {
            return RecentWeightTrend(windowDays: windowDays, deltaLbs: 0, state: .stable)
        }

        let current = lastPoint.weight
        let cutoff = Calendar.current.date(byAdding: .day, value: -windowDays, to: lastPoint.date) ?? lastPoint.date
        let windowPoints = allWeightHistory.filter { $0.date >= cutoff }

        guard !windowPoints.isEmpty else {
            return RecentWeightTrend(windowDays: windowDays, deltaLbs: 0, state: .stable)
        }

        let avg = windowPoints.map(\.weight).reduce(0, +) / Double(windowPoints.count)
        let delta = current - avg

        // Classify: thresholds are ±0.5 lbs
        let state: WeightTrendState
        if delta < -0.5 {
            state = .losing
        } else if delta > 0.5 {
            state = .gaining
        } else {
            state = .stable
        }

        return RecentWeightTrend(windowDays: windowDays, deltaLbs: delta, state: state)
    }

    // MARK: - Chart Helpers

    var chartYDomain: ClosedRange<Double> {
        let allWeights = weightHistory.map(\.weight) + projectedTrendPoints.map(\.weight)
        var minWeight = allWeights.min() ?? 150
        var maxWeight = allWeights.max() ?? 200

        if let target = Double(targetWeight) {
            minWeight = min(minWeight, target)
            maxWeight = max(maxWeight, target)
        }

        let padding = max((maxWeight - minWeight) * 0.1, 2)
        return (minWeight - padding)...(maxWeight + padding)
    }

    func rateGuidanceIcon(rate: Double) -> String {
        let absRate = abs(rate)
        if absRate > 2 { return "exclamationmark.triangle.fill" }
        if absRate > 1 { return "info.circle.fill" }
        return "checkmark.circle.fill"
    }

    func rateGuidanceMessage(rate: Double) -> String {
        let absRate = abs(rate)
        let direction = rate > 0 ? "loss" : "gain"
        if absRate > 2 {
            return "This rate of \(direction) may be too aggressive. Consider extending your target date for sustainable results."
        } else if absRate > 1 {
            return "A moderate rate of \(direction). Make sure to maintain adequate nutrition for recovery."
        }
        return "A conservative and sustainable rate of \(direction). Great for long-term success!"
    }
}
