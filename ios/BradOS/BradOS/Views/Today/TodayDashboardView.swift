import SwiftUI
import BradOSCore

/// Main dashboard showing today's scheduled activities
struct TodayDashboardView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKitManager: HealthKitManager
    @StateObject private var viewModel = DashboardViewModel(apiClient: APIClient.shared)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Readiness Card (Recovery from HealthKit)
                    ReadinessCard()

                    // Meal Plan Card
                    MealPlanDashboardCard(
                        todayMeals: viewModel.todayMeals,
                        isLoading: viewModel.isLoadingMealPlan,
                        onTap: {
                            appState.isShowingMealPlan = true
                        },
                        onLongPress: {
                            Task {
                                await viewModel.refreshMealPlan(forceRefresh: true)
                            }
                        }
                    )

                    // Workout Card
                    WorkoutDashboardCard(
                        workout: viewModel.workout,
                        isLoading: viewModel.isLoadingWorkout
                    ) {
                        navigateToWorkout()
                    }
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .refreshable {
                await viewModel.loadDashboard()
                await healthKitManager.refresh()
            }
            .task {
                await viewModel.loadDashboard()
                // Request HealthKit authorization and load recovery data
                if healthKitManager.isHealthDataAvailable {
                    try? await healthKitManager.requestAuthorization()
                    await healthKitManager.refresh()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task {
                    await viewModel.loadDashboard()
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
        .preferredColorScheme(.dark)
}

#Preview("Loading") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.dark)
}

#Preview("Empty (Rest Day)") {
    TodayDashboardView()
        .environmentObject(AppState())
        .environmentObject(HealthKitManager())
        .preferredColorScheme(.dark)
}
