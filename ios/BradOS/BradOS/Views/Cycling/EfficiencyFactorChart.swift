import SwiftUI
import Charts

// MARK: - Efficiency Factor Chart

/// Line chart showing EF trend over time for steady rides
struct EfficiencyFactorChart: View {
    let data: [EFDataPoint]

    private var parsedData: [(date: Date, ef: Double)] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]

        return data.compactMap { point in
            guard let date = formatter.date(from: point.date) else { return nil }
            return (date: date, ef: point.ef)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            // Header
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "bolt.heart.fill")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.success)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.success.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: 0) {
                    Text("Efficiency Factor")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(Theme.textPrimary)

                    Text("NP/HR on steady rides")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                }

                Spacer()

                if let latest = data.first {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(String(format: "%.2f", latest.ef))
                            .font(.system(.title3, design: .rounded, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                        Text("W/bpm")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
            }

            // Chart
            if parsedData.count >= 2 {
                Chart {
                    ForEach(parsedData.indices, id: \.self) { index in
                        let point = parsedData[index]
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("EF", point.ef)
                        )
                        .foregroundStyle(Theme.success)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2))

                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("EF", point.ef)
                        )
                        .foregroundStyle(Theme.success)
                        .symbolSize(20)
                    }

                    if let first = parsedData.first, let last = parsedData.last {
                        RuleMark(y: .value("Avg", (first.ef + last.ef) / 2))
                            .foregroundStyle(Theme.textTertiary.opacity(0.3))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let ef = value.as(Double.self) {
                                Text(String(format: "%.1f", ef))
                                    .font(.caption2)
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks { value in
                        AxisValueLabel {
                            if let date = value.as(Date.self) {
                                Text(date, format: .dateTime.month(.abbreviated).day())
                                    .font(.caption2)
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        }
                    }
                }
                .frame(height: 120)

                // Trend indicator
                if let first = parsedData.last, let last = parsedData.first {
                    let delta = last.ef - first.ef
                    let isImproving = delta > 0

                    HStack(spacing: Theme.Spacing.space1) {
                        Image(systemName: isImproving ? "arrow.up.right" : "arrow.down.right")
                            .font(.caption2)
                        Text(String(format: "%+.2f over period", delta))
                            .font(.caption)
                    }
                    .foregroundStyle(isImproving ? Theme.success : Theme.warning)
                }
            } else {
                Text("Need at least 2 steady rides for trend data")
                    .font(.caption)
                    .foregroundStyle(Theme.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, Theme.Spacing.space4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Previews

#Preview {
    EfficiencyFactorChart(data: [
        EFDataPoint(activityId: "1", date: "2026-02-06", ef: 1.16, normalizedPower: 145, avgHeartRate: 125),
        EFDataPoint(activityId: "2", date: "2026-02-01", ef: 1.12, normalizedPower: 140, avgHeartRate: 125),
        EFDataPoint(activityId: "3", date: "2026-01-27", ef: 1.08, normalizedPower: 135, avgHeartRate: 125),
        EFDataPoint(activityId: "4", date: "2026-01-22", ef: 1.05, normalizedPower: 130, avgHeartRate: 124),
    ])
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
