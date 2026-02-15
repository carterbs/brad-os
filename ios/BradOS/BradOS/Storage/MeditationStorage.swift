import Foundation

/// UserDefaults-based storage for meditation session state and configuration
final class MeditationStorage {
    static let shared = MeditationStorage()

    private let userDefaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // Keys
    private let sessionStateKey = "meditation-session-state"
    private let configKey = "meditation-config"

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    // MARK: - Session State

    /// Save current meditation session state for crash recovery
    func saveMeditationState(_ state: MeditationSessionPersisted) {
        do {
            let data = try encoder.encode(state)
            userDefaults.set(data, forKey: sessionStateKey)
        } catch {
            print("Failed to save meditation state: \(error)")
        }
    }

    /// Load saved meditation session state
    func loadMeditationState() -> MeditationSessionPersisted? {
        guard let data = userDefaults.data(forKey: sessionStateKey) else {
            return nil
        }
        do {
            return try decoder.decode(MeditationSessionPersisted.self, from: data)
        } catch {
            print("Failed to load meditation state: \(error)")
            clearMeditationState()
            return nil
        }
    }

    /// Clear saved meditation session state
    func clearMeditationState() {
        userDefaults.removeObject(forKey: sessionStateKey)
    }

    /// Check if a saved session is stale (> 1 hour old)
    func isMeditationSessionStale(_ state: MeditationSessionPersisted) -> Bool {
        // If there's no start time, it's not valid
        guard let sessionStartedAt = state.sessionStartedAt else {
            return true
        }

        // Check if it's been paused too long
        if let pausedAt = state.pausedAt {
            let pauseDuration = Date().timeIntervalSince(pausedAt)
            if pauseDuration > meditationPauseTimeout {
                return true
            }
        }

        // Check if the overall session is too old
        let sessionAge = Date().timeIntervalSince(sessionStartedAt)
        return sessionAge > meditationStaleThreshold
    }

    /// Try to recover a valid session, returns nil if stale or none exists
    func recoverableSession() -> MeditationSessionPersisted? {
        guard let state = loadMeditationState() else {
            return nil
        }

        // Don't recover completed or idle sessions
        guard state.status == .active || state.status == .paused else {
            clearMeditationState()
            return nil
        }

        // Check if stale
        if isMeditationSessionStale(state) {
            clearMeditationState()
            return nil
        }

        return state
    }

    /// Check if a persisted session is a guided meditation
    func isGuidedSession(_ state: MeditationSessionPersisted) -> Bool {
        return state.guidedScriptId != nil
    }

    // MARK: - Configuration

    /// Save user's meditation preferences
    func saveMeditationConfig(_ config: MeditationConfig) {
        do {
            let data = try encoder.encode(config)
            userDefaults.set(data, forKey: configKey)
        } catch {
            print("Failed to save meditation config: \(error)")
        }
    }

    /// Load user's meditation preferences
    func loadMeditationConfig() -> MeditationConfig {
        guard let data = userDefaults.data(forKey: configKey) else {
            return .default
        }
        do {
            return try decoder.decode(MeditationConfig.self, from: data)
        } catch {
            print("Failed to load meditation config: \(error)")
            return .default
        }
    }
}
