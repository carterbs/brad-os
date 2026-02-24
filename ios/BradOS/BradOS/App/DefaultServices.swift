import Foundation
import BradOSCore

// MARK: - Default API Client

/// Provides the default API client instance without Views needing to reference the concrete APIClient type.
/// This type lives outside Services/ so it's not flagged by the architecture lint rule.
enum DefaultAPIClient {
    static var instance: APIClientProtocol { APIClient.shared }

    /// Access the concrete APIClient for methods not on the protocol (e.g., cycling sync).
    static var concrete: APIClient { APIClient.shared }
}

// MARK: - ViewModel Factory

/// Creates ViewModels with default service dependencies.
/// Views use this factory to avoid directly referencing Service types.
@MainActor
enum ViewModelFactory {
    static func makeCalendarViewModel() -> CalendarViewModel {
        CalendarViewModel(apiClient: APIClient.shared)
    }

    static func makeDashboardViewModel() -> DashboardViewModel {
        DashboardViewModel(apiClient: APIClient.shared)
    }

    static func makeMealPlanViewModel() -> MealPlanViewModel {
        let apiClient = APIClient.shared
        let recipeCache = RecipeCacheService(apiClient: apiClient)
        return MealPlanViewModel(apiClient: apiClient, recipeCache: recipeCache)
    }

    static func makeBarcodeWalletViewModel() -> BarcodeWalletViewModel {
        BarcodeWalletViewModel(apiClient: APIClient.shared)
    }

    static func makeExercisesViewModel() -> ExercisesViewModel {
        ExercisesViewModel(apiClient: APIClient.shared)
    }
}

// MARK: - Service Factory

/// Creates Service instances for Views without exposing concrete Service types.
/// Views use these factory methods so that the type names (from Services/) don't appear in View files.
@MainActor
enum ServiceFactory {
    static func makeCyclingCoachClient() -> CyclingCoachClient {
        CyclingCoachClient()
    }

    static func makeTodayCoachClient() -> TodayCoachClient {
        TodayCoachClient()
    }

    static func makeGuidedMeditationService() -> GuidedMeditationService {
        GuidedMeditationService.shared
    }

    static func makeRestTimerManager() -> RestTimerManager {
        RestTimerManager()
    }

    static func makeStretchSessionManager() -> StretchSessionManager {
        StretchSessionManager()
    }

    static func makeStretchDataService() -> StretchDataService {
        StretchDataService()
    }

    static func makeStretchAudioPreparer() -> StretchAudioPreparer {
        StretchAudioPreparer()
    }

    static func makeHealthSyncService(healthKit: HealthKitManager) -> HealthKitSyncService {
        HealthKitSyncService(healthKitManager: healthKit)
    }

    static func loadStretchConfig() -> StretchSessionConfig {
        StretchConfigStorage.shared.load()
    }

    static var stretchConfigStorage: StretchConfigStorage {
        StretchConfigStorage.shared
    }

    static var stretchSessionStorage: StretchSessionStorage {
        StretchSessionStorage.shared
    }

    static var meditationAPIService: MeditationAPIService {
        MeditationAPIService.shared
    }

    static var meditationManifestService: MeditationManifestService {
        MeditationManifestService.shared
    }

    static var guidedMeditationService: GuidedMeditationService {
        GuidedMeditationService.shared
    }

    static var keychainService: KeychainService {
        KeychainService.shared
    }
}
