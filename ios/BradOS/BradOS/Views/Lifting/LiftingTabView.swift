import SwiftUI

/// Tab selection within lifting context
enum LiftingTab: Hashable {
    case meso
    case plans
    case exercises
}

/// Tab navigation for lifting context (Meso, Plans, Exercises)
struct LiftingTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: LiftingTab = .meso
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            TabView(selection: $selectedTab) {
                MesoView(navigationPath: $navigationPath)
                    .tabItem {
                        Label("Meso", systemImage: "calendar.badge.clock")
                    }
                    .tag(LiftingTab.meso)

                PlansView(navigationPath: $navigationPath)
                    .tabItem {
                        Label("Plans", systemImage: "list.bullet.clipboard")
                    }
                    .tag(LiftingTab.plans)

                ExercisesView()
                    .tabItem {
                        Label("Exercises", systemImage: "dumbbell")
                    }
                    .tag(LiftingTab.exercises)
            }
            .tint(Theme.interactivePrimary)
            .background(AuroraBackground().ignoresSafeArea())
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationDestination(for: WorkoutDestination.self) { destination in
                WorkoutView(workoutId: destination.workoutId)
            }
            .navigationDestination(for: PlanDestination.self) { destination in
                PlanDetailView(planId: destination.planId)
            }
            .navigationDestination(for: ExerciseHistoryDestination.self) { destination in
                ExerciseHistoryView(exerciseId: destination.exerciseId, exerciseName: destination.exerciseName)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(
                        action: {
                            appState.isShowingLiftingContext = false
                        },
                        label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.interactivePrimary)
                        }
                    )
                }
            }
            .onAppear {
                if let workoutId = appState.selectedWorkoutId {
                    navigationPath.append(WorkoutDestination(workoutId: workoutId))
                    appState.selectedWorkoutId = nil
                }
            }
        }
    }
}

// MARK: - Navigation Destinations

struct WorkoutDestination: Hashable {
    let workoutId: String
}

struct PlanDestination: Hashable {
    let planId: String
}

struct ExerciseHistoryDestination: Hashable {
    let exerciseId: String
    let exerciseName: String
}

#Preview {
    LiftingTabView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}
