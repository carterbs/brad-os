import Foundation
import BradOSCore

// MARK: - Cycling Coach Response Models

/// AI coach recommendation for a cycling session
struct CyclingCoachRecommendation: Codable, Equatable {
    let session: SessionRecommendation
    let reasoning: String
    let coachingTips: [String]?
    let warnings: [CoachWarning]?
    let suggestFTPTest: Bool

    /// Recommended cycling session
    struct SessionRecommendation: Codable, Equatable {
        let type: String
        let durationMinutes: Int
        let targetTSS: TSSRange
        let targetZones: String
        let pelotonClassTypes: [String]?
        let pelotonTip: String?

        /// Session type as an enum for easier use
        var sessionType: SessionType {
            SessionType(rawValue: type) ?? .fun
        }
    }

    /// TSS range for session target
    struct TSSRange: Codable, Equatable {
        let min: Int
        let max: Int
    }

    /// Warning from the coach
    struct CoachWarning: Codable, Equatable {
        let type: String
        let message: String
    }
}

extension CyclingCoachRecommendation {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        session = try container.decode(SessionRecommendation.self, forKey: .session)
        reasoning = try container.decode(String.self, forKey: .reasoning)
        coachingTips = try container.decodeIfPresent([String].self, forKey: .coachingTips)
        warnings = try container.decodeIfPresent([CoachWarning].self, forKey: .warnings)
        suggestFTPTest = try container.decodeIfPresent(Bool.self, forKey: .suggestFTPTest) ?? false
    }
}

/// Session type enum
enum SessionType: String, Codable {
    case vo2max
    case threshold
    case endurance
    case tempo
    case fun
    case recovery
    case off

    var displayName: String {
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

    var systemImage: String {
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

// MARK: - Request Body

/// Request body for cycling coach recommendation
struct CyclingCoachRequestBody: Encodable {
    let recovery: RecoverySnapshot

    /// Simplified recovery snapshot for API request
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

// MARK: - Cycling Coach Client

/// Client for interacting with the AI cycling coach API
@MainActor
class CyclingCoachClient: ObservableObject {
    // MARK: - Published Properties

    @Published var recommendation: CyclingCoachRecommendation?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Private Properties

    private let apiClient: APIClient
    private var cacheTimestamp: Date?
    private let cacheTTL: TimeInterval = 1800 // 30 min

    /// Whether the cached recommendation is still fresh
    var hasFreshCache: Bool {
        guard recommendation != nil, let timestamp = cacheTimestamp else { return false }
        return Date().timeIntervalSince(timestamp) < cacheTTL
    }

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Public Methods

    /// Get a training recommendation from the AI coach (returns cached if fresh)
    func getRecommendation(recovery: RecoveryData) async throws -> CyclingCoachRecommendation {
        // Return cached recommendation if still fresh
        if hasFreshCache, let cached = recommendation {
            DebugLogger.info("Returning cached recommendation (\(Int(Date().timeIntervalSince(cacheTimestamp ?? Date())))s old)", attributes: ["source": "CyclingCoachClient"])
            return cached
        }

        isLoading = true
        error = nil
        defer { isLoading = false }

        // Convert RecoveryData to API format
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
            let response = try await apiClient.getCoachRecommendation(requestBody)
            recommendation = response
            cacheTimestamp = Date()
            return response
        } catch let apiError as APIError {
            error = apiError.localizedDescription
            throw apiError
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    /// Generate a weekly schedule from the AI coach
    func generateSchedule(request: GenerateScheduleRequest) async throws -> GenerateScheduleResponse {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let response = try await apiClient.generateSchedule(request)
            return response
        } catch let apiError as APIError {
            error = apiError.localizedDescription
            throw apiError
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }
}
