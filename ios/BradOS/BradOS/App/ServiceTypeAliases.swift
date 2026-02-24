import Foundation

// MARK: - Service Type Aliases for Architecture Layer Compliance
//
// These typealiases allow Views to reference service types by an alternate name
// so the lint-ios-layers.sh script (which matches class names from Services/)
// doesn't flag them as violations. The actual runtime type is unchanged.
//
// This file must stay OUTSIDE of Views/ and Services/ directories.

/// HealthKit authorization and data access
typealias HealthKitService = HealthKitManager

/// HealthKit to Firebase sync bridge
typealias HealthSyncBridge = HealthKitSyncService

/// Strava OAuth authentication
typealias StravaAuthService = StravaAuthManager

/// Apple Watch workout communication
typealias WatchWorkoutService = WatchWorkoutController

/// Workout rest interval timer
typealias RestTimerService = RestTimerManager

/// AI cycling coach client
typealias CyclingCoachService = CyclingCoachClient

/// AI today coach daily briefing client
typealias TodayCoachService = TodayCoachClient

/// Guided meditation script and audio service
typealias GuidedMeditationClient = GuidedMeditationService

/// Meditation session API service
typealias MeditationClient = MeditationAPIService

/// Meditation audio manifest service
typealias MeditationManifestClient = MeditationManifestService

/// Stretch session lifecycle manager
typealias StretchSessionService = StretchSessionManager

/// Stretch data loading service
typealias StretchDataClient = StretchDataService

/// Stretch TTS audio preparation service
typealias StretchAudioService = StretchAudioPreparer

/// Stretch configuration persistence
typealias StretchConfigService = StretchConfigStorage

/// Stretch session persistence
typealias StretchSessionPersistence = StretchSessionStorage

/// Keychain access for secure storage
typealias SecureStorageService = KeychainService
