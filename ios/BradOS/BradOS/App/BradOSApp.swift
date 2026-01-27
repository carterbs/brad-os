import SwiftUI
import BradOSCore
import FirebaseCore
import FirebaseAppCheck

@main
struct BradOSApp: App {
    @StateObject private var appState = AppState()

    init() {
        // Configure App Check BEFORE FirebaseApp.configure()
        // Simulators use debug provider, physical devices use DeviceCheck
        #if targetEnvironment(simulator)
        let providerFactory = AppCheckDebugProviderFactory()
        #else
        let providerFactory = DeviceCheckProviderFactory()
        #endif

        AppCheck.setAppCheckProviderFactory(providerFactory)
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environment(\.apiClient, APIClient.shared)
                .preferredColorScheme(.dark)
                .onAppear {
                    // Request notification permission for rest timer
                    RestTimerManager.requestNotificationPermission()
                }
        }
    }
}

/// Global app state for navigation and shared data
class AppState: ObservableObject {
    @Published var selectedTab: MainTab = .today
    @Published var isShowingLiftingContext: Bool = false
    @Published var isShowingStretch: Bool = false
    @Published var isShowingMeditation: Bool = false

    /// Selected workout ID for navigation to workout detail
    @Published var selectedWorkoutId: String?

    /// Reference to the API client for convenience
    let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    /// Navigate to a specific workout
    func navigateToWorkout(_ workoutId: String) {
        selectedWorkoutId = workoutId
        isShowingLiftingContext = true
    }
}

enum MainTab: Hashable {
    case today
    case activities
    case history
    case profile
}

// MARK: - Environment Key for API Client

/// Environment key for injecting the API client
struct APIClientKey: EnvironmentKey {
    static let defaultValue: APIClientProtocol = APIClient.shared
}

extension EnvironmentValues {
    /// The API client for making network requests
    var apiClient: APIClientProtocol {
        get { self[APIClientKey.self] }
        set { self[APIClientKey.self] = newValue }
    }
}
