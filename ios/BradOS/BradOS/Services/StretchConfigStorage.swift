import Foundation
import BradOSCore

/// Service for persisting stretch session configuration to UserDefaults
class StretchConfigStorage {
    static let shared = StretchConfigStorage()

    private let defaults = UserDefaults.standard
    private let configKey = "stretch-session-config"

    private init() {}

    /// Save the stretch session configuration
    func save(_ config: StretchSessionConfig) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(config) {
            defaults.set(data, forKey: configKey)
        }
    }

    /// Load the saved stretch session configuration, or return default if none exists
    func load() -> StretchSessionConfig {
        guard let data = defaults.data(forKey: configKey),
              let config = try? JSONDecoder().decode(StretchSessionConfig.self, from: data) else {
            return .defaultConfig
        }
        return config
    }
}
