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
    case fun
    case recovery
    case off

    var displayName: String {
        switch self {
        case .vo2max: return "VO2max Intervals"
        case .threshold: return "Threshold"
        case .fun: return "Fun Ride"
        case .recovery: return "Recovery"
        case .off: return "Rest Day"
        }
    }

    var systemImage: String {
        switch self {
        case .vo2max: return "flame.fill"
        case .threshold: return "bolt.fill"
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
            )
        )

        do {
            let response: CyclingCoachRecommendation = try await post(
                "/cycling-coach/recommend",
                body: requestBody
            )
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

    // MARK: - Private Methods

    /// Perform POST request with body and decode response
    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        // Get base URL from API configuration
        let baseURL = APIConfiguration.default.baseURL
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(body)

        // Perform request through a custom session (matching APIClient's setup)
        let config = URLSessionConfiguration.default
        config.connectionProxyDictionary = [:]
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: config)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.network(NSError(domain: "CyclingCoachClient", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid response type"
            ]))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to decode error response
            let decoder = JSONDecoder()
            if let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data) {
                throw APIError(
                    code: APIErrorCode(rawValue: errorResponse.error.code) ?? .unknown,
                    message: errorResponse.error.message,
                    statusCode: httpResponse.statusCode
                )
            }
            throw APIError.unknown("Request failed with status \(httpResponse.statusCode)", statusCode: httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)
        return apiResponse.data
    }
}

