import SwiftUI

@main
struct BradOSApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environment(\.apiClient, APIClient.shared)
                .preferredColorScheme(.dark)
        }
    }
}

/// Global app state for navigation and shared data
class AppState: ObservableObject {
    @Published var selectedTab: MainTab = .today
    @Published var isShowingLiftingContext: Bool = false
    @Published var isShowingStretch: Bool = false
    @Published var isShowingMeditation: Bool = false

    /// Reference to the API client for convenience
    let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
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
