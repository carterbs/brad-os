import Foundation

// MARK: - Session Status

/// Status of a meditation session
enum MeditationStatus: String, Codable {
    case idle
    case active
    case paused
    case complete
}

// MARK: - Persisted Session State

/// Session state persisted to UserDefaults for crash recovery
struct MeditationSessionPersisted: Codable {
    var status: MeditationStatus
    var durationMinutes: Int
    var sessionStartedAt: Date?
    var pausedAt: Date?
    var pausedElapsed: TimeInterval  // Seconds accumulated before pause
    var scheduledCues: [ScheduledCue]

    // Guided meditation recovery fields
    var guidedScriptId: String?
}

// MARK: - Scheduled Audio Cue

/// A scheduled audio cue with play status
struct ScheduledCue: Codable, Identifiable {
    var id = UUID()
    let atSeconds: Int
    let audioFile: String
    var played: Bool

    enum CodingKeys: String, CodingKey {
        case id, atSeconds, audioFile, played
    }
}

// MARK: - User Configuration

/// User preferences for meditation
struct MeditationConfig: Codable {
    var duration: Int  // 5, 10, or 20
    var selectedCategory: String?  // "breathing" or "reactivity"

    static let `default` = MeditationConfig(duration: 5, selectedCategory: nil)
}

// MARK: - Constants

/// How long before a saved session is considered stale (1 hour)
let meditationStaleThreshold: TimeInterval = 60 * 60

/// How long a paused session can remain before auto-ending (30 minutes)
let meditationPauseTimeout: TimeInterval = 30 * 60
