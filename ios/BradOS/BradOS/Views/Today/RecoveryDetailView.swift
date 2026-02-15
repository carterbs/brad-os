import SwiftUI

/// Detailed recovery view showing score breakdown, metrics, and training recommendation
struct RecoveryDetailView: View {
    let recovery: RecoveryData
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    heroSection
                    scoreBreakdown
                    metricsSection
                    sleepSection
                    recommendationSection
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Recovery")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
            }
        }
    }

    // MARK: - Hero Section

    private var heroSection: some View {
        VStack(spacing: Theme.Spacing.space3) {
            // Score ring
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.06), lineWidth: 8)
                    .frame(width: 120, height: 120)

                Circle()
                    .trim(from: 0, to: Double(recovery.score) / 100.0)
                    .stroke(
                        stateColor,
                        style: StrokeStyle(lineWidth: 8, lineCap: .round)
                    )
                    .frame(width: 120, height: 120)
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 2) {
                    Text("\(recovery.score)")
                        .font(.system(size: 40, weight: .bold))
                        .monospacedDigit()
                        .foregroundColor(stateColor)
                    Text("/100")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
            }

            // State badge
            HStack(spacing: Theme.Spacing.space1) {
                Circle()
                    .fill(stateColor)
                    .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
                Text(recovery.state.displayName)
                    .font(.callout)
                    .fontWeight(.semibold)
            }
            .padding(.horizontal, Theme.Spacing.space3)
            .padding(.vertical, Theme.Spacing.space2)
            .background(stateColor.opacity(0.2))
            .foregroundColor(stateColor)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            // Date
            Text(recovery.date, style: .date)
                .font(.subheadline)
                .foregroundColor(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity)
        .glassCard()
        .auroraGlow(stateColor)
    }

    // MARK: - Score Breakdown

    private var scoreBreakdown: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Score Breakdown")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            scoreComponent(
                label: "HRV",
                weight: "70%",
                icon: "waveform.path.ecg",
                color: Theme.interactivePrimary
            )

            scoreComponent(
                label: "Resting Heart Rate",
                weight: "20%",
                icon: "heart.fill",
                color: Theme.destructive
            )

            scoreComponent(
                label: "Sleep Quality",
                weight: "10%",
                icon: "bed.double.fill",
                color: Theme.interactiveSecondary
            )
        }
        .glassCard()
    }

    private func scoreComponent(label: String, weight: String, icon: String, color: Color) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.listRowIcon))
                .foregroundColor(color)
                .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            Text(label)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Text(weight)
                .font(.subheadline)
                .fontWeight(.medium)
                .monospacedDigit()
                .foregroundColor(Theme.textSecondary)
        }
    }

    // MARK: - Metrics Section

    private var metricsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Metrics")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            // HRV
            NavigationLink(destination: HealthMetricHistoryView(.hrv)) {
                metricDetail(
                    icon: "waveform.path.ecg",
                    label: "Heart Rate Variability",
                    value: String(format: "%.0f ms", recovery.hrvMs),
                    trend: recovery.hrvVsBaseline,
                    trendLabel: "vs 60-day baseline",
                    isPercentage: true,
                    positiveIsGood: true,
                    showChevron: true
                )
            }
            .buttonStyle(.plain)

            Divider()
                .overlay(Theme.divider)

            // RHR
            NavigationLink(destination: HealthMetricHistoryView(.rhr)) {
                metricDetail(
                    icon: "heart.fill",
                    label: "Resting Heart Rate",
                    value: String(format: "%.0f bpm", recovery.rhrBpm),
                    trend: recovery.rhrVsBaseline,
                    trendLabel: "vs baseline",
                    isPercentage: false,
                    positiveIsGood: false,
                    showChevron: true
                )
            }
            .buttonStyle(.plain)

            Divider()
                .overlay(Theme.divider)

            // Sleep
            NavigationLink(destination: SleepHistoryView()) {
                HStack {
                    Image(systemName: "bed.double.fill")
                        .font(.system(size: Theme.Typography.listRowIcon))
                        .foregroundStyle(Theme.interactiveSecondary)
                        .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)

                    VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                        Text("Sleep")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                        Text(String(format: "%.1f hrs · %.0f%% efficiency", recovery.sleepHours, recovery.sleepEfficiency))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textSecondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                }
            }
            .buttonStyle(.plain)
        }
        .glassCard()
    }

    private func metricDetail(
        icon: String,
        label: String,
        value: String,
        trend: Double,
        trendLabel: String,
        isPercentage: Bool,
        positiveIsGood: Bool,
        showChevron: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: icon)
                    .font(.system(size: Theme.Typography.listRowIcon))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: Theme.Dimensions.iconFrameSM)

                Text(label)
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)

                if showChevron {
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.space3) {
                Text(value)
                    .font(.system(size: 28, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    trendBadge(trend, isPercentage: isPercentage, positiveIsGood: positiveIsGood)

                    Text(trendLabel)
                        .font(.caption)
                        .foregroundColor(Theme.textTertiary)
                }
            }
        }
    }

    private func trendBadge(_ trend: Double, isPercentage: Bool, positiveIsGood: Bool) -> some View {
        let isPositive = trend >= 0
        let isGood = positiveIsGood ? isPositive : !isPositive
        let absValue = abs(trend)
        let color = isGood ? Theme.success : Theme.destructive
        let format = isPercentage ? String(format: "%.1f%%", absValue) : String(format: "%.0f bpm", absValue)

        return HStack(spacing: 2) {
            Image(systemName: isPositive ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 11, weight: .semibold))
            Text((isPositive ? "+" : "-") + format)
                .font(.caption)
                .fontWeight(.medium)
                .monospacedDigit()
        }
        .foregroundColor(color)
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Sleep Section

    private var sleepSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Sleep")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            // Total sleep and efficiency
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

            // Sleep bar
            sleepBar
        }
        .glassCard()
    }

    private func sleepStat(value: String, unit: String, label: String) -> some View {
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

    private var sleepBar: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            GeometryReader { geo in
                let total = max(recovery.sleepHours, 0.1)
                let deepFraction = (recovery.deepSleepPercent / 100.0)
                // Estimate: remainder split roughly between core and REM
                let remFraction = min(0.25, (1.0 - deepFraction) * 0.35)
                let coreFraction = 1.0 - deepFraction - remFraction

                HStack(spacing: 2) {
                    // Deep
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.interactivePrimary)
                        .frame(width: max(geo.size.width * deepFraction - 2, 0))

                    // Core
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.interactiveSecondary)
                        .frame(width: max(geo.size.width * coreFraction - 2, 0))

                    // REM
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Theme.meditation)
                        .frame(width: max(geo.size.width * remFraction - 2, 0))
                }
            }
            .frame(height: 8)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

            // Legend
            HStack(spacing: Theme.Spacing.space4) {
                sleepLegendItem(color: Theme.interactivePrimary, label: "Deep")
                sleepLegendItem(color: Theme.interactiveSecondary, label: "Core")
                sleepLegendItem(color: Theme.meditation, label: "REM")
            }
        }
    }

    private func sleepLegendItem(color: Color, label: String) -> some View {
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

    private var recommendationSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: recommendationIcon)
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(stateColor)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(stateColor.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

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

    private var stateColor: Color {
        switch recovery.state {
        case .ready: return Theme.success
        case .moderate: return Theme.warning
        case .recover: return Theme.destructive
        }
    }

    private var recommendationIcon: String {
        switch recovery.state {
        case .ready: return "figure.run"
        case .moderate: return "figure.walk"
        case .recover: return "figure.cooldown"
        }
    }

    private var recommendationText: String {
        switch recovery.state {
        case .ready:
            return "Your body is well recovered. Train as planned — this is a great day for high-intensity work or progressive overload."
        case .moderate:
            return "Recovery is moderate. Consider reducing intensity or volume by 10-20%. Focus on technique and avoid maximal efforts."
        case .recover:
            return "Your body needs rest. Stick to light activity, mobility work, or take a full rest day. Prioritize sleep and hydration."
        }
    }
}

// MARK: - Previews

#Preview("Ready") {
    RecoveryDetailView(
        recovery: RecoveryData(
            date: Date(),
            hrvMs: 42,
            hrvVsBaseline: 16.7,
            rhrBpm: 52,
            rhrVsBaseline: -3,
            sleepHours: 7.8,
            sleepEfficiency: 92,
            deepSleepPercent: 18,
            score: 78,
            state: .ready
        )
    )
    .preferredColorScheme(.dark)
}

#Preview("Moderate") {
    RecoveryDetailView(
        recovery: RecoveryData(
            date: Date(),
            hrvMs: 32,
            hrvVsBaseline: -11.1,
            rhrBpm: 58,
            rhrVsBaseline: 3,
            sleepHours: 6.2,
            sleepEfficiency: 78,
            deepSleepPercent: 12,
            score: 58,
            state: .moderate
        )
    )
    .preferredColorScheme(.dark)
}

#Preview("Recover") {
    RecoveryDetailView(
        recovery: RecoveryData(
            date: Date(),
            hrvMs: 24,
            hrvVsBaseline: -33.3,
            rhrBpm: 65,
            rhrVsBaseline: 10,
            sleepHours: 5.1,
            sleepEfficiency: 65,
            deepSleepPercent: 8,
            score: 35,
            state: .recover
        )
    )
    .preferredColorScheme(.dark)
}
