import SwiftUI

// MARK: - Cycling Today View

/// Today's cycling dashboard with recovery and coach recommendations
struct CyclingTodayView: View {
    @EnvironmentObject var viewModel: CyclingViewModel
    @EnvironmentObject var healthKit: HealthKitService
    @StateObject private var coachClient = ServiceFactory.makeCyclingCoachClient()

    @State private var showOnboarding = false
    @State private var showSetupOnboarding = false
    @State private var recovery: RecoveryData?
    @State private var syncService: HealthSyncBridge?

    private var needsOnboarding: Bool {
        // Show onboarding if no FTP set AND no training block
        !viewModel.hasFTP && viewModel.currentBlock == nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space4) {
                // FTP warning if stale
                if viewModel.hasFTP, let warning = ftpWarning {
                    FTPWarningBanner(message: warning)
                }

                // Next Up session from block queue
                if let nextSession = viewModel.nextSession {
                    TodayNextUpCard(session: nextSession, weekProgress: "\(viewModel.sessionsCompletedThisWeek + 1) of \(viewModel.weeklySessionsTotal)")
                }

                // Recovery summary from Firebase
                if let recovery = recovery {
                    RecoverySummaryCard(recovery: recovery)
                }

                // AI Coach recommendation
                coachSection

                // VO2 Max estimate
                if let estimate = viewModel.vo2maxEstimate {
                    VO2MaxCard(
                        estimate: estimate,
                        history: viewModel.vo2maxHistory
                    )
                }

                // Training load summary
                if let load = viewModel.trainingLoad {
                    TrainingLoadCard(load: load)
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .task {
            await loadRecoveryAndCoach()
        }
        .onAppear {
            checkOnboarding()
        }
        .sheet(isPresented: $showOnboarding) {
            CyclingOnboardingView {
                // Refresh data after onboarding
                Task {
                    await viewModel.loadData()
                }
            }
        }
        .sheet(isPresented: $showSetupOnboarding) {
            CyclingOnboardingView {
                Task {
                    await viewModel.loadData()
                }
            }
        }
    }

    // MARK: - FTP Warning

    private var ftpWarning: String? {
        guard let lastTested = viewModel.ftpLastTested else {
            return nil // If no last tested date, handled elsewhere
        }

        let components = Calendar.current.dateComponents([.weekOfYear], from: lastTested, to: Date())
        let weeksSinceTest = components.weekOfYear ?? 0

        if weeksSinceTest > 6 {
            return "Your FTP was last tested \(weeksSinceTest) weeks ago. Consider retesting for accurate training zones."
        } else if weeksSinceTest > 4 {
            return "FTP test recommended - last tested \(weeksSinceTest) weeks ago."
        }

        return nil
    }

    // MARK: - Onboarding Check

    private func checkOnboarding() {
        // Small delay to let data load first
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if needsOnboarding {
                showOnboarding = true
            }
        }
    }

    // MARK: - Coach Section

    @ViewBuilder
    private var coachSection: some View {
        if !viewModel.hasFTP {
            // No FTP set - show setup card
            CoachPlaceholderCard(onSetUp: { showSetupOnboarding = true })
        } else if coachClient.isLoading {
            // Loading state
            CoachRecommendationLoadingCard()
        } else if let error = coachClient.error {
            // Error state
            CoachRecommendationErrorCard(error: error) {
                Task {
                    await loadRecoveryAndCoach()
                }
            }
        } else if let recommendation = coachClient.recommendation {
            // Show recommendation with fun day handling
            CoachRecommendationCard(
                recommendation: recommendation
            )
        } else if recovery == nil {
            // No recovery data
            CoachSetupRecoveryCard()
        } else {
            // Ready to load but hasn't yet
            CoachRecommendationLoadingCard()
        }
    }

    // MARK: - Load Recommendation

    private func loadRecoveryAndCoach() async {
        // Initialize sync service if needed
        if syncService == nil {
            syncService = ServiceFactory.makeHealthSyncService(healthKit: healthKit)
        }

        // Sync HealthKit to Firebase first (ensures fresh data)
        await syncService?.sync()

        // Load recovery from Firebase
        do {
            let snapshot = try await DefaultAPIClient.concrete.getLatestRecovery()
            recovery = snapshot?.toRecoveryData()
        } catch {
            DebugLogger.error("Failed to load recovery: \(error)", attributes: ["source": "CyclingTodayView"])
        }

        // Load coach recommendation using Firebase recovery
        guard viewModel.hasFTP, let recovery = recovery else { return }

        do {
            _ = try await coachClient.getRecommendation(recovery: recovery)
        } catch {
            // Error is already set in the client
        }
    }
}

// MARK: - FTP Warning Banner

/// Banner showing FTP staleness warning
struct FTPWarningBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(Theme.warning)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.warning)

            Spacer()
        }
        .padding(Theme.Spacing.space3)
        .background(Theme.warning.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                .stroke(Theme.warning.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Coach Setup Recovery Card

/// Card prompting user to enable HealthKit for recovery data
struct CoachSetupRecoveryCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "figure.outdoor.cycle")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("AI Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            Text("Enable HealthKit to get personalized training recommendations based on your recovery data.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Recovery Summary Card

/// Compact recovery summary for cycling context
struct RecoverySummaryCard: View {
    let recovery: RecoveryData

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                Text("Recovery")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                Text("\(recovery.score)")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(stateColor)
            }
            Spacer()
            Text(recovery.state.displayName)
                .font(.caption)
                .fontWeight(.medium)
                .padding(.horizontal, Theme.Spacing.space2)
                .padding(.vertical, Theme.Spacing.space1)
                .background(stateColor.opacity(0.2))
                .foregroundStyle(stateColor)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
        }
        .glassCard()
    }

    private var stateColor: Color {
        switch recovery.state {
        case .ready:
            return Theme.success
        case .moderate:
            return Theme.warning
        case .recover:
            return Theme.destructive
        }
    }
}

// MARK: - Coach Placeholder Card

/// Placeholder for AI coach recommendations
struct CoachPlaceholderCard: View {
    var onSetUp: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "figure.outdoor.cycle")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("AI Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            Text("Set your FTP to get personalized training recommendations.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)

            HStack {
                Spacer()
                Button {
                    onSetUp?()
                } label: {
                    HStack(spacing: Theme.Spacing.space1) {
                        Text("Set Up")
                            .font(.callout.weight(.semibold))
                        Image(systemName: "chevron.right")
                            .font(.caption)
                    }
                    .foregroundColor(Theme.interactivePrimary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Training Load Card

/// Training load metrics card (CTL, ATL, TSB)
struct TrainingLoadCard: View {
    let load: TrainingLoadModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.info)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.info.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("Training Load")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            HStack(spacing: Theme.Spacing.space4) {
                LoadMetric(label: "Fitness", value: Int(load.ctl), color: .blue)
                LoadMetric(label: "Fatigue", value: Int(load.atl), color: .orange)
                LoadMetric(
                    label: "Form",
                    value: Int(load.tsb),
                    color: load.tsb >= 0 ? Theme.success : Theme.destructive
                )
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Load Metric

/// Individual load metric display
struct LoadMetric: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        VStack(spacing: Theme.Spacing.space1) {
            Text("\(value)")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Today Next Up Card

/// Shows the next session from the training block queue on the Today tab
struct TodayNextUpCard: View {
    let session: WeeklySessionModel
    let weekProgress: String

    var body: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: session.systemImage)
                .font(.title3)
                .foregroundStyle(sessionColor)
                .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                .background(sessionColor.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("Next Up: \(session.displayName)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: Theme.Spacing.space2) {
                    Text("\(session.suggestedDurationMinutes) min")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)

                    if !session.pelotonClassTypes.isEmpty {
                        Text(session.pelotonClassTypes.first ?? "")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
            }

            Spacer()

            Text("Session \(weekProgress)")
                .font(.caption)
                .foregroundStyle(Theme.textTertiary)
        }
        .glassCard()
        .auroraGlow(sessionColor, intensity: .secondary)
    }

    private var sessionColor: Color {
        switch SessionType(rawValue: session.sessionType) {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        default: return Theme.interactivePrimary
        }
    }
}

// MARK: - Previews

#Preview("With Recovery Data") {
    CyclingTodayView()
        .environmentObject(CyclingViewModel())
        .environmentObject(HealthKitManager())
        .padding(Theme.Spacing.space5)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Without Recovery Data") {
    CyclingTodayView()
        .environmentObject(CyclingViewModel())
        .environmentObject(HealthKitManager())
        .padding(Theme.Spacing.space5)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
