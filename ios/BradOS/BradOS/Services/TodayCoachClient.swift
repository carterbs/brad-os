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
    private struct CachedRecommendation: Codable {
        let recommendation: TodayCoachRecommendation
        let requestDate: String
        let cachedAt: Date
    }

    private enum CacheKey {
        static let recommendation = "todayCoach.cachedRecommendation"
    }

    // MARK: - Published Properties

    @Published var recommendation: TodayCoachRecommendation?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Private Properties

    private let apiClient: any TodayCoachAPIClientProtocol
    private let userDefaults: UserDefaultsProtocol
    private let now: () -> Date
    private var cacheTimestamp: Date?
    private var cachedRequestDate: String?
    private let cacheTTL: TimeInterval = 3600 // 1 hour

    /// Whether the cached recommendation is still fresh
    var hasFreshCache: Bool {
        guard recommendation != nil,
              let timestamp = cacheTimestamp,
              cachedRequestDate == formattedDate(now()) else { return false }
        return now().timeIntervalSince(timestamp) < cacheTTL
    }

    // MARK: - Initialization

    init(
        apiClient: any TodayCoachAPIClientProtocol = APIClient.shared,
        userDefaults: UserDefaultsProtocol = UserDefaults.standard,
        now: @escaping () -> Date = Date.init
    ) {
        self.apiClient = apiClient
        self.userDefaults = userDefaults
        self.now = now
        restoreCachedRecommendation()
    }

    // MARK: - Public Methods

    /// Get a daily briefing from the Today Coach (returns cached if fresh)
    func getRecommendation(recovery: RecoveryData) async {
        let requestDate = formattedDate(recovery.date)

        // Return cached recommendation if still fresh
        if hasFreshCache {
            DebugLogger.info("Returning cached recommendation (\(Int(now().timeIntervalSince(cacheTimestamp ?? now())))s old)", attributes: ["source": "TodayCoachClient"])
            return
        }

        isLoading = true
        error = nil
        defer { isLoading = false }

        let requestBody = TodayCoachRequestBody(
            recovery: TodayCoachRequestBody.RecoverySnapshot(
                date: requestDate,
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
            cacheTimestamp = now()
            cachedRequestDate = formattedDate(now())
            persistCachedRecommendation(response)
        } catch let apiError as APIError {
            error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func restoreCachedRecommendation() {
        guard let data = userDefaults.data(forKey: CacheKey.recommendation),
              let cached = try? JSONDecoder().decode(CachedRecommendation.self, from: data),
              now().timeIntervalSince(cached.cachedAt) < cacheTTL else {
            userDefaults.removeObject(forKey: CacheKey.recommendation)
            return
        }

        recommendation = cached.recommendation
        cacheTimestamp = cached.cachedAt
        cachedRequestDate = cached.requestDate
    }

    private func persistCachedRecommendation(_ recommendation: TodayCoachRecommendation) {
        let cached = CachedRecommendation(
            recommendation: recommendation,
            requestDate: formattedDate(now()),
            cachedAt: cacheTimestamp ?? now()
        )
        guard let data = try? JSONEncoder().encode(cached) else { return }
        userDefaults.set(data, forKey: CacheKey.recommendation)
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }
}
