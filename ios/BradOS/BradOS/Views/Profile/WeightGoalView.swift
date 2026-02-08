import SwiftUI
import Charts

struct WeightGoalView: View {
    @EnvironmentObject var healthKit: HealthKitManager

    @State private var targetWeight: String = ""
    @State private var targetDate = Date().addingTimeInterval(60 * 60 * 24 * 56) // 8 weeks
    @State private var isSaving = false
    @State private var currentWeight: Double?
    @State private var weightHistory: [WeightDataPoint] = []

    var weeklyRate: Double? {
        guard let current = currentWeight,
              let target = Double(targetWeight) else { return nil }

        let weeks = Calendar.current.dateComponents([.weekOfYear], from: Date(), to: targetDate).weekOfYear ?? 1
        return (current - target) / Double(max(weeks, 1))
    }

    var rateLabel: String {
        guard let rate = weeklyRate else { return "" }
        let absRate = abs(rate)
        if absRate > 2 {
            return "Aggressive"
        } else if absRate > 1 {
            return "Moderate"
        } else {
            return "Conservative"
        }
    }

    var rateColor: Color {
        guard let rate = weeklyRate else { return Theme.textSecondary }
        let absRate = abs(rate)
        if absRate > 2 {
            return Theme.warning
        } else {
            return Theme.success
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                // Current Weight Section
                currentWeightSection

                // Weight Trend Chart
                if !weightHistory.isEmpty {
                    weightTrendChart
                }

                // Goal Section
                goalSection

                // Projected Rate Section
                if weeklyRate != nil {
                    projectedRateSection
                }

                // Save Button Section
                saveButtonSection
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Weight Goal")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task {
            await loadWeightData()
        }
    }

    // MARK: - Current Weight Section

    @ViewBuilder
    private var currentWeightSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current Weight")

            VStack(spacing: 0) {
                HStack {
                    if let weight = currentWeight {
                        Text("\(Int(weight))")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(Theme.textPrimary)
                        Text("lbs")
                            .foregroundStyle(Theme.textSecondary)
                    } else {
                        Text("No weight data from HealthKit")
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Weight Trend Chart

    @ViewBuilder
    private var weightTrendChart: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Weight Trend")

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Chart {
                    // Weight data points
                    ForEach(weightHistory) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Weight", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .interpolationMethod(.catmullRom)

                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("Weight", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .symbolSize(30)
                    }

                    // Goal line (if set)
                    if let target = Double(targetWeight), target > 0 {
                        RuleMark(y: .value("Goal", target))
                            .foregroundStyle(Theme.success)
                            .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 5]))
                            .annotation(position: .trailing, alignment: .leading) {
                                Text("Goal")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.success)
                            }
                    }
                }
                .chartYScale(domain: chartYDomain)
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel()
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .frame(height: 200)

                // Legend
                HStack(spacing: Theme.Spacing.space4) {
                    HStack(spacing: Theme.Spacing.space1) {
                        Circle()
                            .fill(Theme.interactivePrimary)
                            .frame(width: 8, height: 8)
                        Text("Weight")
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                    }

                    if Double(targetWeight) != nil {
                        HStack(spacing: Theme.Spacing.space1) {
                            Rectangle()
                                .fill(Theme.success)
                                .frame(width: 16, height: 2)
                            Text("Goal")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                }
            }
            .glassCard()
        }
    }

    private var chartYDomain: ClosedRange<Double> {
        let weights = weightHistory.map(\.weight)
        var minWeight = weights.min() ?? 150
        var maxWeight = weights.max() ?? 200

        // Include goal in domain if set
        if let target = Double(targetWeight) {
            minWeight = min(minWeight, target)
            maxWeight = max(maxWeight, target)
        }

        // Add some padding
        let padding = (maxWeight - minWeight) * 0.1
        return (minWeight - padding)...(maxWeight + padding)
    }

    // MARK: - Goal Section

    @ViewBuilder
    private var goalSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Goal")

            VStack(spacing: 0) {
                // Target Weight Input
                HStack {
                    Text("Target Weight (lbs)")
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    TextField("Enter weight", text: $targetWeight)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .foregroundColor(Theme.textPrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                // Target Date Picker
                DatePicker(
                    "Target Date",
                    selection: $targetDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Projected Rate Section

    @ViewBuilder
    private var projectedRateSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Projected Rate")

            VStack(spacing: 0) {
                HStack {
                    if let rate = weeklyRate {
                        Text(String(format: "%.1f lbs/week", abs(rate)))
                            .font(.headline)
                            .foregroundColor(Theme.textPrimary)
                    }
                    Spacer()
                    Text(rateLabel)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, Theme.Spacing.space2)
                        .padding(.vertical, Theme.Spacing.space1)
                        .background(rateColor.opacity(0.2))
                        .foregroundStyle(rateColor)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                // Rate guidance
                if let rate = weeklyRate {
                    Divider()
                        .background(Theme.strokeSubtle)

                    HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                        Image(systemName: rateGuidanceIcon(rate: rate))
                            .font(.caption)
                            .foregroundStyle(rateColor)
                        Text(rateGuidanceMessage(rate: rate))
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    private func rateGuidanceIcon(rate: Double) -> String {
        let absRate = abs(rate)
        if absRate > 2 {
            return "exclamationmark.triangle.fill"
        } else if absRate > 1 {
            return "info.circle.fill"
        } else {
            return "checkmark.circle.fill"
        }
    }

    private func rateGuidanceMessage(rate: Double) -> String {
        let absRate = abs(rate)
        let direction = rate > 0 ? "loss" : "gain"

        if absRate > 2 {
            return "This rate of \(direction) may be too aggressive. Consider extending your target date for sustainable results."
        } else if absRate > 1 {
            return "A moderate rate of \(direction). Make sure to maintain adequate nutrition for recovery."
        } else {
            return "A conservative and sustainable rate of \(direction). Great for long-term success!"
        }
    }

    // MARK: - Save Button Section

    @ViewBuilder
    private var saveButtonSection: some View {
        Button(action: saveGoal) {
            HStack {
                if isSaving {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Save Goal")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(targetWeight.isEmpty || isSaving)
        .opacity(targetWeight.isEmpty ? 0.5 : 1.0)
    }

    // MARK: - Actions

    private func loadWeightData() async {
        do {
            currentWeight = try await healthKit.fetchLatestWeight()

            // Load weight history (last 8 weeks)
            weightHistory = try await loadWeightHistory()
        } catch {
            print("Failed to load weight: \(error)")
        }
    }

    private func loadWeightHistory() async throws -> [WeightDataPoint] {
        let readings = try await healthKit.fetchWeightHistory(days: 56) // 8 weeks
        return readings.map { WeightDataPoint(date: $0.date, weight: $0.valueLbs) }
    }

    private func saveGoal() {
        guard let target = Double(targetWeight), target > 0 else { return }
        guard let startWeight = currentWeight else { return }
        isSaving = true

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        Task {
            do {
                _ = try await APIClient.shared.saveWeightGoal(
                    targetWeightLbs: target,
                    targetDate: dateFormatter.string(from: targetDate),
                    startWeightLbs: startWeight,
                    startDate: dateFormatter.string(from: Date())
                )
            } catch {
                print("Failed to save weight goal: \(error)")
            }
            isSaving = false
        }
    }
}

// MARK: - Weight Data Point

struct WeightDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let weight: Double
}

// MARK: - Preview

#Preview {
    NavigationStack {
        WeightGoalView()
            .environmentObject(HealthKitManager())
    }
    .preferredColorScheme(.dark)
}
