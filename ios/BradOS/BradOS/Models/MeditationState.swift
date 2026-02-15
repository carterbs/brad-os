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
    var sessionType: String
    var durationMinutes: Int
    var sessionStartedAt: Date?
    var pausedAt: Date?
    var pausedElapsed: TimeInterval  // Seconds accumulated before pause
    var scheduledCues: [ScheduledCue]
    var currentPhaseIndex: Int

    // Guided meditation recovery fields
    var guidedScriptId: String?
    var guidedCategory: String?
    var guidedElapsedSeconds: TimeInterval?  // Pipeline elapsed time for recovery

    /// Total duration in seconds
    var totalDurationSeconds: Int {
        durationMinutes * 60
    }

    /// Calculate elapsed time accounting for pauses
    func calculateElapsed() -> TimeInterval {
        guard let startedAt = sessionStartedAt else { return 0 }

        if let pausedAt = pausedAt {
            // Currently paused - elapsed is time until pause + previous paused time
            return pausedAt.timeIntervalSince(startedAt) - pausedElapsed
        } else {
            // Currently running - elapsed is total time since start minus paused time
            return Date().timeIntervalSince(startedAt) - pausedElapsed
        }
    }

    /// Calculate remaining time
    func calculateRemaining() -> TimeInterval {
        let elapsed = calculateElapsed()
        return max(0, Double(totalDurationSeconds) - elapsed)
    }
}

// MARK: - Scheduled Audio Cue

/// A scheduled audio cue with play status
struct ScheduledCue: Codable, Identifiable {
    var id: UUID = UUID()
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
