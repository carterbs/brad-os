import SwiftUI

/// Dashboard card displaying the AI Today Coach daily briefing.
///
/// Self-loading: fetches recovery from Firebase, then calls the Today Coach API.
/// Shows loading/error/content states inline on the dashboard.
struct TodayCoachCard: View {
    @EnvironmentObject var healthKit: HealthKitManager
    @StateObject private var coachClient = TodayCoachClient()
    @State private var recovery: RecoveryData?
    @State private var isLoadingRecovery = false
    @State private var isShowingDetail = false

    var body: some View {
        Button(action: {
            if coachClient.recommendation != nil {
                isShowingDetail = true
            }
        }) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoadingRecovery && recovery == nil)
        .sheet(isPresented: $isShowingDetail) {
            if let recommendation = coachClient.recommendation {
                TodayCoachDetailView(
                    recommendation: recommendation,
                    recovery: recovery
                )
            }
        }
        .task {
            await loadCoachRecommendation()
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoadingRecovery || coachClient.isLoading {
            loadingState
        } else if let error = coachClient.error {
            errorState(error)
        } else if !healthKit.isAuthorized && recovery == nil {
            notAuthorizedState
        } else if recovery == nil {
            noDataState
        } else if let recommendation = coachClient.recommendation {
            coachContent(recommendation)
        } else {
            noDataState
        }
    }

    // MARK: - Data Loading

    private func loadCoachRecommendation() async {
        isLoadingRecovery = true

        do {
            let snapshot = try await APIClient.shared.getLatestRecovery()
            recovery = snapshot?.toRecoveryData()
        } catch {
            print("[TodayCoachCard] Failed to load recovery: \(error)")
        }

        isLoadingRecovery = false

        if let recovery = recovery {
            await coachClient.getRecommendation(recovery: recovery)
        }
    }

    func refresh() async {
        await loadCoachRecommendation()
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.interactivePrimary)

            HStack(spacing: Theme.Spacing.space2) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Theme.interactivePrimary))
                Text("Analyzing your day...")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, Theme.Spacing.space4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    // MARK: - Error State

    private func errorState(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            cardHeader(iconColor: Theme.interactivePrimary)

            VStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title2)
                    .foregroundStyle(Theme.warning)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)

                Button {
                    Task { await loadCoachRecommendation() }
                } label: {
                    Text("Try Again")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Theme.interactivePrimary)
                }
                .padding(.top, Theme.Spacing.space1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    // MARK: - Not Authorized State

    private var notAuthorizedState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("Enable HealthKit access to get personalized daily coaching.")
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

    // MARK: - Coach Content

    @ViewBuilder
    private func coachContent(_ recommendation: TodayCoachRecommendation) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header with recovery state badge
            HStack {
                cardHeaderIcon(color: recoveryStateColor)
                Text("Today Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                recoveryBadge
            }

            // Daily briefing
            Text(recommendation.dailyBriefing)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Section rows
            VStack(spacing: Theme.Spacing.space2) {
                sectionRow(
                    icon: "heart.text.square.fill",
                    title: "Recovery",
                    insight: recommendation.sections.recovery.insight,
                    trailingText: recommendation.sections.recovery.status.capitalized,
                    color: recoveryStatusColor(recommendation.sections.recovery.statusColor)
                )

                if let lifting = recommendation.sections.lifting {
                    sectionRow(
                        icon: "dumbbell.fill",
                        title: "Lifting",
                        insight: lifting.insight,
                        trailingText: priorityLabel(lifting.liftingPriority),
                        color: priorityColor(lifting.liftingPriority)
                    )
                }

                if let cycling = recommendation.sections.cycling {
                    sectionRow(
                        icon: "figure.outdoor.cycle",
                        title: "Cycling",
                        insight: cycling.insight,
                        trailingText: cycling.session?.sessionType.displayName,
                        color: Theme.cycling
                    )
                }

                sectionRow(
                    icon: "figure.flexibility",
                    title: "Stretching",
                    insight: recommendation.sections.stretching.insight,
                    trailingText: priorityLabel(recommendation.sections.stretching.stretchPriority),
                    color: priorityColor(recommendation.sections.stretching.stretchPriority)
                )

                sectionRow(
                    icon: "brain.head.profile.fill",
                    title: "Meditation",
                    insight: recommendation.sections.meditation.insight,
                    trailingText: "\(recommendation.sections.meditation.suggestedDurationMinutes) min",
                    color: Theme.meditation
                )

                if let weight = recommendation.sections.weight {
                    sectionRow(
                        icon: "scalemass.fill",
                        title: "Weight",
                        insight: weight.insight,
                        trailingText: nil,
                        color: Theme.textSecondary
                    )
                }
            }

            // Warnings
            if !recommendation.warnings.isEmpty {
                warningsSection(recommendation.warnings)
            }

            // View details link
            HStack {
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    Text("View Details")
                        .font(.callout.weight(.semibold))
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(recoveryStateColor)
            }
        }
        .glassCard()
        .auroraGlow(recoveryStateColor)
    }

    // MARK: - Card Header

    private func cardHeader(iconColor: Color) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            cardHeaderIcon(color: iconColor)
            Text("Today Coach")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private func cardHeaderIcon(color: Color) -> some View {
        Image(systemName: "brain.fill")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(color)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Recovery Badge

    @ViewBuilder
    private var recoveryBadge: some View {
        if let recovery = recovery {
            HStack(spacing: Theme.Spacing.space1) {
                Circle()
                    .fill(recoveryStateColor)
                    .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
                Text(recovery.state.displayName)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, Theme.Spacing.space1)
            .background(recoveryStateColor.opacity(0.2))
            .foregroundColor(recoveryStateColor)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
        }
    }

    // MARK: - Section Row

    private func sectionRow(
        icon: String,
        title: String,
        insight: String,
        trailingText: String?,
        color: Color
    ) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.listRowIcon))
                .foregroundColor(color)
                .frame(width: Theme.Dimensions.iconFrameSM)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(insight)
                    .font(.footnote)
                    .foregroundColor(Theme.textTertiary)
                    .lineLimit(1)
            }

            Spacer()

            if let trailingText = trailingText {
                Text(trailingText)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(color)
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 10))
                .foregroundColor(Theme.textTertiary)
        }
        .padding(.vertical, Theme.Spacing.space2)
    }

    // MARK: - Warnings

    private func warningsSection(_ warnings: [TodayCoachRecommendation.CoachWarning]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            ForEach(warnings, id: \.type) { warning in
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Text(warning.message)
                        .font(.footnote)
                        .foregroundStyle(Theme.warning)
                }
                .padding(Theme.Spacing.space2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
    }

    // MARK: - Helpers

    private var recoveryStateColor: Color {
        guard let recovery = recovery else { return Theme.textSecondary }
        switch recovery.state {
        case .ready: return Theme.success
        case .moderate: return Theme.warning
        case .recover: return Theme.destructive
        }
    }

    private func recoveryStatusColor(_ status: RecoveryStatus) -> Color {
        switch status {
        case .great: return Theme.success
        case .good: return Theme.success
        case .caution: return Theme.warning
        case .warning: return Theme.destructive
        }
    }

    private func priorityColor(_ priority: CoachPriority) -> Color {
        switch priority {
        case .high: return Theme.warning
        case .normal: return Theme.textSecondary
        case .low: return Theme.textTertiary
        case .rest: return Theme.info
        case .skip: return Theme.textTertiary
        }
    }

    private func priorityLabel(_ priority: CoachPriority) -> String {
        switch priority {
        case .high: return "Priority"
        case .normal: return "Normal"
        case .low: return "Low"
        case .rest: return "Rest"
        case .skip: return "Skip"
        }
    }
}

// MARK: - Previews

#Preview("Loading") {
    TodayCoachCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.dark)
}
