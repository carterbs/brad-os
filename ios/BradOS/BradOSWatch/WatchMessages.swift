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
    let dayName: String
    var exercises: [WatchExerciseInfo]
}

/// Exercise info for Watch display
struct WatchExerciseInfo: Codable, Identifiable {
    let exerciseId: String
    let name: String
    let totalSets: Int
    var completedSets: Int
    var sets: [WatchSetInfo]

    var id: String { exerciseId }
}

/// Individual set info for Watch display
struct WatchSetInfo: Codable, Identifiable {
    let setId: String
    let targetReps: Int
    let targetWeight: Double
    var status: String // "pending", "completed", "skipped"

    var id: String { setId }
}

// MARK: - iPhone → Watch: Exercise Update

/// Sent when a set is logged/skipped on iPhone
struct WatchExerciseUpdate: Codable {
    let exerciseId: String
    let setId: String
    let newStatus: String // "completed", "skipped", "pending"
    let completedSets: Int
}

// MARK: - iPhone → Watch: Rest Timer Event

/// Sent when rest timer starts or is dismissed on iPhone
struct WatchRestTimerEvent: Codable {
    let action: String // "start" or "dismiss"
    let targetSeconds: Int?
    let exerciseName: String?
}

// MARK: - Watch → iPhone: Set Log Request

/// Sent when user taps "Log Set" on Watch
struct WatchSetLogRequest: Codable {
    let setId: String
}
