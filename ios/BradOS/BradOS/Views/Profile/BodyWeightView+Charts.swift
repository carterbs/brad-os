import SwiftUI
import Charts
import BradOSCore

// MARK: - Chart Section

extension BodyWeightView {

    @ViewBuilder
    var bodyWeightChart: some View {
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
                    ForEach(viewModel.weightHistory) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("Weight", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary.opacity(0.45))
                        .symbolSize(20)
                    }

                    ForEach(viewModel.smoothedHistory) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("7-Day SMA", point.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    if let selectedDate,
                       let nearest = nearestPoint(to: selectedDate) {
                        RuleMark(x: .value("Selected", nearest.date))
                            .foregroundStyle(Theme.textSecondary.opacity(0.4))
                            .lineStyle(StrokeStyle(lineWidth: 1))

                        PointMark(
                            x: .value("Selected", nearest.date),
                            y: .value("Selected", nearest.weight)
                        )
                        .foregroundStyle(Theme.interactivePrimary)
                        .symbolSize(50)
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
                    AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
                .frame(height: 210)
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

            HStack(spacing: Theme.Spacing.space1) {
                Circle()
                    .fill(Theme.interactivePrimary.opacity(0.7))
                    .frame(width: 6, height: 6)
                Text("Selected")
                    .font(.caption)
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }

    private func nearestPoint(to date: Date) -> WeightChartPoint? {
        if viewModel.allWeightHistory.isEmpty { return nil }
        return viewModel.allWeightHistory.min(by: {
            abs($0.date.timeIntervalSince1970 - date.timeIntervalSince1970) <
            abs($1.date.timeIntervalSince1970 - date.timeIntervalSince1970)
        })
    }
}
