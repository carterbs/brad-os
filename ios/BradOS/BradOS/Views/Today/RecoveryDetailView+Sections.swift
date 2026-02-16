import SwiftUI

// MARK: - Sleep & Recommendation Sections

extension RecoveryDetailView {

    // MARK: - Sleep Section

    var sleepSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Sleep")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            HStack(spacing: Theme.Spacing.space4) {
                sleepStat(
                    value: String(format: "%.1f", recovery.sleepHours),
                    unit: "hrs",
                    label: "Total Sleep"
                )
                sleepStat(
                    value: String(format: "%.0f", recovery.sleepEfficiency),
                    unit: "%",
                    label: "Efficiency"
                )
                sleepStat(
                    value: String(format: "%.0f", recovery.deepSleepPercent),
                    unit: "%",
                    label: "Deep Sleep"
                )
            }

            sleepBar
        }
        .glassCard()
    }

    func sleepStat(value: String, unit: String, label: String) -> some View {
        VStack(spacing: Theme.Spacing.space1) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.title2)
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)
                Text(unit)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            Text(label)
                .font(.caption)
                .foregroundColor(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    var sleepBar: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            GeometryReader { geo in
                let deepFraction = (recovery.deepSleepPercent / 100.0)
                let remFraction = min(0.25, (1.0 - deepFraction) * 0.35)
                let coreFraction = 1.0 - deepFraction - remFraction

                HStack(spacing: 2) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.interactivePrimary)
                        .frame(width: max(geo.size.width * deepFraction - 2, 0))
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.interactiveSecondary)
                        .frame(width: max(geo.size.width * coreFraction - 2, 0))
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.meditation)
                        .frame(width: max(geo.size.width * remFraction - 2, 0))
                }
            }
            .frame(height: 8)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

            HStack(spacing: Theme.Spacing.space4) {
                sleepLegendItem(color: Theme.interactivePrimary, label: "Deep")
                sleepLegendItem(color: Theme.interactiveSecondary, label: "Core")
                sleepLegendItem(color: Theme.meditation, label: "REM")
            }
        }
    }

    func sleepLegendItem(color: Color, label: String) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(color)
                .frame(width: Theme.Dimensions.dotSM, height: Theme.Dimensions.dotSM)
            Text(label)
                .font(.caption)
                .foregroundColor(Theme.textTertiary)
        }
    }

    // MARK: - Recommendation Section

    var recommendationSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: recommendationIcon)
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(stateColor)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(stateColor.opacity(0.12))
                    .clipShape(
                        RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                    )

                Text("Recommendation")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            Text(recommendationText)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .glassCard()
    }

    // MARK: - Helpers

    var stateColor: Color {
        switch recovery.state {
        case .ready: return Theme.success
        case .moderate: return Theme.warning
        case .recover: return Theme.destructive
        }
    }

    var recommendationIcon: String {
        switch recovery.state {
        case .ready: return "figure.run"
        case .moderate: return "figure.walk"
        case .recover: return "figure.cooldown"
        }
    }

    var recommendationText: String {
        switch recovery.state {
        case .ready:
            return "Your body is well recovered. Train as planned — " +
                "this is a great day for high-intensity work or progressive overload."
        case .moderate:
            return "Recovery is moderate. Consider reducing intensity " +
                "or volume by 10-20%. Focus on technique and avoid maximal efforts."
        case .recover:
            return "Your body needs rest. Stick to light activity, mobility work, " +
                "or take a full rest day. Prioritize sleep and hydration."
        }
    }
}
