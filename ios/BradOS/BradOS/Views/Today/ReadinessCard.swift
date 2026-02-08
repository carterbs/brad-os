import SwiftUI

/// Dashboard card displaying recovery/readiness status from HealthKit
struct ReadinessCard: View {
    @EnvironmentObject var healthKit: HealthKitManager

    var body: some View {
        Button(action: {
            // TODO: Navigate to detailed recovery view
        }) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(healthKit.isLoading && healthKit.latestRecovery == nil)
    }

    @ViewBuilder
    private var cardContent: some View {
        if healthKit.isLoading && healthKit.latestRecovery == nil {
            loadingState
        } else if !healthKit.isAuthorized {
            notAuthorizedState
        } else if let recovery = healthKit.latestRecovery {
            recoveryContent(recovery)
        } else {
            noDataState
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("Loading recovery data...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Not Authorized State

    private var notAuthorizedState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("Enable HealthKit access to track your recovery.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            HStack {
                Spacer()
                Button("Enable HealthKit") {
                    Task {
                        try? await healthKit.requestAuthorization()
                        await healthKit.refresh()
                    }
                }
                .font(.callout.weight(.semibold))
                .foregroundColor(Theme.interactivePrimary)
            }
        }
        .glassCard()
    }

    // MARK: - No Data State

    private var noDataState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("No recovery data available. Wear your Apple Watch to collect HRV and sleep data.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Recovery Content

    @ViewBuilder
    private func recoveryContent(_ recovery: RecoveryData) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header with state badge
            HStack {
                cardHeaderIcon(color: stateColor(recovery.state))
                Text("Recovery")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                stateBadge(recovery.state)
            }

            // Large score display
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.space2) {
                Text("\(recovery.score)")
                    .font(.system(size: 48, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(stateColor(recovery.state))
                Text("/100")
                    .font(.title3)
                    .foregroundColor(Theme.textSecondary)
            }

            // Metrics grid
            VStack(spacing: Theme.Spacing.space3) {
                metricRow(
                    icon: "waveform.path.ecg",
                    label: "HRV",
                    value: String(format: "%.0f ms", recovery.hrvMs),
                    trend: recovery.hrvVsBaseline,
                    isPercentage: true
                )

                metricRow(
                    icon: "heart.fill",
                    label: "RHR",
                    value: String(format: "%.0f bpm", recovery.rhrBpm),
                    trend: -recovery.rhrVsBaseline, // Negative because lower RHR is better
                    isPercentage: false
                )

                metricRow(
                    icon: "bed.double.fill",
                    label: "Sleep",
                    value: String(format: "%.1f hrs", recovery.sleepHours),
                    subtitle: String(format: "%.0f%% efficiency", recovery.sleepEfficiency)
                )
            }

            // Action link
            HStack {
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    Text("View Details")
                        .font(.callout.weight(.semibold))
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(stateColor(recovery.state))
            }
        }
        .glassCard()
        .auroraGlow(stateColor(recovery.state))
    }

    // MARK: - Card Header

    private func cardHeader(iconColor: Color) -> some View {
        HStack {
            cardHeaderIcon(color: iconColor)
            Text("Recovery")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private func cardHeaderIcon(color: Color) -> some View {
        Image(systemName: "heart.text.square.fill")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(color)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - State Badge

    @ViewBuilder
    private func stateBadge(_ state: RecoveryState) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(stateColor(state))
                .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
            Text(state.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(stateColor(state).opacity(0.2))
        .foregroundColor(stateColor(state))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Metric Row

    @ViewBuilder
    private func metricRow(
        icon: String,
        label: String,
        value: String,
        trend: Double? = nil,
        isPercentage: Bool = false,
        subtitle: String? = nil
    ) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.listRowIcon))
                .foregroundColor(Theme.textSecondary)
                .frame(width: Theme.Dimensions.iconFrameSM)

            Text(label)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: Theme.Spacing.space1) {
                    Text(value)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .monospacedDigit()
                        .foregroundColor(Theme.textPrimary)

                    if let trend = trend {
                        trendIndicator(trend, isPercentage: isPercentage)
                    }
                }

                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(Theme.textTertiary)
                }
            }
        }
    }

    @ViewBuilder
    private func trendIndicator(_ trend: Double, isPercentage: Bool) -> some View {
        let isPositive = trend >= 0
        let absValue = abs(trend)

        HStack(spacing: 2) {
            Image(systemName: isPositive ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 10, weight: .semibold))
            Text(isPercentage ? String(format: "%.0f%%", absValue) : String(format: "%.0f", absValue))
                .font(.caption)
                .fontWeight(.medium)
                .monospacedDigit()
        }
        .foregroundColor(isPositive ? Theme.success : Theme.destructive)
    }

    // MARK: - Helpers

    private func stateColor(_ state: RecoveryState) -> Color {
        switch state {
        case .ready:
            return Theme.success
        case .moderate:
            return Theme.warning
        case .recover:
            return Theme.destructive
        }
    }
}

// MARK: - Previews

#Preview("Ready State") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
        .task {
            manager.isAuthorized = true
            manager.latestRecovery = RecoveryData(
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
        }
}

#Preview("Moderate State") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
        .task {
            manager.isAuthorized = true
            manager.latestRecovery = RecoveryData(
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
        }
}

#Preview("Recover State") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
        .task {
            manager.isAuthorized = true
            manager.latestRecovery = RecoveryData(
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
        }
}

#Preview("Loading State") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
        .task {
            manager.isLoading = true
        }
}

#Preview("Not Authorized") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
}
