import SwiftUI
import Charts
import BradOSCore

// MARK: - Chart & Prediction Sections

extension WeightGoalView {

    // MARK: - Weight Trend Chart

    @ViewBuilder
    var weightTrendChart: some View {
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

                    // 2-week projected trend (dashed)
                    if !viewModel.projectedTrendPoints.isEmpty {
                        ForEach(viewModel.projectedTrendPoints) { point in
                            LineMark(
                                x: .value("Date", point.date),
                                y: .value("Weight", point.weight)
                            )
                            .foregroundStyle(Theme.interactivePrimary.opacity(0.35))
                            .interpolationMethod(.linear)
                            .lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 4]))
                        }
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
                                        guard let plotFrame = chart.plotFrame else { return }
                                        let origin = geo[plotFrame].origin
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
                chartLegend
            }
            .glassCard()
        }
    }

    @ViewBuilder
    var chartLegend: some View {
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

            if !viewModel.projectedTrendPoints.isEmpty {
                HStack(spacing: Theme.Spacing.space1) {
                    RoundedRectangle(cornerRadius: 1)
                        .stroke(Theme.interactivePrimary.opacity(0.35), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                        .frame(width: 16, height: 2)
                    Text("Projection")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                }
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

    // MARK: - 2-Week Projection Section

    @ViewBuilder
    func twoWeekProjectionSection(projected: Double, weeklyRate: Double) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "2-Week Projection")

            VStack(spacing: 0) {
                // Current rate
                HStack {
                    Image(systemName: weeklyRate < 0 ? "arrow.down.right" : "arrow.up.right")
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(Theme.interactivePrimary)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(Theme.interactivePrimary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Current Rate")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "%.1f lbs/week", abs(weeklyRate)))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Projected weight in 2 weeks
                HStack {
                    Image(systemName: "sparkle")
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(Theme.interactivePrimary)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(Theme.interactivePrimary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Projected Weight")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "~%.0f lbs in 2 weeks", projected))
                            .font(.caption)
                            .monospacedDigit()
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

    // MARK: - Prediction Section

    @ViewBuilder
    func predictionSection(_ prediction: WeightPrediction) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Trend Prediction")

            VStack(spacing: 0) {
                // Weekly rate
                predictionRateRow(prediction)

                Divider().background(Theme.divider)

                // Predicted date
                predictionDateRow(prediction)

                // On track / off track banner
                predictionBanner(prediction)
            }
            .glassCard(.card, padding: 0)
        }
    }

    @ViewBuilder
    func predictionRateRow(_ prediction: WeightPrediction) -> some View {
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
    }

    @ViewBuilder
    func predictionDateRow(_ prediction: WeightPrediction) -> some View {
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
    }

    @ViewBuilder
    func predictionBanner(_ prediction: WeightPrediction) -> some View {
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

    // MARK: - Helpers

    func nearestPoint(to date: Date) -> WeightChartPoint? {
        viewModel.weightHistory.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }
}
