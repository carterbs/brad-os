import SwiftUI

/// Main dashboard showing today's scheduled activities
struct TodayDashboardView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    // Workout Card
                    WorkoutDashboardCard(
                        workout: viewModel.workout,
                        isLoading: viewModel.isLoadingWorkout
                    ) {
                        navigateToWorkout()
                    }

                    // Stretch Card
                    StretchDashboardCard(
                        lastSession: viewModel.latestStretchSession,
                        isLoading: viewModel.isLoadingStretch
                    ) {
                        appState.isShowingStretch = true
                    }

                    // Meditation Card
                    MeditationDashboardCard(
                        lastSession: viewModel.latestMeditationSession,
                        isLoading: viewModel.isLoadingMeditation
                    ) {
                        appState.isShowingMeditation = true
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await viewModel.loadDashboard()
            }
            .task {
                await viewModel.loadDashboard()
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
        .preferredColorScheme(.dark)
}

#Preview("Loading") {
    TodayDashboardView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}

#Preview("Empty (Rest Day)") {
    TodayDashboardView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
