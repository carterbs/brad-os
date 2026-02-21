import Foundation

// MARK: - WatchConnectivity Message Keys

/// String constants for WatchConnectivity message dictionary keys
enum WCMessageKey {
    static let workoutContext = "workoutContext"
    static let exerciseUpdate = "exerciseUpdate"
    static let restTimerEvent = "restTimerEvent"
    static let setLogRequest = "setLogRequest"
}

// MARK: - iPhone → Watch: Full Workout Context

/// Complete workout snapshot sent when a workout starts on iPhone
struct WatchWorkoutContext: Codable {
}

/// Exercise info for Watch display
struct WatchExerciseInfo: Codable, Identifiable {
    let exerciseId: String

    var id: String { exerciseId }
}

/// Individual set info for Watch display
struct WatchSetInfo: Codable, Identifiable {
    let setId: String

    var id: String { setId }
}

// MARK: - iPhone → Watch: Exercise Update

/// Sent when a set is logged/skipped on iPhone
struct WatchExerciseUpdate: Codable {
}

// MARK: - iPhone → Watch: Rest Timer Event

/// Sent when rest timer starts or is dismissed on iPhone
struct WatchRestTimerEvent: Codable {
}

// MARK: - Watch → iPhone: Set Log Request

/// Sent when user taps "Log Set" on Watch
struct WatchSetLogRequest: Codable {
    let setId: String
    let exerciseId: String
}

// MARK: - Notification Names

extension Notification.Name {
    /// Posted when Watch requests a set to be logged
    static let watchSetLogRequested = Notification.Name("watchSetLogRequested")
}
