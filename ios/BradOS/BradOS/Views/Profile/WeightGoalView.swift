import SwiftUI
import Charts

struct WeightGoalView: View {
    @State private var viewModel = WeightGoalViewModel()
    @State private var selectedDate: Date?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if viewModel.isLoading && viewModel.allWeightHistory.isEmpty {
                    loadingState
                } else {
                    // Current Weight
                    currentWeightSection

                    // Weight Trend Chart
                    if !viewModel.weightHistory.isEmpty {
                        weightTrendChart
                    }

                    // Prediction
                    if let prediction = viewModel.prediction {
                        predictionSection(prediction)
                    }

                    // Goal Input
                    goalSection

                    // Projected Rate
                    if viewModel.weeklyRate != nil {
                        projectedRateSection
                    }

                    // Save Button
                    saveButtonSection

                    // Success Banner
                    if viewModel.saveSuccess {
                        successBanner
                    }
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Weight Goal")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task {
            await viewModel.loadData()
        }
        .onChange(of: viewModel.targetWeight) {
            viewModel.updatePrediction()
        }
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.textSecondary)
            Text("Loading weight data...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.space8)
    }

    // MARK: - Current Weight Section

    @ViewBuilder
    private var currentWeightSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current Weight")

            HStack {
                if let weight = viewModel.currentWeight {
                    Text("\(Int(weight))")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("lbs")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                } else if !viewModel.weightHistory.isEmpty, let latest = viewModel.weightHistory.last {
                    Text("\(Int(latest.weight))")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("lbs")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Text("(from sync)")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                } else {
                    Image(systemName: "scalemass")
                        .font(.title3)
                        .foregroundStyle(Theme.textTertiary)
                    Text("No weight data")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()
            }
            .padding(Theme.Spacing.space4)
            .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Weight Trend Chart

    @ViewBuilder
    private var weightTrendChart: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            HStack {
                SectionHeader(title: "Weight Trend")
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    ForEach(WeightChartRange.allCases, id: \.self) { range in
                        FilterChip(
                            title: range.rawValue,
                            isSelected: viewModel.selectedRange == range
                        ) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                viewModel.selectedRange = range
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                // Selected point detail
                if let selectedDate,
                   let nearest = nearestPoint(to: selectedDate) {
                    HStack(spacing: Theme.Spacing.space2) {
                        Text(nearest.date, format: .dateTime.month(.abbreviated).day())
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                        Text(String(format: "%.1f lbs", nearest.weight))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .foregroundStyle(Theme.interactivePrimary)
                    }
                    .transition(.opacity)
                }

                Chart {
                    // Actual weight points
                    ForEach(viewModel.weightHistory) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("Weight", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary.opacity(0.5))
                        .symbolSize(20)
                    }

                    // 7-day smoothed average line
                    ForEach(viewModel.smoothedHistory) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Weight", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // Goal line
                    if let target = Double(viewModel.targetWeight), target > 0 {
                        RuleMark(y: .value("Goal", target))
                            .foregroundStyle(Theme.success)
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                            .annotation(position: .trailing, alignment: .leading) {
                                Text("Goal")
                                    .font(.caption2)
                                    .fontWeight(.medium)
                                    .foregroundStyle(Theme.success)
                            }
                    }

                    // Selection indicator
                    if let selectedDate,
                       let nearest = nearestPoint(to: selectedDate) {
                        RuleMark(x: .value("Selected", nearest.date))
                            .foregroundStyle(Theme.textSecondary.opacity(0.4))
                            .lineStyle(StrokeStyle(lineWidth: 1))

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("Weight", nearest.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .symbolSize(50)

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("Weight", nearest.weight)
                        )
                        .foregroundStyle(.white)
                        .symbolSize(20)
                    }
                }
                .chartYScale(domain: viewModel.chartYDomain)
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel()
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month, count: 2)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
                .frame(height: 200)
                .chartOverlay { chart in
                    GeometryReader { geo in
                        Rectangle()
                            .fill(.clear)
                            .contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { value in
                                        let origin = geo[chart.plotFrame!].origin
                                        let x = value.location.x - origin.x
                                        if let date: Date = chart.value(atX: x) {
                                            selectedDate = date
                                        }
                                    }
                                    .onEnded { _ in
                                        selectedDate = nil
                                    }
                            )
                    }
                }

                // Legend
                HStack(spacing: Theme.Spacing.space4) {
                    HStack(spacing: Theme.Spacing.space1) {
                        Circle()
                            .fill(Theme.interactivePrimary.opacity(0.5))
                            .frame(width: 6, height: 6)
                        Text("Daily")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    HStack(spacing: Theme.Spacing.space1) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Theme.interactivePrimary)
                            .frame(width: 16, height: 2)
                        Text("7-Day Avg")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    if Double(viewModel.targetWeight) != nil {
                        HStack(spacing: Theme.Spacing.space1) {
                            RoundedRectangle(cornerRadius: 1)
                                .fill(Theme.success)
                                .frame(width: 16, height: 2)
                            Text("Goal")
                                .font(.caption)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }
                }
            }
            .glassCard()
        }
    }

    // MARK: - Prediction Section

    @ViewBuilder
    private func predictionSection(_ prediction: WeightPrediction) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Trend Prediction")

            VStack(spacing: 0) {
                // Weekly rate
                HStack {
                    Image(systemName: "chart.line.downtrend.xyaxis")
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(prediction.isOnTrack ? Theme.success : Theme.warning)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(
                            (prediction.isOnTrack ? Theme.success : Theme.warning).opacity(0.12)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Current Rate")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "%.1f lbs/week", abs(prediction.weeklyRateLbs)))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Predicted date
                HStack {
                    Image(systemName: prediction.isOnTrack ? "calendar.badge.checkmark" : "calendar.badge.exclamationmark")
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(prediction.isOnTrack ? Theme.success : Theme.warning)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(
                            (prediction.isOnTrack ? Theme.success : Theme.warning).opacity(0.12)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        if let date = prediction.predictedDate {
                            Text("Predicted to reach goal")
                                .font(.subheadline)
                                .foregroundStyle(Theme.textPrimary)
                            Text(date, style: .date)
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(Theme.textSecondary)
                            if let days = prediction.daysRemaining {
                                Text("~\(days) days")
                                    .font(.caption)
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        } else {
                            Text("Not on track")
                                .font(.subheadline)
                                .foregroundStyle(Theme.textPrimary)
                            Text("Current trend is moving away from goal")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                // On track / off track banner
                if prediction.isOnTrack {
                    Divider().background(Theme.divider)
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(Theme.success)
                        Text("On track to reach your goal by target date")
                            .font(.caption)
                            .foregroundStyle(Theme.success)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                    .background(Theme.success.opacity(0.08))
                } else if prediction.predictedDate != nil {
                    Divider().background(Theme.divider)
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(Theme.warning)
                        Text("At current rate, you'll miss your target date. Consider adjusting.")
                            .font(.caption)
                            .foregroundStyle(Theme.warning)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                    .background(Theme.warning.opacity(0.08))
                }
            }
            .glassCard(.card, padding: 0)
        }
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
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                    TextField("Enter weight", text: $viewModel.targetWeight)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .font(.body)
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Target Date Picker
                DatePicker(
                    "Target Date",
                    selection: $viewModel.targetDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
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
            SectionHeader(title: "Goal Rate")

            VStack(spacing: 0) {
                HStack {
                    if let rate = viewModel.weeklyRate {
                        Text(String(format: "%.1f lbs/week", abs(rate)))
                            .font(.headline)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                    }
                    Spacer()
                    Text(viewModel.rateLabel)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, Theme.Spacing.space2)
                        .padding(.vertical, Theme.Spacing.space1)
                        .background(viewModel.rateColor.opacity(0.15))
                        .foregroundStyle(viewModel.rateColor)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                if let rate = viewModel.weeklyRate {
                    Divider().background(Theme.divider)

                    HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                        Image(systemName: viewModel.rateGuidanceIcon(rate: rate))
                            .font(.caption)
                            .foregroundStyle(viewModel.rateColor)
                        Text(viewModel.rateGuidanceMessage(rate: rate))
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

    // MARK: - Save Button

    @ViewBuilder
    private var saveButtonSection: some View {
        Button {
            Task { await viewModel.saveGoal() }
        } label: {
            HStack {
                if viewModel.isSaving {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Save Goal")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(viewModel.targetWeight.isEmpty || viewModel.isSaving)
        .opacity(viewModel.targetWeight.isEmpty ? 0.5 : 1.0)
    }

    // MARK: - Success Banner

    @ViewBuilder
    private var successBanner: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.success)
            Text("Goal saved")
                .font(.subheadline)
                .foregroundStyle(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.success.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                withAnimation { viewModel.saveSuccess = false }
            }
        }
    }

    // MARK: - Helpers

    private func nearestPoint(to date: Date) -> WeightChartPoint? {
        viewModel.weightHistory.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        WeightGoalView()
    }
    .preferredColorScheme(.dark)
}
