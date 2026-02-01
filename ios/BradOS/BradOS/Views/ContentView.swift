import SwiftUI

/// Main content view that manages navigation between different contexts
struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            Theme.background
                .ignoresSafeArea()

            if appState.isShowingLiftingContext {
                LiftingTabView()
            } else if appState.isShowingStretch {
                StretchView()
            } else if appState.isShowingMeditation {
                MeditationView()
            } else if appState.isShowingMealPlan {
                MealPlanView()
            } else {
                MainTabView()
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
