import Foundation

// MARK: - Session Type Enum

/// Session type for training schedule
public enum SessionType: String, Codable, Sendable {
    case vo2max
    case threshold
    case endurance
    case tempo
    case fun
    case recovery
    case off

    public var displayName: String {
        switch self {
        case .vo2max: return "VO2max Intervals"
        case .threshold: return "Threshold"
        case .endurance: return "Endurance"
        case .tempo: return "Tempo"
        case .fun: return "Fun Ride"
        case .recovery: return "Recovery"
        case .off: return "Rest Day"
        }
    }

    public var systemImage: String {
        switch self {
        case .vo2max: return "flame.fill"
        case .threshold: return "bolt.fill"
        case .endurance: return "figure.outdoor.cycle"
        case .tempo: return "speedometer"
        case .fun: return "face.smiling.fill"
        case .recovery: return "heart.fill"
        case .off: return "moon.fill"
        }
    }
}

// MARK: - Cycling Activity Model

/// A cycling activity record synced from Strava/Peloton
public struct CyclingActivityModel: Identifiable, Codable, Sendable {
    public let id: String
    public let date: Date
    public let durationMinutes: Int
    public let normalizedPower: Double
    public let avgHeartRate: Double
    public let tss: Double
    public let type: CyclingWorkoutType
    public var ef: Double?
    public var peak5MinPower: Int?
    public var hrCompleteness: Int?

    public enum CyclingWorkoutType: String, Codable, Sendable {
        case vo2max
        case threshold
        case endurance
        case tempo
        case fun
        case recovery
        case unknown
    }

    public init(
        id: String,
        date: Date,
        durationMinutes: Int,
        normalizedPower: Double,
        avgHeartRate: Double,
        tss: Double,
        type: CyclingWorkoutType,
        ef: Double? = nil,
        peak5MinPower: Int? = nil,
        hrCompleteness: Int? = nil
    ) {
        self.id = id
        self.date = date
        self.durationMinutes = durationMinutes
        self.normalizedPower = normalizedPower
        self.avgHeartRate = avgHeartRate
        self.tss = tss
        self.type = type
        self.ef = ef
        self.peak5MinPower = peak5MinPower
        self.hrCompleteness = hrCompleteness
    }
}

// MARK: - Experience Level

public enum ExperienceLevel: String, Codable, CaseIterable, Sendable {
    case beginner
    case intermediate
    case advanced

    public var displayName: String {
        switch self {
        case .beginner: return "Beginner"
        case .intermediate: return "Intermediate"
        case .advanced: return "Advanced"
        }
    }

    public var description: String {
        switch self {
        case .beginner: return "New to structured cycling or returning after a long break"
        case .intermediate: return "Comfortable with intervals and zone training"
        case .advanced: return "Experienced with periodization and power-based training"
        }
    }

    public var systemImage: String {
        switch self {
        case .beginner: return "bicycle"
        case .intermediate: return "figure.outdoor.cycle"
        case .advanced: return "flame.fill"
        }
    }
}

// MARK: - Weekly Session Model

/// A single session in the weekly training schedule
public struct WeeklySessionModel: Codable, Identifiable, Sendable {
    public var id: Int { order }
    public let order: Int
    public let sessionType: String
    public let pelotonClassTypes: [String]
    public let suggestedDurationMinutes: Int
    public let description: String

    public var sessionTypeEnum: SessionType {
        SessionType(rawValue: sessionType) ?? .fun
    }

    public var systemImage: String {
        sessionTypeEnum.systemImage
    }

    public var displayName: String {
        sessionTypeEnum.displayName
    }

    public init(
        order: Int,
        sessionType: String,
        pelotonClassTypes: [String],
        suggestedDurationMinutes: Int,
        description: String
    ) {
        self.order = order
        self.sessionType = sessionType
        self.pelotonClassTypes = pelotonClassTypes
        self.suggestedDurationMinutes = suggestedDurationMinutes
        self.description = description
    }
}

// MARK: - Generate Schedule Request/Response

public struct GenerateScheduleRequest: Codable, Sendable {
    public let sessionsPerWeek: Int
    public let preferredDays: [Int]
    public let goals: [TrainingBlockModel.TrainingGoal]
    public let experienceLevel: ExperienceLevel
    public let weeklyHoursAvailable: Double
    public let ftp: Int?

    public init(
        sessionsPerWeek: Int,
        preferredDays: [Int],
        goals: [TrainingBlockModel.TrainingGoal],
        experienceLevel: ExperienceLevel,
        weeklyHoursAvailable: Double,
        ftp: Int?
    ) {
        self.sessionsPerWeek = sessionsPerWeek
        self.preferredDays = preferredDays
        self.goals = goals
        self.experienceLevel = experienceLevel
        self.weeklyHoursAvailable = weeklyHoursAvailable
        self.ftp = ftp
    }
}

public struct GenerateScheduleResponse: Codable, Sendable {
    public let sessions: [WeeklySessionModel]
    public let rationale: String

    public init(sessions: [WeeklySessionModel], rationale: String) {
        self.sessions = sessions
        self.rationale = rationale
    }
}

public struct WeeklyPlanSummary: Codable, Sendable {
    public init() {}
}

public struct PhaseSummary: Codable, Identifiable, Sendable {
    public var id: String { name }
    public let name: String

    public init(name: String) {
        self.name = name
    }
}

// MARK: - Training Block Model

/// An 8-week training block with goals and phases
public struct TrainingBlockModel: Identifiable, Codable, Sendable {
    public let id: String
    public let startDate: Date
    public let endDate: Date
    public let currentWeek: Int
    public let goals: [TrainingGoal]
    public let status: BlockStatus
    public let daysPerWeek: Int?
    public let weeklySessions: [WeeklySessionModel]?
    public let preferredDays: [Int]?
    public let experienceLevel: ExperienceLevel?
    public let weeklyHoursAvailable: Double?

    public enum TrainingGoal: String, Codable, CaseIterable, Sendable {
        case regainFitness = "regain_fitness"
        case maintainMuscle = "maintain_muscle"
        case loseWeight = "lose_weight"

        public var displayName: String {
            switch self {
            case .regainFitness: return "Regain Fitness"
            case .maintainMuscle: return "Maintain Muscle"
            case .loseWeight: return "Lose Weight"
            }
        }
    }

    public enum BlockStatus: String, Codable, Sendable {
        case active
        case completed
    }

    public init(
        id: String,
        startDate: Date,
        endDate: Date,
        currentWeek: Int,
        goals: [TrainingGoal],
        status: BlockStatus,
        daysPerWeek: Int?,
        weeklySessions: [WeeklySessionModel]?,
        preferredDays: [Int]?,
        experienceLevel: ExperienceLevel?,
        weeklyHoursAvailable: Double?
    ) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
        self.currentWeek = currentWeek
        self.goals = goals
        self.status = status
        self.daysPerWeek = daysPerWeek
        self.weeklySessions = weeklySessions
        self.preferredDays = preferredDays
        self.experienceLevel = experienceLevel
        self.weeklyHoursAvailable = weeklyHoursAvailable
    }
}

// MARK: - Training Load Model

/// Training load metrics (PMC model)
public struct TrainingLoadModel: Codable, Sendable {
    public let atl: Double  // Acute Training Load (7-day)
    public let ctl: Double  // Chronic Training Load (42-day)
    public let tsb: Double  // Training Stress Balance (Form)

    public init(atl: Double, ctl: Double, tsb: Double) {
        self.atl = atl
        self.ctl = ctl
        self.tsb = tsb
    }
}

// MARK: - VO2 Max Estimate Model

/// An estimated VO2 max entry
public struct VO2MaxEstimateModel: Identifiable, Codable, Sendable {
    public let id: String
    public let value: Double // mL/kg/min
    public let method: String // ftp_derived, peak_5min, peak_20min
    public var category: String? // poor, fair, good, excellent, elite

    public var fitnessCategory: String {
        category ?? categorizeVO2Max(value)
    }

    public init(id: String, value: Double, method: String, category: String? = nil) {
        self.id = id
        self.value = value
        self.method = method
        self.category = category
    }

    private func categorizeVO2Max(_ vo2max: Double) -> String {
        if vo2max >= 65 { return "elite" }
        if vo2max >= 55 { return "excellent" }
        if vo2max >= 45 { return "good" }
        if vo2max >= 35 { return "fair" }
        return "poor"
    }
}

// MARK: - Efficiency Factor Data Point

/// Data point for EF trend chart
public struct EFDataPoint: Identifiable, Codable, Sendable {
    public var id: String { activityId }
    public let activityId: String
    public let date: String
    public let ef: Double

    public init(activityId: String, date: String, ef: Double) {
        self.activityId = activityId
        self.date = date
        self.ef = ef
    }
}

// MARK: - Chart Data Models

/// Data point for TSS history chart
public struct TSSDataPoint: Identifiable, Sendable {
    public let id: String
    public let weekLabel: String
    public let tss: Int

    public init(weekLabel: String, tss: Int) {
        self.id = UUID().uuidString
        self.weekLabel = weekLabel
        self.tss = tss
    }
}

/// Data point for training load trend chart
public struct TrainingLoadDataPoint: Identifiable, Sendable {
    public let id: String
    public let date: Date
    public let ctl: Double
    public let atl: Double
    public let tsb: Double

    public init(date: Date, ctl: Double, atl: Double, tsb: Double) {
        self.id = UUID().uuidString
        self.date = date
        self.ctl = ctl
        self.atl = atl
        self.tsb = tsb
    }
}

// MARK: - API Response Models

/// Response from GET /cycling/vo2max
public struct VO2MaxResponse: Codable, Sendable {
    public let latest: VO2MaxEstimateModel?
    public let history: [VO2MaxEstimateModel]

    public init(latest: VO2MaxEstimateModel?, history: [VO2MaxEstimateModel]) {
        self.latest = latest
        self.history = history
    }
}

/// Response from GET /cycling/training-load
public struct CyclingTrainingLoadResponse: Codable, Sendable {
    public let atl: Double
    public let ctl: Double
    public let tsb: Double

    public init(atl: Double, ctl: Double, tsb: Double) {
        self.atl = atl
        self.ctl = ctl
        self.tsb = tsb
    }
}

/// Response from GET /cycling/ftp
public struct FTPEntryResponse: Codable, Sendable {
    public let id: String
    public let value: Int
    public let date: String
    public let source: String

    public init(id: String, value: Int, date: String, source: String) {
        self.id = id
        self.value = value
        self.date = date
        self.source = source
    }
}

/// Response from GET /cycling/block
public struct TrainingBlockResponse: Codable, Sendable {
    public let id: String
    public let startDate: String
    public let endDate: String
    public let currentWeek: Int
    public let goals: [String]
    public let status: String
    public let daysPerWeek: Int?
    public let weeklySessions: [WeeklySessionModel]?
    public let preferredDays: [Int]?
    public let experienceLevel: String?
    public let weeklyHoursAvailable: Double?

    public init(
        id: String,
        startDate: String,
        endDate: String,
        currentWeek: Int,
        goals: [String],
        status: String,
        daysPerWeek: Int?,
        weeklySessions: [WeeklySessionModel]?,
        preferredDays: [Int]?,
        experienceLevel: String?,
        weeklyHoursAvailable: Double?
    ) {
        self.id = id
        self.startDate = startDate
        self.endDate = endDate
        self.currentWeek = currentWeek
        self.goals = goals
        self.status = status
        self.daysPerWeek = daysPerWeek
        self.weeklySessions = weeklySessions
        self.preferredDays = preferredDays
        self.experienceLevel = experienceLevel
        self.weeklyHoursAvailable = weeklyHoursAvailable
    }
}

/// Response from POST /cycling/weight-goal
public struct WeightGoalResponse: Codable, Sendable {
    public let targetWeightLbs: Double
    public let targetDate: String
    public let startWeightLbs: Double
    public let startDate: String

    public init(targetWeightLbs: Double, targetDate: String, startWeightLbs: Double, startDate: String) {
        self.targetWeightLbs = targetWeightLbs
        self.targetDate = targetDate
        self.startWeightLbs = startWeightLbs
        self.startDate = startDate
    }
}

/// Response from POST /cycling/sync
public struct CyclingSyncResponse: Codable, Sendable {
    public let imported: Int
    public let skipped: Int
    public let message: String

    public init(imported: Int, skipped: Int, message: String) {
        self.imported = imported
        self.skipped = skipped
        self.message = message
    }
}
