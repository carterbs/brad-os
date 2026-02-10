import SwiftUI
import Charts

struct RHRHistoryView: View {
    @State private var viewModel = RHRHistoryViewModel()
    @State private var selectedDate: Date?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if viewModel.isLoading && viewModel.allHistory.isEmpty {
                    loadingState
                } else {
                    currentValueSection

                    if !viewModel.history.isEmpty {
                        trendChart
                    }

                    if let projected = viewModel.twoWeekProjectedValue,
                       let slope = viewModel.trendSlope {
                        projectionSection(projected: projected, weeklyRate: slope * 7)
                    }
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("RHR History")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task {
            await viewModel.loadData()
        }
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.textSecondary)
            Text("Loading RHR data...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.space8)
    }

    // MARK: - Current Value Section

    @ViewBuilder
    private var currentValueSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current RHR")

            HStack {
                if let value = viewModel.currentValue {
                    Image(systemName: "heart.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.destructive)
                    Text(String(format: "%.0f", value))
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("bpm")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                } else {
                    Image(systemName: "heart.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.textTertiary)
                    Text("No RHR data")
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

    // MARK: - Trend Chart

    @ViewBuilder
    private var trendChart: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            HStack {
                SectionHeader(title: "RHR Trend")
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    ForEach(HealthChartRange.allCases, id: \.self) { range in
                        FilterChip(
                            title: range.rawValue,
                            color: Theme.destructive,
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
                        Text(String(format: "%.0f bpm", nearest.value))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .foregroundStyle(Theme.destructive)
                    }
                    .transition(.opacity)
                }

                Chart {
                    // Actual data points
                    ForEach(viewModel.history) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("RHR", point.value)
                        )
                        .foregroundStyle(Theme.destructive.opacity(0.5))
                        .symbolSize(20)
                    }

                    // 7-day smoothed average line
                    ForEach(viewModel.smoothedHistory) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("RHR", point.value)
                        )
                        .foregroundStyle(Theme.destructive)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // 2-week projected trend (dashed)
                    if !viewModel.projectedTrendPoints.isEmpty {
                        ForEach(viewModel.projectedTrendPoints) { point in
                            LineMark(
                                x: .value("Date", point.date),
                                y: .value("RHR", point.value)
                            )
                            .foregroundStyle(Theme.destructive.opacity(0.35))
                            .interpolationMethod(.linear)
                            .lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 4]))
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
                            y: .value("RHR", nearest.value)
                        )
                        .foregroundStyle(Theme.destructive)
                        .symbolSize(50)

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("RHR", nearest.value)
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
                            .fill(Theme.destructive.opacity(0.5))
                            .frame(width: 6, height: 6)
                        Text("Daily")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    HStack(spacing: Theme.Spacing.space1) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Theme.destructive)
                            .frame(width: 16, height: 2)
                        Text("7-Day Avg")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    if !viewModel.projectedTrendPoints.isEmpty {
                        HStack(spacing: Theme.Spacing.space1) {
                            RoundedRectangle(cornerRadius: 1)
                                .stroke(Theme.destructive.opacity(0.35), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                                .frame(width: 16, height: 2)
                            Text("Projection")
                                .font(.caption)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }
                }
            }
            .glassCard()
        }
    }

    // MARK: - Projection Section

    @ViewBuilder
    private func projectionSection(projected: Double, weeklyRate: Double) -> some View {
        let trendColor = weeklyRate < 0 ? Theme.success : Theme.warning
        let trendIcon = weeklyRate < 0 ? "arrow.down.right" : "arrow.up.right"

        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "2-Week Projection")

            VStack(spacing: 0) {
                // Current rate
                HStack {
                    Image(systemName: trendIcon)
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(trendColor)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(trendColor.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Current Rate")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "%.1f bpm/week", abs(weeklyRate)))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Projected RHR in 2 weeks
                HStack {
                    Image(systemName: "sparkle")
                        .font(.system(size: Theme.Typography.iconMD))
                        .foregroundStyle(trendColor)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                        .background(trendColor.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Projected RHR")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "~%.0f bpm in 2 weeks", projected))
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

    // MARK: - Helpers

    private func nearestPoint(to date: Date) -> HealthMetricChartPoint? {
        viewModel.history.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        RHRHistoryView()
    }
    .preferredColorScheme(.dark)
}
