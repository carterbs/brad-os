import SwiftUI

// MARK: - VO2 Max Card

/// Displays current VO2 max estimate with fitness category and trend
struct VO2MaxCard: View {
    let estimate: VO2MaxEstimateModel
    let history: [VO2MaxEstimateModel]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            // Header
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "lungs.fill")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("Estimated VO\u{2082} Max")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                MethodBadge(method: estimate.method)
            }

            // Main value
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "%.1f", estimate.value))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(categoryColor)

                Text("mL/kg/min")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)

                Spacer()

                FitnessCategoryBadge(category: estimate.fitnessCategory)
            }

            // Mini sparkline
            if history.count >= 2 {
                VO2MaxSparkline(history: history)
                    .frame(height: 40)
            }

            // Disclaimer
            Text("Estimated from cycling power data")
                .font(.caption2)
                .foregroundStyle(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    private var categoryColor: Color {
        switch estimate.fitnessCategory {
        case "elite": return .purple
        case "excellent": return Theme.info
        case "good": return Theme.success
        case "fair": return Theme.warning
        default: return Theme.destructive
        }
    }
}

// MARK: - Method Badge

struct MethodBadge: View {
    let method: String

    private var displayName: String {
        switch method {
        case "ftp_derived": return "FTP"
        case "peak_5min": return "5-min"
        case "peak_20min": return "20-min"
        default: return method
        }
    }

    var body: some View {
        Text(displayName)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, 2)
            .background(Theme.textSecondary.opacity(0.15))
            .foregroundStyle(Theme.textSecondary)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }
}

// MARK: - Fitness Category Badge

struct FitnessCategoryBadge: View {
    let category: String

    private var color: Color {
        switch category {
        case "elite": return .purple
        case "excellent": return Theme.info
        case "good": return Theme.success
        case "fair": return Theme.warning
        default: return Theme.destructive
        }
    }

    var body: some View {
        Text(category.uppercased())
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }
}

// MARK: - VO2 Max Sparkline

struct VO2MaxSparkline: View {
    let history: [VO2MaxEstimateModel]

    var body: some View {
        GeometryReader { geometry in
            let values = history.reversed().map(\.value)
            let minVal = (values.min() ?? 0) - 2
            let maxVal = (values.max() ?? 100) + 2
            let range = maxVal - minVal

            Path { path in
                guard values.count >= 2, range > 0 else { return }

                let stepX = geometry.size.width / CGFloat(values.count - 1)

                for (index, value) in values.enumerated() {
                    let x = CGFloat(index) * stepX
                    let y = geometry.size.height * (1 - CGFloat((value - minVal) / range))

                    if index == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(
                Theme.interactivePrimary,
                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
            )
        }
    }
}

// MARK: - Previews

#Preview {
    VO2MaxCard(
        estimate: VO2MaxEstimateModel(
            id: "1",
            date: "2026-02-08",
            value: 42.8,
            method: "ftp_derived",
            sourcePower: 195,
            sourceWeight: 79.4,
            category: "fair"
        ),
        history: [
            VO2MaxEstimateModel(id: "1", date: "2026-02-08", value: 42.8, method: "ftp_derived", sourcePower: 195, sourceWeight: 79.4),
            VO2MaxEstimateModel(id: "2", date: "2026-01-25", value: 41.2, method: "ftp_derived", sourcePower: 190, sourceWeight: 80.3),
            VO2MaxEstimateModel(id: "3", date: "2026-01-11", value: 39.5, method: "ftp_derived", sourcePower: 182, sourceWeight: 81.0),
        ]
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
