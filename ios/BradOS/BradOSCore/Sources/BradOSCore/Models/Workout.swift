import Foundation

/// Status of a workout
public enum WorkoutStatus: String, Codable, Sendable {
    case pending
    case inProgress = "in_progress"
    case completed
    case skipped
}

/// A scheduled workout instance
public struct Workout: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let mesocycleId: String
    public let planDayId: String
    public var weekNumber: Int
    public var scheduledDate: Date
    public var status: WorkoutStatus
    public var startedAt: Date?
    public var completedAt: Date?

    // Extended fields
    public var exercises: [WorkoutExercise]?
    public var planDayName: String?
    public var sets: [WorkoutSet]?

    public enum CodingKeys: String, CodingKey {
        case id
        case mesocycleId = "mesocycle_id"
        case planDayId = "plan_day_id"
        case weekNumber = "week_number"
        case scheduledDate = "scheduled_date"
        case status
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case exercises
        case planDayName = "plan_day_name"
        case sets
    }

    public init(
        id: String,
        mesocycleId: String,
        planDayId: String,
        weekNumber: Int,
        scheduledDate: Date,
        status: WorkoutStatus,
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        exercises: [WorkoutExercise]? = nil,
        planDayName: String? = nil,
        sets: [WorkoutSet]? = nil
    ) {
        self.id = id
        self.mesocycleId = mesocycleId
        self.planDayId = planDayId
        self.weekNumber = weekNumber
        self.scheduledDate = scheduledDate
        self.status = status
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.exercises = exercises
        self.planDayName = planDayName
        self.sets = sets
    }

    public var statusDisplayName: String {
        switch status {
        case .pending: return "Scheduled"
        case .inProgress: return "In Progress"
        case .completed: return "Completed"
        case .skipped: return "Skipped"
        }
    }
}

/// A computed warm-up set (not persisted, visual reminder only)
public struct WarmupSet: Identifiable, Codable, Hashable, Sendable {
    public var id: String { "warmup-\(warmupNumber)" }
    public let warmupNumber: Int
    public let targetReps: Int
    public let targetWeight: Double

    public enum CodingKeys: String, CodingKey {
        case warmupNumber = "warmup_number"
        case targetReps = "target_reps"
        case targetWeight = "target_weight"
    }

    public init(warmupNumber: Int, targetReps: Int, targetWeight: Double) {
        self.warmupNumber = warmupNumber
        self.targetReps = targetReps
        self.targetWeight = targetWeight
    }
}

/// An exercise within a workout with all its sets
public struct WorkoutExercise: Identifiable, Codable, Hashable, Sendable {
    public var id: String { exerciseId }
    public let exerciseId: String
    public let exerciseName: String
    public var sets: [WorkoutSet]
    public var totalSets: Int
    public var completedSets: Int
    public var restSeconds: Int
    public var warmupSets: [WarmupSet]

    public enum CodingKeys: String, CodingKey {
        case exerciseId = "exercise_id"
        case exerciseName = "exercise_name"
        case sets
        case totalSets = "total_sets"
        case completedSets = "completed_sets"
        case restSeconds = "rest_seconds"
        case warmupSets = "warmup_sets"
    }

    public init(
        exerciseId: String,
        exerciseName: String,
        sets: [WorkoutSet],
        totalSets: Int,
        completedSets: Int,
        restSeconds: Int,
        warmupSets: [WarmupSet] = []
    ) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        self.sets = sets
        self.totalSets = totalSets
        self.completedSets = completedSets
        self.restSeconds = restSeconds
        self.warmupSets = warmupSets
    }

    public var formattedRestTime: String {
        if restSeconds < 60 {
            return "\(restSeconds)s"
        } else if restSeconds % 60 == 0 {
            return "\(restSeconds / 60)m"
        } else {
            return "\(restSeconds / 60)m \(restSeconds % 60)s"
        }
    }
}

/// Status of an individual set
public enum SetStatus: String, Codable, Sendable {
    case pending
    case completed
    case skipped
}

/// An individual set within a workout
public struct WorkoutSet: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let workoutId: String
    public let exerciseId: String
    public var setNumber: Int
    public var targetReps: Int
    public var targetWeight: Double
    public var actualReps: Int?
    public var actualWeight: Double?
    public var status: SetStatus

    public enum CodingKeys: String, CodingKey {
        case id
        case workoutId = "workout_id"
        case exerciseId = "exercise_id"
        case setNumber = "set_number"
        case targetReps = "target_reps"
        case targetWeight = "target_weight"
        case actualReps = "actual_reps"
        case actualWeight = "actual_weight"
        case status
    }

    public init(
        id: String,
        workoutId: String,
        exerciseId: String,
        setNumber: Int,
        targetReps: Int,
        targetWeight: Double,
        actualReps: Int? = nil,
        actualWeight: Double? = nil,
        status: SetStatus
    ) {
        self.id = id
        self.workoutId = workoutId
        self.exerciseId = exerciseId
        self.setNumber = setNumber
        self.targetReps = targetReps
        self.targetWeight = targetWeight
        self.actualReps = actualReps
        self.actualWeight = actualWeight
        self.status = status
    }
}

// MARK: - Mock Data
public extension Workout {
    static let mockTodayWorkout: Workout = Workout(
        id: "mock-workout-1",
        mesocycleId: "mock-meso-1",
        planDayId: "mock-planday-1",
        weekNumber: 2,
        scheduledDate: Date(),
        status: .pending,
        startedAt: nil,
        completedAt: nil,
        exercises: [
            WorkoutExercise(
                exerciseId: "mock-exercise-1",
                exerciseName: "Bench Press",
                sets: [
                    WorkoutSet(id: "mock-set-1", workoutId: "mock-workout-1", exerciseId: "mock-exercise-1", setNumber: 1, targetReps: 10, targetWeight: 135, actualReps: nil, actualWeight: nil, status: .pending),
                    WorkoutSet(id: "mock-set-2", workoutId: "mock-workout-1", exerciseId: "mock-exercise-1", setNumber: 2, targetReps: 10, targetWeight: 135, actualReps: nil, actualWeight: nil, status: .pending),
                    WorkoutSet(id: "mock-set-3", workoutId: "mock-workout-1", exerciseId: "mock-exercise-1", setNumber: 3, targetReps: 10, targetWeight: 135, actualReps: nil, actualWeight: nil, status: .pending)
                ],
                totalSets: 3,
                completedSets: 0,
                restSeconds: 90,
                warmupSets: [
                    WarmupSet(warmupNumber: 1, targetReps: 10, targetWeight: 55),
                    WarmupSet(warmupNumber: 2, targetReps: 10, targetWeight: 80)
                ]
            ),
            WorkoutExercise(
                exerciseId: "mock-exercise-4",
                exerciseName: "Overhead Press",
                sets: [
                    WorkoutSet(id: "mock-set-4", workoutId: "mock-workout-1", exerciseId: "mock-exercise-4", setNumber: 1, targetReps: 10, targetWeight: 95, actualReps: nil, actualWeight: nil, status: .pending),
                    WorkoutSet(id: "mock-set-5", workoutId: "mock-workout-1", exerciseId: "mock-exercise-4", setNumber: 2, targetReps: 10, targetWeight: 95, actualReps: nil, actualWeight: nil, status: .pending),
                    WorkoutSet(id: "mock-set-6", workoutId: "mock-workout-1", exerciseId: "mock-exercise-4", setNumber: 3, targetReps: 10, targetWeight: 95, actualReps: nil, actualWeight: nil, status: .pending)
                ],
                totalSets: 3,
                completedSets: 0,
                restSeconds: 90,
                warmupSets: [
                    WarmupSet(warmupNumber: 1, targetReps: 10, targetWeight: 37.5),
                    WarmupSet(warmupNumber: 2, targetReps: 10, targetWeight: 57.5)
                ]
            )
        ],
        planDayName: "Push Day",
        sets: nil
    )
}
