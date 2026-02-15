import SwiftUI
import Charts

/// Unified history view for HRV and RHR metrics (replaces HRVHistoryView & RHRHistoryView)
struct HealthMetricHistoryView: View {
    @State private var viewModel: HealthMetricHistoryViewModel
    @State private var selectedDate: Date?

    private var metric: HealthMetric { viewModel.metric }

    init(_ metric: HealthMetric) {
        _viewModel = State(initialValue: HealthMetricHistoryViewModel(metric))
    }

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
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle(metric.navigationTitle)
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
            Text("Loading \(metric.chartLabel) data...")
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
            SectionHeader(title: metric.currentSectionTitle)

            HStack {
                if let value = viewModel.currentValue {
                    if metric.iconBeforeValue {
                        metricIcon(color: metric.color)
                    }
                    Text(String(format: "%.0f", value))
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text(metric.unit)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    if !metric.iconBeforeValue {
                        metricIcon(color: metric.color)
                    }
                } else {
                    metricIcon(color: Theme.textTertiary)
                    Text(metric.noDataText)
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

    private func metricIcon(color: Color) -> some View {
        Image(systemName: metric.icon)
            .font(.title3)
            .foregroundStyle(color)
    }

    // MARK: - Trend Chart

    @ViewBuilder
    private var trendChart: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            HStack {
                SectionHeader(title: metric.trendTitle)
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    ForEach(HealthChartRange.allCases, id: \.self) { range in
                        FilterChip(
                            title: range.rawValue,
                            color: metric.color,
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
                        Text(String(format: "%.0f \(metric.unit)", nearest.value))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .foregroundStyle(metric.color)
                    }
                    .transition(.opacity)
                }

                Chart {
                    // Actual data points
                    ForEach(viewModel.history) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value(metric.chartLabel, point.value)
                        )
                        .foregroundStyle(metric.color.opacity(0.5))
                        .symbolSize(20)
                    }

                    // 7-day smoothed average line
                    ForEach(viewModel.smoothedHistory) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value(metric.chartLabel, point.value)
                        )
                        .foregroundStyle(metric.color)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // Selection indicator
                    if let selectedDate,
                       let nearest = nearestPoint(to: selectedDate) {
                        RuleMark(x: .value("Selected", nearest.date))
                            .foregroundStyle(Theme.textSecondary.opacity(0.4))
                            .lineStyle(StrokeStyle(lineWidth: 1))

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value(metric.chartLabel, nearest.value)
                        )
                        .foregroundStyle(metric.color)
                        .symbolSize(50)

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value(metric.chartLabel, nearest.value)
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
                            .fill(metric.color.opacity(0.5))
                            .frame(width: 6, height: 6)
                        Text("Daily")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    HStack(spacing: Theme.Spacing.space1) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(metric.color)
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

    // MARK: - Helpers

    private func nearestPoint(to date: Date) -> HealthMetricChartPoint? {
        viewModel.history.min(by: {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        })
    }
}

// MARK: - Previews

#Preview("HRV") {
    NavigationStack {
        HealthMetricHistoryView(.hrv)
    }
    .preferredColorScheme(.dark)
}

#Preview("RHR") {
    NavigationStack {
        HealthMetricHistoryView(.rhr)
    }
    .preferredColorScheme(.dark)
}
