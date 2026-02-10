import SwiftUI

/// Dashboard card displaying recovery/readiness status from Firebase.
///
/// Architecture: HealthKit → Firebase → App
/// - HealthKitSyncService pushes recovery data to Firebase
/// - This card reads recovery from Firebase via APIClient
/// - HealthKit is only used for auth prompts (to enable the sync)
struct ReadinessCard: View {
    @EnvironmentObject var healthKit: HealthKitManager
    @State private var syncService: HealthKitSyncService?
    @State private var isShowingDetail = false
    @State private var recovery: RecoveryData?
    @State private var isLoading = false

    var body: some View {
        Button(action: {
            if recovery != nil {
                isShowingDetail = true
            }
        }) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoading && recovery == nil)
        .sheet(isPresented: $isShowingDetail) {
            if let recovery = recovery {
                RecoveryDetailView(recovery: recovery)
            }
        }
        .task {
            await loadRecovery()
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoading && recovery == nil {
            loadingState
        } else if let recovery = recovery {
            recoveryContent(recovery)
        } else if !healthKit.isAuthorized {
            notAuthorizedState
        } else {
            noDataState
        }
    }

    // MARK: - Data Loading

    private func loadRecovery() async {
        isLoading = true
        defer { isLoading = false }

        // Initialize sync service if needed
        if syncService == nil {
            syncService = HealthKitSyncService(healthKitManager: healthKit)
        }

        // Sync HealthKit to Firebase first (ensures fresh data)
        await syncService?.sync()

        // Fetch the latest recovery snapshot from Firebase
        do {
            let snapshot = try await APIClient.shared.getLatestRecovery()
            recovery = snapshot?.toRecoveryData()
        } catch {
            print("[ReadinessCard] Failed to load recovery from API: \(error)")
            recovery = nil
        }
    }

    /// Reload recovery data (called from parent on refresh)
    func refresh() async {
        await loadRecovery()
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
}

#Preview("Not Authorized") {
    let manager = HealthKitManager()

    return ReadinessCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(manager)
        .preferredColorScheme(.dark)
}
