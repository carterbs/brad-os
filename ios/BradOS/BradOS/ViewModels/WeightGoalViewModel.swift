import Foundation
import SwiftUI
import BradOSCore

/// Data point for the weight chart (actual or smoothed)
struct WeightChartPoint: Identifiable {
    let id = UUID()
    let date: Date
    let weight: Double
}

/// Prediction result from linear regression
struct WeightPrediction {
    let predictedDate: Date?         // nil if moving away from goal
    let dailyRateLbs: Double         // lbs/day (negative = losing)
    let weeklyRateLbs: Double        // lbs/week (negative = losing)
    let isOnTrack: Bool              // reaching goal by target date?
    let daysRemaining: Int?          // nil if not on track
}

@MainActor
@Observable
class WeightGoalViewModel {

    // MARK: - State

    var weightHistory: [WeightChartPoint] = []
    var smoothedHistory: [WeightChartPoint] = []
    var currentWeight: Double?
    var targetWeight: String = ""
    var targetDate = Date().addingTimeInterval(60 * 60 * 24 * 56) // 8 weeks default
    var prediction: WeightPrediction?
    var existingGoal: WeightGoalResponse?
    var isLoading = false
    var isSaving = false
    var error: String?
    var saveSuccess = false

    private let apiClient = APIClient.shared

    // MARK: - Computed

    var hasGoal: Bool {
        Double(targetWeight) != nil
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

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        // Fetch current weight + history + goal from Firebase in parallel
        async let latestWeight = loadLatestWeight()
        async let apiHistory = loadWeightHistory()
        async let apiGoal = loadWeightGoal()

        currentWeight = await latestWeight
        await apiHistory
        await apiGoal

        // Calculate prediction if we have enough data
        updatePrediction()
    }

    private func loadLatestWeight() async -> Double? {
        do {
            let entry = try await apiClient.getLatestWeight()
            return entry?.weightLbs
        } catch {
            print("[WeightGoalVM] Error loading latest weight: \(error)")
            return nil
        }
    }

    private func loadWeightHistory() async {
        do {
            let entries = try await apiClient.getWeightHistory(days: 90)
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
            weightHistory = deduped.reversed()

            // Calculate 7-day SMA
            smoothedHistory = calculateSMA(points: weightHistory, window: 7)
        } catch let apiError as APIError where apiError.code == .notFound {
            // No weight data yet — treat as empty
            weightHistory = []
            smoothedHistory = []
        } catch {
            self.error = "Failed to load weight history"
            print("[WeightGoalVM] Error loading history: \(error)")
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

    // MARK: - Prediction via Linear Regression

    func updatePrediction() {
        guard let target = Double(targetWeight), !smoothedHistory.isEmpty else {
            prediction = nil
            return
        }

        // Use last 28 days of data for regression (or all if less)
        let recentPoints = smoothedHistory.suffix(28)
        guard recentPoints.count >= 3 else {
            prediction = nil
            return
        }

        let regression = linearRegression(points: Array(recentPoints))
        let dailyRate = regression.slope  // lbs per day

        // If rate is zero or moving away from goal, can't predict
        let current = recentPoints.last!.weight
        let needToLose = current > target
        let movingRight = (needToLose && dailyRate < 0) || (!needToLose && dailyRate > 0)

        guard movingRight, abs(dailyRate) > 0.001 else {
            prediction = WeightPrediction(
                predictedDate: nil,
                dailyRateLbs: dailyRate,
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
            dailyRateLbs: dailyRate,
            weeklyRateLbs: dailyRate * 7,
            isOnTrack: isOnTrack,
            daysRemaining: Int(daysToGoal)
        )
    }

    /// Least-squares linear regression. Returns (slope, intercept) where
    /// x = days since first point, y = weight.
    private func linearRegression(points: [WeightChartPoint]) -> (slope: Double, intercept: Double) {
        let n = Double(points.count)
        guard n >= 2, let firstDate = points.first?.date else {
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

        let denominator = n * sumX2 - sumX * sumX
        guard abs(denominator) > 1e-10 else {
            return (slope: 0, intercept: sumY / n)
        }

        let slope = (n * sumXY - sumX * sumY) / denominator
        let intercept = (sumY - slope * sumX) / n

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
            print("[WeightGoalVM] Error saving goal: \(error)")
        }
    }

    // MARK: - Chart Helpers

    var chartYDomain: ClosedRange<Double> {
        let allWeights = weightHistory.map(\.weight)
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
