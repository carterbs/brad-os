import Foundation
import BradOSCore

/// Protocol for Today Coach API operations.
/// Provides a testable seam for injecting mock clients in tests.
protocol TodayCoachAPIClientProtocol {
    func getTodayCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> TodayCoachRecommendation
}

// APIClient already has this method, so conformance is automatic
extension APIClient: TodayCoachAPIClientProtocol {}
