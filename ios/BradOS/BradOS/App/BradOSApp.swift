import SwiftUI
import WidgetKit
import BackgroundTasks
import BradOSCore
import FirebaseCore
import FirebaseAppCheck

@main
struct BradOSApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var stravaAuthManager = StravaAuthManager()
    @StateObject private var healthKitManager = HealthKitManager()
    @StateObject private var healthKitSyncService: HealthKitSyncService
    @StateObject private var cyclingViewModel = CyclingViewModel()
    @StateObject private var watchWorkoutController = WatchWorkoutController()

    @Environment(\.scenePhase) private var scenePhase

    /// Background task identifier for HealthKit sync
    private static let healthKitSyncTaskId = "com.bradcarter.brad-os.healthkit-sync"

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

        // Initialize sync service with shared HealthKitManager
        let hkManager = HealthKitManager()
        _healthKitManager = StateObject(wrappedValue: hkManager)
        _healthKitSyncService = StateObject(wrappedValue: HealthKitSyncService(healthKitManager: hkManager))

        // Register background task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.healthKitSyncTaskId,
            using: nil
        ) { task in
            guard let bgTask = task as? BGAppRefreshTask else { return }
            Self.handleBackgroundSync(bgTask, healthKitManager: hkManager)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(stravaAuthManager)
                .environmentObject(healthKitManager)
                .environmentObject(healthKitSyncService)
                .environmentObject(cyclingViewModel)
                .environmentObject(watchWorkoutController)
                .environment(\.apiClient, APIClient.shared)
                .preferredColorScheme(.dark)
                .onAppear {
                    // Request notification permission for rest timer
                    RestTimerManager.requestNotificationPermission()
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
        default:
            break
        }
    }

    private func handleScenePhaseChange(from newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App came to foreground - sync if needed
            Task {
                await healthKitSyncService.syncIfNeeded()
            }
        case .background:
            // Schedule background refresh when going to background
            scheduleBackgroundSync()
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    private func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: Self.healthKitSyncTaskId)
        // Request earliest time: 4 hours from now (system may delay further)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 60 * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[BradOSApp] Scheduled background HealthKit sync")
        } catch {
            print("[BradOSApp] Failed to schedule background sync: \(error)")
        }
    }

    @MainActor
    private static func handleBackgroundSync(_ task: BGAppRefreshTask, healthKitManager: HealthKitManager) {
        // Create a new sync service for background execution
        let syncService = HealthKitSyncService(healthKitManager: healthKitManager)

        // Set up expiration handler
        task.expirationHandler = {
            print("[BradOSApp] Background sync expired")
            task.setTaskCompleted(success: false)
        }

        // Perform sync
        Task {
            await syncService.sync()
            task.setTaskCompleted(success: true)
            print("[BradOSApp] Background sync completed")
        }
    }
}

/// Global app state for navigation and shared data
class AppState: ObservableObject {
    @Published var selectedTab: MainTab = .today
    @Published var isShowingLiftingContext: Bool = false
    @Published var isShowingStretch: Bool = false
    @Published var isShowingMeditation: Bool = false
    @Published var isShowingMealPlan: Bool = false
    @Published var isShowingCycling: Bool = false

    /// Selected workout ID for navigation to workout detail
    @Published var selectedWorkoutId: String?

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
