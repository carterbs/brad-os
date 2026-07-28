import SwiftUI
import BradOSCore

/// Main dashboard showing today's scheduled activities
struct TodayDashboardView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKitManager: HealthKitService
    @StateObject private var viewModel = ViewModelFactory.makeDashboardViewModel()

    /// Track last dashboard load to avoid redundant reloads on foreground
    @State private var lastLoadTime: Date?
    private let foregroundReloadInterval: TimeInterval = 300 // 5 min

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                daymarkHeader

                ScrollView {
                    VStack(spacing: Theme.Spacing.space6) {
                        TodayCoachCard()

                        MealPlanDashboardCard(
                            todayMeals: viewModel.todayMeals,
                            isLoading: viewModel.isLoadingMealPlan,
                            onTap: {
                                appState.selectedTab = .meals
                            },
                            onLongPress: {
                                Task {
                                    await viewModel.refreshMealPlan(forceRefresh: true)
                                }
                            },
                            prepAheadMealIds: viewModel.prepAheadMealIds,
                            prepAheadMeals: viewModel.prepAheadMeals
                        )

                        WorkoutDashboardCard(
                            workout: viewModel.workout,
                            isLoading: viewModel.isLoadingWorkout
                        ) {
                            navigateToWorkout()
                        }
                    }
                    .padding(Theme.Spacing.space5)
                }
            }
            .background(AuroraBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .refreshable {
                // Pull-to-refresh always forces a reload
                await viewModel.loadDashboard()
                await healthKitManager.refresh()
                lastLoadTime = Date()
            }
            .task {
                await viewModel.loadDashboard()
                lastLoadTime = Date()
                // Request HealthKit authorization and load recovery data
                if healthKitManager.isHealthDataAvailable && !isSkippingSystemPrompts {
                    try? await healthKitManager.requestAuthorization()
                    await healthKitManager.refresh()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task {
                    // Skip reload if we loaded recently (API cache handles staleness)
                    if let lastLoad = lastLoadTime,
                       Date().timeIntervalSince(lastLoad) < foregroundReloadInterval {
                        return
                    }
                    await viewModel.loadDashboard()
                    lastLoadTime = Date()
                }
            }
        }
    }

    private var daymarkHeader: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
            Text("Today")
                .font(.system(size: 34, weight: .bold))
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .font(.subheadline.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.8)
                .opacity(0.88)
        }
        .foregroundStyle(Theme.textOnAccent)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.space5)
        .padding(.vertical, Theme.Spacing.space4)
        .background(Theme.Background.highlight)
    }

    private var isSkippingSystemPrompts: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-skipSystemPrompts")
            || ProcessInfo.processInfo.environment["BRAD_OS_SKIP_SYSTEM_PROMPTS"] == "1"
        #else
        false
        #endif
    }

    // MARK: - Navigation

    private func navigateToWorkout() {
        if let workoutId = viewModel.workout?.id {
            appState.navigateToWorkout(workoutId)
        }
    }
}

// MARK: - Previews

#Preview("With Data") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.light)
}

#Preview("Loading") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.light)
}

#Preview("Empty (Rest Day)") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.light)
}
