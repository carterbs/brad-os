import Foundation
import BradOSCore

/// Protocol for dedicated body-weight API operations.
protocol BodyWeightAPIClientProtocol {
    func getLatestWeight() async throws -> WeightHistoryEntry?
    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry]
    func logWeightEntry(weightLbs: Double, date: String, source: String) async throws -> WeightHistoryEntry
}

// APIClient already has all these methods, so conformance is automatic
extension APIClient: BodyWeightAPIClientProtocol {}
