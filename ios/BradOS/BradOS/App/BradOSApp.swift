import SwiftUI
import WidgetKit
import UIKit
import BradOSCore
import FirebaseCore
import FirebaseAppCheck

@main
struct BradOSApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var stravaAuthManager = StravaAuthManager()
    @StateObject private var healthKitManager = HealthKitManager()
    @StateObject private var healthKitSyncService: HealthKitSyncService
    @StateObject private var watchWorkoutController = WatchWorkoutController()

    @Environment(\.scenePhase) private var scenePhase

    init() {
        let isTestHost = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        if !isTestHost {
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

        // Initialize debug telemetry (no-op in release builds)
        DebugTelemetry.shared.setup()

        // Initialize sync service with shared HealthKitManager
        let hkManager = HealthKitManager()
        let syncService = HealthKitSyncService(healthKitManager: hkManager)
        _healthKitManager = StateObject(wrappedValue: hkManager)
        _healthKitSyncService = StateObject(wrappedValue: syncService)

        if !isTestHost {
            Task { @MainActor in
                await hkManager.startBackgroundDelivery {
                    if UIApplication.shared.applicationState == .background {
                        await syncService.syncForBackground()
                    } else {
                        await syncService.syncIfNeeded()
                    }
                }
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(stravaAuthManager)
                .environmentObject(healthKitManager)
                .environmentObject(healthKitSyncService)
                .environmentObject(watchWorkoutController)
                .environment(\.apiClient, APIClient.shared)
                .preferredColorScheme(.light)
                .onAppear {
                    if !isSkippingSystemPrompts {
                        RestTimerManager.requestNotificationPermission()
                    }
                }
                .onOpenURL { url in
                    handleDeepLink(url)
                }
                .onReceive(
                    NotificationCenter.default.publisher(
                        for: MealPlanCacheService.cacheDidChangeNotification
                    )
                ) { _ in
                    WidgetCenter.shared.reloadAllTimelines()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    handleScenePhaseChange(from: newPhase)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        // Handle Strava OAuth callback
        if url.scheme == "bradosapp" && url.host == "strava-callback" {
            stravaAuthManager.handleCallbackURL(url)
            return
        }

        // Handle other deep links
        guard url.scheme == "brados" else { return }
        switch url.host {
        case "mealplan":
            appState.selectedTab = .meals
        case "stretch":
            appState.isShowingStretch = true
        default:
            break
        }
    }

    private var isSkippingSystemPrompts: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-skipSystemPrompts")
            || ProcessInfo.processInfo.environment["BRAD_OS_SKIP_SYSTEM_PROMPTS"] == "1"
        #else
        false
        #endif
    }

    private func handleScenePhaseChange(from newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App came to foreground - sync if needed
            Task {
                await healthKitSyncService.syncIfNeeded()
            }
        case .background:
            // Flush pending telemetry before backgrounding
            DebugTelemetry.shared.flush()
        case .inactive:
            break
        @unknown default:
            break
        }
    }
}

/// Global app state for navigation and shared data
class AppState: ObservableObject {
    @Published var selectedTab: MainTab
    @Published var isShowingLiftingContext: Bool = false
    @Published var isShowingStretch: Bool = false
    @Published var isShowingMeditation: Bool = false
    @Published var isShowingMealPlan: Bool = false

    /// Selected workout ID for navigation to workout detail
    @Published var selectedWorkoutId: String?

    init() {
        #if DEBUG
        switch ProcessInfo.processInfo.environment["BRAD_OS_INITIAL_TAB"] {
        case "health":
            selectedTab = .health
        case "meals":
            selectedTab = .meals
        case "profile":
            selectedTab = .profile
        default:
            selectedTab = .today
        }
        #else
        selectedTab = .today
        #endif
    }

    /// Navigate to a specific workout
    func navigateToWorkout(_ workoutId: String) {
        selectedWorkoutId = workoutId
        isShowingLiftingContext = true
    }
}

enum MainTab: Hashable {
    case today
    case health
    case meals
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
