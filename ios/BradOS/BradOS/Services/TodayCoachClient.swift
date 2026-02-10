import Foundation
import BradOSCore

// MARK: - Today Coach Client

/// Client for interacting with the Today Coach AI API
@MainActor
class TodayCoachClient: ObservableObject {
    // MARK: - Published Properties

    @Published var recommendation: TodayCoachRecommendation?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Private Properties

    private let apiClient: APIClient

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Public Methods

    /// Get a daily briefing from the Today Coach
    func getRecommendation(recovery: RecoveryData) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let requestBody = CyclingCoachRequestBody(
            recovery: CyclingCoachRequestBody.RecoverySnapshot(
                date: formatter.string(from: recovery.date),
                hrvMs: recovery.hrvMs,
                hrvVsBaseline: recovery.hrvVsBaseline,
                rhrBpm: recovery.rhrBpm,
                rhrVsBaseline: recovery.rhrVsBaseline,
                sleepHours: recovery.sleepHours,
                sleepEfficiency: recovery.sleepEfficiency,
                deepSleepPercent: recovery.deepSleepPercent,
                score: recovery.score,
                state: recovery.state.rawValue
            )
        )

        do {
            let response = try await apiClient.getTodayCoachRecommendation(requestBody)
            recommendation = response
        } catch let apiError as APIError {
            error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Refresh recommendation using latest recovery data from Firebase
    func refresh() async {
        do {
            guard let snapshot = try await apiClient.getLatestRecovery(),
                  let recovery = snapshot.toRecoveryData() else {
                error = "No recovery data available"
                return
            }
            await getRecommendation(recovery: recovery)
        } catch {
            if self.error == nil {
                self.error = error.localizedDescription
            }
        }
    }
}
