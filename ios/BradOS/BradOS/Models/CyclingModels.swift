import Foundation

// MARK: - Cycling Activity Model

/// A cycling activity record synced from Strava/Peloton
struct CyclingActivityModel: Identifiable, Codable {
    let id: String
    let stravaId: Int
    let date: Date
    let durationMinutes: Int
    let avgPower: Int
    let normalizedPower: Int
    let maxPower: Int
    let avgHeartRate: Int
    let maxHeartRate: Int
    let tss: Int
    let intensityFactor: Double
    let type: CyclingWorkoutType

    enum CyclingWorkoutType: String, Codable {
        case vo2max
        case threshold
        case fun
        case recovery
        case unknown
    }
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
