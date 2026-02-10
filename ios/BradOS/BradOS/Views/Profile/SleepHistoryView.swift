import SwiftUI
import Charts

struct SleepHistoryView: View {
    @State private var viewModel = SleepHistoryViewModel()
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
                        stageBreakdown
                    }
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Sleep History")
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
            Text("Loading sleep data...")
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
            SectionHeader(title: "Last Night")

            HStack {
                if let entry = viewModel.currentEntry {
                    Image(systemName: "bed.double.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.interactiveSecondary)
                    Text(String(format: "%.1f", entry.totalHours))
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("hrs")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                    if entry.efficiency > 0 {
                        VStack(alignment: .trailing, spacing: Theme.Spacing.space1) {
                            Text(String(format: "%.0f%%", entry.efficiency))
                                .font(.headline)
                                .monospacedDigit()
                                .foregroundStyle(Theme.textPrimary)
                            Text("efficiency")
                                .font(.caption)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }
                } else {
                    Image(systemName: "bed.double.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.textTertiary)
                    Text("No sleep data")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                }
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
                SectionHeader(title: "Sleep Trend")
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    ForEach(HealthChartRange.allCases, id: \.self) { range in
                        FilterChip(
                            title: range.rawValue,
                            color: Theme.interactiveSecondary,
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
                   let nearest = nearestSleepPoint(to: selectedDate) {
                    HStack(spacing: Theme.Spacing.space2) {
                        Text(nearest.date, format: .dateTime.month(.abbreviated).day())
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                        Text(String(format: "%.1f hrs", nearest.totalHours))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .foregroundStyle(Theme.interactiveSecondary)
                    }
                    .transition(.opacity)
                }

                Chart {
                    // Daily total sleep points
                    ForEach(viewModel.totalSleepPoints) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("Sleep", point.value)
                        )
                        .foregroundStyle(Theme.interactiveSecondary.opacity(0.5))
                        .symbolSize(20)
                    }

                    // 7-day smoothed average line
                    ForEach(viewModel.smoothedTotalSleep) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Sleep", point.value)
                        )
                        .foregroundStyle(Theme.interactiveSecondary)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // Selection indicator
                    if let selectedDate,
                       let nearest = nearestChartPoint(to: selectedDate) {
                        RuleMark(x: .value("Selected", nearest.date))
                            .foregroundStyle(Theme.textSecondary.opacity(0.4))
                            .lineStyle(StrokeStyle(lineWidth: 1))

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("Sleep", nearest.value)
                        )
                        .foregroundStyle(Theme.interactiveSecondary)
                        .symbolSize(50)

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("Sleep", nearest.value)
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
                            .fill(Theme.interactiveSecondary.opacity(0.5))
                            .frame(width: 6, height: 6)
                        Text("Daily")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    HStack(spacing: Theme.Spacing.space1) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Theme.interactiveSecondary)
                            .frame(width: 16, height: 2)
                        Text("7-Day Avg")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
            }
            .glassCard()
        }
    }

    // MARK: - Stage Breakdown

    @ViewBuilder
    private var stageBreakdown: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "7-Day Averages")

            VStack(spacing: 0) {
                if let avgSleep = viewModel.averageSleepHours {
                    stageRow(
                        icon: "clock.fill",
                        color: Theme.interactiveSecondary,
                        label: "Total Sleep",
                        value: String(format: "%.1f hrs", avgSleep)
                    )

                    Divider().background(Theme.divider)
                }

                if let avgEfficiency = viewModel.averageEfficiency {
                    stageRow(
                        icon: "gauge.with.dots.needle.33percent",
                        color: Theme.success,
                        label: "Efficiency",
                        value: String(format: "%.0f%%", avgEfficiency)
                    )

                    Divider().background(Theme.divider)
                }

                let recent = Array(viewModel.allHistory.suffix(7))
                if !recent.isEmpty {
                    let avgDeep = recent.map(\.deepHours).reduce(0, +) / Double(recent.count)
                    let avgCore = recent.map(\.coreHours).reduce(0, +) / Double(recent.count)
                    let avgREM = recent.map(\.remHours).reduce(0, +) / Double(recent.count)

                    stageRow(
                        icon: "moon.fill",
                        color: Theme.interactivePrimary,
                        label: "Deep",
                        value: String(format: "%.1f hrs", avgDeep)
                    )

                    Divider().background(Theme.divider)

                    stageRow(
                        icon: "powersleep",
                        color: Theme.interactiveSecondary,
                        label: "Core",
                        value: String(format: "%.1f hrs", avgCore)
                    )

                    Divider().background(Theme.divider)

                    stageRow(
                        icon: "brain.head.profile",
                        color: Theme.meditation,
                        label: "REM",
                        value: String(format: "%.1f hrs", avgREM)
                    )
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    private func stageRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.iconMD))
                .foregroundStyle(color)
                .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            Text(label)
                .font(.subheadline)
                .foregroundStyle(Theme.textPrimary)

            Spacer()

            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space4)
        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
    }

    // MARK: - Helpers

    private func nearestSleepPoint(to date: Date) -> SleepChartPoint? {
        viewModel.history.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }

    private func nearestChartPoint(to date: Date) -> HealthMetricChartPoint? {
        viewModel.totalSleepPoints.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SleepHistoryView()
    }
    .preferredColorScheme(.dark)
}
