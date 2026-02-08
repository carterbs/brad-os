import Foundation

// MARK: - Strava Activity Model

/// Represents a cycling activity from Strava.
struct StravaActivity: Codable, Identifiable, Equatable {
    let id: Int
    let type: String
    let movingTime: Int
    let elapsedTime: Int
    let averageHeartrate: Double?
    let maxHeartrate: Double?
    let averageWatts: Double?
    let weightedAverageWatts: Double?
    let maxWatts: Int?
    let deviceWatts: Bool?
    let kilojoules: Double?
    let startDate: String
    let name: String?
    let distance: Double?

    enum CodingKeys: String, CodingKey {
        case id, type, name, distance, kilojoules
        case movingTime = "moving_time"
        case elapsedTime = "elapsed_time"
        case averageHeartrate = "average_heartrate"
        case maxHeartrate = "max_heartrate"
        case averageWatts = "average_watts"
        case weightedAverageWatts = "weighted_average_watts"
        case maxWatts = "max_watts"
        case deviceWatts = "device_watts"
        case startDate = "start_date"
    }

    /// Duration in minutes
    var durationMinutes: Int {
        movingTime / 60
    }

    /// Normalized power (weighted average watts if available, otherwise average)
    var normalizedPower: Double {
        weightedAverageWatts ?? averageWatts ?? 0
    }

    /// Check if this is a cycling activity
    var isCycling: Bool {
        type == "VirtualRide" || type == "Ride"
    }

    /// Format the start date for display
    var formattedDate: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Try with fractional seconds first
        if let date = formatter.date(from: startDate) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }

        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: startDate) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }

        return startDate
    }
}

// MARK: - Strava Client Errors

enum StravaClientError: Error, LocalizedError {
    case notAuthenticated
    case tokenRefreshFailed(String)
    case networkError(Error)
    case apiError(Int, String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated with Strava. Please connect your account."
        case .tokenRefreshFailed(let message):
            return "Failed to refresh Strava token: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .apiError(let status, let message):
            return "Strava API error (\(status)): \(message)"
        case .decodingError(let error):
            return "Failed to parse Strava response: \(error.localizedDescription)"
        }
    }
}

// MARK: - Strava Client

/// Client for fetching cycling activities from the Strava API.
@MainActor
final class StravaClient: ObservableObject {
    // MARK: - Published Properties

    @Published var activities: [StravaActivity] = []
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Private Properties

    private let stravaAuthManager: StravaAuthManager
    private let baseURL = "https://www.strava.com/api/v3"

    // MARK: - Initialization

    init(stravaAuthManager: StravaAuthManager) {
        self.stravaAuthManager = stravaAuthManager
    }

    // MARK: - Public Methods

    /// Fetch recent cycling activities from Strava.
    /// - Parameters:
    ///   - page: Page number (1-indexed)
    ///   - perPage: Number of activities per page (max 200)
    /// - Returns: Array of cycling activities
    func fetchRecentActivities(page: Int = 1, perPage: Int = 30) async throws -> [StravaActivity] {
        let tokens = try await stravaAuthManager.refreshTokensIfNeeded()

        var components = URLComponents(string: "\(baseURL)/athlete/activities")!
        components.queryItems = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "per_page", value: "\(min(perPage, 200))")
        ]

        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw StravaClientError.networkError(
                    NSError(domain: "StravaClient", code: -1, userInfo: [
                        NSLocalizedDescriptionKey: "Invalid response"
                    ])
                )
            }

            if httpResponse.statusCode != 200 {
                let message = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw StravaClientError.apiError(httpResponse.statusCode, message)
            }

            let allActivities = try JSONDecoder().decode([StravaActivity].self, from: data)

            // Filter to only cycling activities
            return allActivities.filter { $0.isCycling }
        } catch let error as StravaClientError {
            throw error
        } catch let error as DecodingError {
            throw StravaClientError.decodingError(error)
        } catch {
            throw StravaClientError.networkError(error)
        }
    }

    /// Fetch a single activity by ID.
    /// - Parameter id: Strava activity ID
    /// - Returns: The activity
    func fetchActivity(id: Int) async throws -> StravaActivity {
        let tokens = try await stravaAuthManager.refreshTokensIfNeeded()

        var request = URLRequest(url: URL(string: "\(baseURL)/activities/\(id)")!)
        request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw StravaClientError.networkError(
                    NSError(domain: "StravaClient", code: -1, userInfo: [
                        NSLocalizedDescriptionKey: "Invalid response"
                    ])
                )
            }

            if httpResponse.statusCode != 200 {
                let message = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw StravaClientError.apiError(httpResponse.statusCode, message)
            }

            return try JSONDecoder().decode(StravaActivity.self, from: data)
        } catch let error as StravaClientError {
            throw error
        } catch let error as DecodingError {
            throw StravaClientError.decodingError(error)
        } catch {
            throw StravaClientError.networkError(error)
        }
    }

    /// Load activities and update the published activities array.
    func loadActivities() async {
        guard stravaAuthManager.isConnected else {
            error = "Not connected to Strava"
            return
        }

        isLoading = true
        error = nil

        do {
            let fetchedActivities = try await fetchRecentActivities()
            activities = fetchedActivities
            print("[StravaClient] Loaded \(fetchedActivities.count) cycling activities")
        } catch {
            self.error = error.localizedDescription
            print("[StravaClient] Error loading activities: \(error)")
        }

        isLoading = false
    }

    /// Sync activities to the backend.
    /// This fetches activities from Strava and posts them to our API.
    /// - Parameter apiClient: The API client to use for backend requests
    func syncActivitiesToBackend<T: CyclingAPIClient>(apiClient: T) async throws where T.Response == APIResponse<CyclingActivityResponse> {
        guard stravaAuthManager.isConnected else {
            throw StravaClientError.notAuthenticated
        }

        isLoading = true
        defer { isLoading = false }

        let stravaActivities = try await fetchRecentActivities()

        // Post each activity to the backend
        // The backend will calculate TSS and store the activity
        for activity in stravaActivities {
            do {
                let body = CyclingActivityRequest(
                    stravaId: activity.id,
                    date: activity.startDate,
                    durationMinutes: activity.durationMinutes,
                    avgPower: activity.averageWatts ?? 0,
                    normalizedPower: activity.normalizedPower,
                    maxPower: activity.maxWatts ?? 0,
                    avgHeartRate: activity.averageHeartrate ?? 0,
                    maxHeartRate: activity.maxHeartrate ?? 0,
                    source: "strava"
                )

                let _ = try await apiClient.post(path: "cycling/activities", body: body)
                print("[StravaClient] Synced activity \(activity.id) to backend")
            } catch {
                // Log but continue with other activities
                print("[StravaClient] Failed to sync activity \(activity.id): \(error)")
            }
        }
    }
}

// MARK: - API Request/Response Models

/// Request body for creating a cycling activity.
struct CyclingActivityRequest: Encodable {
    let stravaId: Int
    let date: String
    let durationMinutes: Int
    let avgPower: Double
    let normalizedPower: Double
    let maxPower: Int
    let avgHeartRate: Double
    let maxHeartRate: Double
    let source: String
}

/// Response from the cycling activities API.
struct CyclingActivityResponse: Decodable {
    let id: String
    let stravaId: Int
    let userId: String
    let date: String
    let durationMinutes: Int
    let avgPower: Double
    let normalizedPower: Double
    let maxPower: Int
    let avgHeartRate: Double
    let maxHeartRate: Double
    let tss: Int
    let intensityFactor: Double
    let type: String
    let source: String
    let createdAt: String
}

// MARK: - Cycling API Client Protocol

/// Protocol for API clients that can sync cycling activities.
/// This allows for dependency injection in tests.
protocol CyclingAPIClient {
    associatedtype Response: Decodable

    func post<T: Encodable>(path: String, body: T) async throws -> Response
}
