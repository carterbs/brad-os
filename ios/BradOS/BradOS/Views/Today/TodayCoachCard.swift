import SwiftUI

/// Dashboard card displaying the AI Today Coach daily briefing.
///
/// Self-loading: syncs HealthKit to Firebase, fetches recovery, then calls the Today Coach API.
/// Shows loading/error/content states inline on the dashboard.
struct TodayCoachCard: View {
    @EnvironmentObject var healthKit: HealthKitService
    @StateObject private var coachClient = ServiceFactory.makeTodayCoachClient()
    @State private var syncService: HealthSyncBridge?
    @State var recovery: RecoveryData?
    @State private var isLoadingRecovery = false
    @State private var isShowingDetail = false

    var body: some View {
        Button(
            action: {
                if coachClient.recommendation != nil {
                    isShowingDetail = true
                }
            },
            label: { cardContent }
        )
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
        // Skip everything if coach already has a fresh cached recommendation
        if coachClient.hasFreshCache {
            // Still load recovery for the badge display if we don't have it
            if recovery == nil {
                do {
                    let snapshot = try await DefaultAPIClient.concrete.getLatestRecovery()
                    recovery = snapshot?.toRecoveryData()
                } catch {
                    DebugLogger.error("Failed to load recovery: \(error)", attributes: ["source": "TodayCoachCard"])
                }
            }
            return
        }

        isLoadingRecovery = true

        // Initialize sync service if needed
        if syncService == nil {
            syncService = ServiceFactory.makeHealthSyncService(healthKit: healthKit)
        }

        // Step 1: Sync HealthKit to Firebase only if needed
        // (respects 1-hour interval)
        await syncService?.syncIfNeeded()

        // Step 2: Fetch the latest recovery snapshot from Firebase
        do {
            let snapshot = try await DefaultAPIClient.concrete.getLatestRecovery()
            recovery = snapshot?.toRecoveryData()
        } catch {
            DebugLogger.error("Failed to load recovery: \(error)", attributes: ["source": "TodayCoachCard"])
        }

        isLoadingRecovery = false

        // Step 3: Call AI coach with fresh recovery data
        // (uses its own 30-min cache)
        if let recovery = recovery {
            await coachClient.getRecommendation(recovery: recovery)
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.interactivePrimary)

            HStack(spacing: Theme.Spacing.space2) {
                ProgressView()
                    .progressViewStyle(
                        CircularProgressViewStyle(
                            tint: Theme.interactivePrimary
                        )
                    )
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

            Text(
                "No recovery data available. " +
                "Wear your Apple Watch to collect HRV and sleep data."
            )
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
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
