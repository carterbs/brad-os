import Foundation
import BradOSCore

/// Protocol for weight goal-related cycling API operations.
protocol WeightGoalAPIClientProtocol {
    func getLatestWeight() async throws -> WeightHistoryEntry?
    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry]
    func getWeightGoal() async throws -> WeightGoalResponse?
    func saveWeightGoal(targetWeightLbs: Double, targetDate: String, startWeightLbs: Double, startDate: String) async throws -> WeightGoalResponse
}

// APIClient already has all these methods, so conformance is automatic
extension APIClient: WeightGoalAPIClientProtocol {}
