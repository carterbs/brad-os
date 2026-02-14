import Foundation
import BradOSCore

// MARK: - Cycling Coach Response Models

/// AI coach recommendation for a cycling session
struct CyclingCoachRecommendation: Codable, Equatable {
    let session: SessionRecommendation
    let reasoning: String
    let coachingTips: [String]?
    let warnings: [CoachWarning]?
    let suggestFTPTest: Bool?

    /// Recommended cycling session
    struct SessionRecommendation: Codable, Equatable {
        let type: String
        let durationMinutes: Int
        let intervals: IntervalProtocol?
        let targetTSS: TSSRange
        let targetZones: String
        let pelotonClassTypes: [String]?
        let pelotonTip: String?

        /// Session type as an enum for easier use
        var sessionType: SessionType {
            SessionType(rawValue: type) ?? .fun
        }
    }

    /// Interval workout definition
    struct IntervalProtocol: Codable, Equatable {
        let protocolName: String
        let count: Int
        let workSeconds: Int
        let restSeconds: Int
        let targetPowerPercent: PowerRange

        enum CodingKeys: String, CodingKey {
            case protocolName = "protocol"
            case count, workSeconds, restSeconds, targetPowerPercent
        }
    }

    /// TSS range for session target
    struct TSSRange: Codable, Equatable {
        let min: Int
        let max: Int
    }

    /// Power range as % of FTP
    struct PowerRange: Codable, Equatable {
        let min: Int
        let max: Int
    }

    /// Warning from the coach
    struct CoachWarning: Codable, Equatable {
        let type: String
        let message: String
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
    let timezoneOffsetMinutes: Int

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

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Public Methods

    /// Get a training recommendation from the AI coach
    func getRecommendation(recovery: RecoveryData) async throws -> CyclingCoachRecommendation {
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
            ),
            timezoneOffsetMinutes: TimeZone.current.secondsFromGMT() / 60
        )

        do {
            let response = try await apiClient.getCoachRecommendation(requestBody)
            recommendation = response
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

    /// Refresh recommendation using latest recovery data
    func refresh(healthKit: HealthKitManager) async {
        guard let recovery = healthKit.latestRecovery else {
            error = "No recovery data available"
            return
        }

        do {
            _ = try await getRecommendation(recovery: recovery)
        } catch {
            // Error already set in getRecommendation
        }
    }

}

