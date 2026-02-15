import Foundation

// MARK: - Cycling Activity Model

/// A cycling activity record synced from Strava/Peloton
struct CyclingActivityModel: Identifiable, Codable {
    let id: String
    let stravaId: Int
    let date: Date
    let durationMinutes: Int
    let avgPower: Double
    let normalizedPower: Double
    let maxPower: Double
    let avgHeartRate: Double
    let maxHeartRate: Double
    let tss: Double
    let intensityFactor: Double
    let type: CyclingWorkoutType
    var ef: Double?
    var peak5MinPower: Int?
    var peak20MinPower: Int?
    var hrCompleteness: Int?

    enum CyclingWorkoutType: String, Codable {
        case vo2max
        case threshold
        case endurance
        case tempo
        case fun
        case recovery
        case unknown
    }
}

// MARK: - Experience Level

enum ExperienceLevel: String, Codable, CaseIterable {
    case beginner
    case intermediate
    case advanced

    var displayName: String {
        switch self {
        case .beginner: return "Beginner"
        case .intermediate: return "Intermediate"
        case .advanced: return "Advanced"
        }
    }

    var description: String {
        switch self {
        case .beginner: return "New to structured cycling or returning after a long break"
        case .intermediate: return "Comfortable with intervals and zone training"
        case .advanced: return "Experienced with periodization and power-based training"
        }
    }

    var systemImage: String {
        switch self {
        case .beginner: return "bicycle"
        case .intermediate: return "figure.outdoor.cycle"
        case .advanced: return "flame.fill"
        }
    }
}

// MARK: - Weekly Session Model

/// A single session in the weekly training schedule
struct WeeklySessionModel: Codable, Identifiable {
    var id: Int { order }
    let order: Int
    let sessionType: String
    let pelotonClassTypes: [String]
    let suggestedDurationMinutes: Int
    let description: String
    let preferredDay: Int?

    var sessionTypeEnum: SessionType {
        SessionType(rawValue: sessionType) ?? .fun
    }

    var systemImage: String {
        sessionTypeEnum.systemImage
    }

    var displayName: String {
        sessionTypeEnum.displayName
    }
}

// MARK: - Generate Schedule Request/Response

struct GenerateScheduleRequest: Codable {
    let sessionsPerWeek: Int
    let preferredDays: [Int]
    let goals: [TrainingBlockModel.TrainingGoal]
    let experienceLevel: ExperienceLevel
    let weeklyHoursAvailable: Double
    let ftp: Int?
}

struct GenerateScheduleResponse: Codable {
    let sessions: [WeeklySessionModel]
    let weeklyPlan: WeeklyPlanSummary
    let rationale: String
}

struct WeeklyPlanSummary: Codable {
    let totalEstimatedHours: Double
    let phases: [PhaseSummary]
}

struct PhaseSummary: Codable, Identifiable {
    var id: String { name }
    let name: String
    let weeks: String
    let description: String
}

// MARK: - Training Block Model

/// An 8-week training block with goals and phases
struct TrainingBlockModel: Identifiable, Codable {
    let id: String
    let startDate: Date
    let endDate: Date
    let currentWeek: Int
    let goals: [TrainingGoal]
    let status: BlockStatus
    let daysPerWeek: Int?
    let weeklySessions: [WeeklySessionModel]?
    let preferredDays: [Int]?
    let experienceLevel: ExperienceLevel?
    let weeklyHoursAvailable: Double?

    enum TrainingGoal: String, Codable, CaseIterable {
        case regainFitness = "regain_fitness"
        case maintainMuscle = "maintain_muscle"
        case loseWeight = "lose_weight"
    }

    enum BlockStatus: String, Codable {
        case active
        case completed
    }
}

// MARK: - Training Load Model

/// Training load metrics (PMC model)
struct TrainingLoadModel: Codable {
    let atl: Double  // Acute Training Load (7-day)
    let ctl: Double  // Chronic Training Load (42-day)
    let tsb: Double  // Training Stress Balance (Form)
}

// MARK: - VO2 Max Estimate Model

/// An estimated VO2 max entry
struct VO2MaxEstimateModel: Identifiable, Codable {
    let id: String
    let date: String
    let value: Double // mL/kg/min
    let method: String // ftp_derived, peak_5min, peak_20min
    let sourcePower: Double
    let sourceWeight: Double
    var category: String? // poor, fair, good, excellent, elite

    var fitnessCategory: String {
        category ?? categorizeVO2Max(value)
    }

    private func categorizeVO2Max(_ vo2max: Double) -> String {
        if vo2max >= 65 { return "elite" }
        if vo2max >= 55 { return "excellent" }
        if vo2max >= 45 { return "good" }
        if vo2max >= 35 { return "fair" }
        return "poor"
    }

    var fitnessCategoryColor: String {
        switch fitnessCategory {
        case "elite": return "purple"
        case "excellent": return "blue"
        case "good": return "green"
        case "fair": return "yellow"
        default: return "red"
        }
    }
}

// MARK: - Efficiency Factor Data Point

/// Data point for EF trend chart
struct EFDataPoint: Identifiable, Codable {
    var id: String { activityId }
    let activityId: String
    let date: String
    let ef: Double
    let normalizedPower: Double
    let avgHeartRate: Double
}

// MARK: - API Response Models

/// Response from GET /cycling/vo2max
struct VO2MaxResponse: Codable {
    let latest: VO2MaxEstimateModel?
    let history: [VO2MaxEstimateModel]
}

/// Response from GET /cycling/training-load
struct CyclingTrainingLoadResponse: Codable {
    let atl: Double
    let ctl: Double
    let tsb: Double
}

/// Response from GET /cycling/ftp
struct FTPEntryResponse: Codable {
    let id: String
    let value: Int
    let date: String
    let source: String
}

/// Response from GET /cycling/block
struct TrainingBlockResponse: Codable {
    let id: String
    let startDate: String
    let endDate: String
    let currentWeek: Int
    let goals: [String]
    let status: String
    let daysPerWeek: Int?
    let weeklySessions: [WeeklySessionModel]?
    let preferredDays: [Int]?
    let experienceLevel: String?
    let weeklyHoursAvailable: Double?
}

/// Response from POST /cycling/weight-goal
struct WeightGoalResponse: Codable {
    let targetWeightLbs: Double
    let targetDate: String
    let startWeightLbs: Double
    let startDate: String
}

/// Response from POST /cycling/sync
struct CyclingSyncResponse: Codable {
    let total: Int
    let imported: Int
    let skipped: Int
    let message: String
}
