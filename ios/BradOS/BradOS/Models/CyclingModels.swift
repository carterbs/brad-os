import Foundation

struct WeightGoalResponse: Codable, Sendable {
    let targetWeightLbs: Double
    let targetDate: String
    let startWeightLbs: Double
    let startDate: String
}

struct CyclingSyncResponse: Codable, Sendable {
    let imported: Int
    let skipped: Int
    let message: String
}
