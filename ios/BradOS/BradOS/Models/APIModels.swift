import Foundation

/// Response from calendar API
struct CalendarData: Codable {
    let startDate: String
    let endDate: String
    let days: [String: CalendarDayData]

    enum CodingKeys: String, CodingKey {
        case startDate = "start_date"
        case endDate = "end_date"
        case days
    }
}

/// Statistics from meditation sessions API
struct MeditationStats: Codable {
    let totalSessions: Int
    let totalMinutes: Int
    let currentStreak: Int
    let longestStreak: Int

    enum CodingKeys: String, CodingKey {
        case totalSessions = "total_sessions"
        case totalMinutes = "total_minutes"
        case currentStreak = "current_streak"
        case longestStreak = "longest_streak"
    }
}

/// Exercise history from API
struct ExerciseHistory: Codable {
    let exercise: Exercise
    let entries: [ExerciseHistoryEntry]
    let personalRecord: PersonalRecord?

    enum CodingKeys: String, CodingKey {
        case exercise
        case entries
        case personalRecord = "personal_record"
    }
}

/// A single entry in exercise history
struct ExerciseHistoryEntry: Codable, Identifiable {
    var id: Int { workoutId }
    let workoutId: Int
    let date: Date
    let weekNumber: Int
    let sets: [HistorySet]

    enum CodingKeys: String, CodingKey {
        case workoutId = "workout_id"
        case date
        case weekNumber = "week_number"
        case sets
    }
}

/// A set within exercise history
struct HistorySet: Codable {
    let setNumber: Int
    let targetReps: Int
    let targetWeight: Double
    let actualReps: Int?
    let actualWeight: Double?
    let status: SetStatus

    enum CodingKeys: String, CodingKey {
        case setNumber = "set_number"
        case targetReps = "target_reps"
        case targetWeight = "target_weight"
        case actualReps = "actual_reps"
        case actualWeight = "actual_weight"
        case status
    }
}

/// Personal record for an exercise
struct PersonalRecord: Codable {
    let weight: Double
    let reps: Int
    let date: Date
}

// MARK: - Mock Data

extension MeditationStats {
    static let mockStats = MeditationStats(
        totalSessions: 42,
        totalMinutes: 315,
        currentStreak: 7,
        longestStreak: 14
    )
}

extension ExerciseHistory {
    static let mockHistory = ExerciseHistory(
        exercise: Exercise.mockExercises[0],
        entries: [],
        personalRecord: PersonalRecord(
            weight: 185,
            reps: 8,
            date: Date()
        )
    )
}
