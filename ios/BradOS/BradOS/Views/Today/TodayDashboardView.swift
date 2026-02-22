import SwiftUI
import BradOSCore

/// Main dashboard showing today's scheduled activities
struct TodayDashboardView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKitManager: HealthKitManager
    @EnvironmentObject var cyclingViewModel: CyclingViewModel
    @StateObject private var viewModel = DashboardViewModel(apiClient: APIClient.shared)

    /// Track last dashboard load to avoid redundant reloads on foreground
    @State private var lastLoadTime: Date?
    private let foregroundReloadInterval: TimeInterval = 300 // 5 min

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Today Coach Card (AI daily briefing)
                    TodayCoachCard()

                    // Meal Plan Card
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

                    // Workout Card
                    WorkoutDashboardCard(
                        workout: viewModel.workout,
                        isLoading: viewModel.isLoadingWorkout
                    ) {
                        navigateToWorkout()
                    }

                    // Cycling Card
                    CyclingDashboardCard(
                        nextSession: cyclingViewModel.nextSession,
                        weekProgress: cyclingViewModel.nextSession != nil
                            ? "\(cyclingViewModel.sessionsCompletedThisWeek + 1) of \(cyclingViewModel.weeklySessionsTotal)"
                            : nil,
                        isLoading: cyclingViewModel.isLoading,
                        onTap: {
                            appState.isShowingCycling = true
                        }
                    )
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .refreshable {
                // Pull-to-refresh always forces a reload
                await viewModel.loadDashboard()
                await healthKitManager.refresh()
                lastLoadTime = Date()
            }
            .task {
                await viewModel.loadDashboard()
                await cyclingViewModel.loadData()
                lastLoadTime = Date()
                // Request HealthKit authorization and load recovery data
                if healthKitManager.isHealthDataAvailable {
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
                    await cyclingViewModel.loadData()
                    lastLoadTime = Date()
                }
            }
        }
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
        .environmentObject(CyclingViewModel())
        .preferredColorScheme(.dark)
}

#Preview("Loading") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .environmentObject(CyclingViewModel())
        .preferredColorScheme(.dark)
}

#Preview("Empty (Rest Day)") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .environmentObject(CyclingViewModel())
        .preferredColorScheme(.dark)
}
