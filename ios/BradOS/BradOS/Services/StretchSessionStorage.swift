import Foundation

/// Service for persisting stretch session state for crash recovery
class StretchSessionStorage {
    static let shared = StretchSessionStorage()

    private let defaults = UserDefaults.standard
    private let stateKey = "stretch-session-state"

    /// Sessions older than 1 hour are considered stale
    private let staleThreshold: TimeInterval = 60 * 60  // 1 hour

    private init() {}

    /// Save the current session state
    func save(_ state: StretchSessionPersistableState) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(state) {
            defaults.set(data, forKey: stateKey)
            defaults.set(Date(), forKey: "\(stateKey)-timestamp")
        }
    }

    /// Load the saved session state if not stale
    /// Returns nil if no session saved or if session is stale (>1 hour old)
    func load() -> StretchSessionPersistableState? {
        guard let data = defaults.data(forKey: stateKey),
              let state = try? JSONDecoder().decode(StretchSessionPersistableState.self, from: data) else {
            return nil
        }

        // Check staleness using either pausedAt or the saved timestamp
        let timestamp = state.pausedAt ?? defaults.object(forKey: "\(stateKey)-timestamp") as? Date ?? Date.distantPast
        let age = Date().timeIntervalSince(timestamp)

        if age > staleThreshold {
            // Session is stale, discard it
            clear()
            return nil
        }

        return state
    }

    /// Get information about the recoverable session without loading full state
    func getRecoveryInfo() -> (stretchName: String, regionName: String, progress: String)? {
        guard let state = load(),
              state.currentStretchIndex < state.selectedStretches.count else {
            return nil
        }

        let currentStretch = state.selectedStretches[state.currentStretchIndex]
        let progress = "\(state.currentStretchIndex + 1) of \(state.selectedStretches.count)"

        return (
            stretchName: currentStretch.definition.name,
            regionName: currentStretch.region.displayName,
            progress: progress
        )
    }

    /// Clear the saved session state
    func clear() {
        defaults.removeObject(forKey: stateKey)
        defaults.removeObject(forKey: "\(stateKey)-timestamp")
    }
}
