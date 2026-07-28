import Foundation
import BradOSCore

struct TodayCoachRequestBody: Encodable {
    let recovery: RecoverySnapshot

    struct RecoverySnapshot: Encodable {
        let date: String
        let hrvMs: Double
        let hrvVsBaseline: Double
        let rhrBpm: Double
        let rhrVsBaseline: Double
        let sleepHours: Double
        let sleepEfficiency: Double
        let deepSleepPercent: Double
        let score: Int
        let state: String
    }
}

// MARK: - Today Coach Client

/// Client for interacting with the Today Coach AI API
@MainActor
class TodayCoachClient: ObservableObject {
    // MARK: - Published Properties

    @Published var recommendation: TodayCoachRecommendation?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Private Properties

    private let apiClient: any TodayCoachAPIClientProtocol
    private var cacheTimestamp: Date?
    private let cacheTTL: TimeInterval = 1800 // 30 min

    /// Whether the cached recommendation is still fresh
    var hasFreshCache: Bool {
        guard recommendation != nil, let timestamp = cacheTimestamp else { return false }
        return Date().timeIntervalSince(timestamp) < cacheTTL
    }

    // MARK: - Initialization

    init(apiClient: any TodayCoachAPIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Public Methods

    /// Get a daily briefing from the Today Coach (returns cached if fresh)
    func getRecommendation(recovery: RecoveryData) async {
        // Return cached recommendation if still fresh
        if hasFreshCache {
            DebugLogger.info("Returning cached recommendation (\(Int(Date().timeIntervalSince(cacheTimestamp ?? Date())))s old)", attributes: ["source": "TodayCoachClient"])
            return
        }

        isLoading = true
        error = nil
        defer { isLoading = false }

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        dateFormatter.timeZone = TimeZone(identifier: "UTC")

        let requestBody = TodayCoachRequestBody(
            recovery: TodayCoachRequestBody.RecoverySnapshot(
                date: dateFormatter.string(from: recovery.date),
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
            cacheTimestamp = Date()
        } catch let apiError as APIError {
            error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
}
