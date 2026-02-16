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
            NavigationLink(destination: HRVHistoryView()) {
                metricDetail(MetricDetailConfig(
                    icon: "waveform.path.ecg",
                    label: "Heart Rate Variability",
                    value: String(format: "%.0f ms", recovery.hrvMs),
                    trend: recovery.hrvVsBaseline,
                    trendLabel: "vs 60-day baseline",
                    isPercentage: true,
                    positiveIsGood: true,
                    showChevron: true
                ))
            }
            .buttonStyle(.plain)

            Divider()
                .overlay(Theme.divider)

            // RHR
            NavigationLink(destination: RHRHistoryView()) {
                metricDetail(MetricDetailConfig(
                    icon: "heart.fill",
                    label: "Resting Heart Rate",
                    value: String(format: "%.0f bpm", recovery.rhrBpm),
                    trend: recovery.rhrVsBaseline,
                    trendLabel: "vs baseline",
                    isPercentage: false,
                    positiveIsGood: false,
                    showChevron: true
                ))
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
                        Text(String(
                            format: "%.1f hrs · %.0f%% efficiency",
                            recovery.sleepHours, recovery.sleepEfficiency
                        ))
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

    struct MetricDetailConfig {
        let icon: String
        let label: String
        let value: String
        let trend: Double
        let trendLabel: String
        let isPercentage: Bool
        let positiveIsGood: Bool
        var showChevron: Bool = false
    }

    private func metricDetail(_ config: MetricDetailConfig) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: config.icon)
                    .font(.system(size: Theme.Typography.listRowIcon))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: Theme.Dimensions.iconFrameSM)

                Text(config.label)
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)

                if config.showChevron {
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.space3) {
                Text(config.value)
                    .font(.system(size: 28, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    trendBadge(config.trend, isPercentage: config.isPercentage, positiveIsGood: config.positiveIsGood)

                    Text(config.trendLabel)
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
