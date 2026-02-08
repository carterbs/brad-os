import Foundation
import BradOSCore

// MARK: - Sync Response

/// Response from the health sync endpoint
private struct SyncResponse: Decodable {
    let synced: Bool
    let recoveryDate: String
    let baselineUpdated: Bool
    let weightAdded: Bool
}

// MARK: - HealthKitSyncService

/// Service for syncing HealthKit data to Firebase
@MainActor
class HealthKitSyncService: ObservableObject {

    // MARK: - Published Properties

    @Published var lastSyncDate: Date?
    @Published var isSyncing = false
    @Published var lastError: String?

    // MARK: - Private Properties

    private let healthKitManager: HealthKitManager
    private let minimumSyncInterval: TimeInterval = 3600 // 1 hour

    /// UserDefaults key for persisting last sync date
    private let lastSyncKey = "healthkit_last_sync_date"

    // MARK: - Initialization

    init(healthKitManager: HealthKitManager) {
        self.healthKitManager = healthKitManager
        // Load persisted last sync date
        if let storedDate = UserDefaults.standard.object(forKey: lastSyncKey) as? Date {
            lastSyncDate = storedDate
        }
    }

    // MARK: - Public Properties

    /// Whether a sync is needed (no recent sync or data is stale)
    var needsSync: Bool {
        guard let lastSync = lastSyncDate else { return true }
        return Date().timeIntervalSince(lastSync) > minimumSyncInterval
    }

    // MARK: - Public Methods

    /// Sync if needed (called on app foreground)
    func syncIfNeeded() async {
        guard needsSync else {
            print("[HealthKitSyncService] Skipping sync - last sync was \(lastSyncDate?.description ?? "never")")
            return
        }
        await sync()
    }

    /// Force a sync regardless of timing
    func sync() async {
        guard !isSyncing else {
            print("[HealthKitSyncService] Already syncing, skipping")
            return
        }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        do {
            // Ensure we have authorization
            guard healthKitManager.isAuthorized else {
                print("[HealthKitSyncService] HealthKit not authorized")
                lastError = "HealthKit not authorized"
                return
            }

            // Calculate recovery score (this fetches all needed data)
            let recovery = try await healthKitManager.calculateRecoveryScore()

            // Get baseline if available
            let baseline = await healthKitManager.getCachedBaseline()

            // Get latest weight
            let weight = try? await healthKitManager.fetchLatestWeight()

            // Build and send sync request
            try await sendSyncRequest(recovery: recovery, baseline: baseline, weight: weight)

            // Update last sync date
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: lastSyncKey)

            print("[HealthKitSyncService] Sync completed successfully")
        } catch {
            print("[HealthKitSyncService] Sync failed: \(error)")
            lastError = error.localizedDescription
        }
    }

    // MARK: - Private Methods

    private func sendSyncRequest(
        recovery: RecoveryData,
        baseline: RecoveryBaseline?,
        weight: Double?
    ) async throws {
        let baseURL = APIConfiguration.default.baseURL
        var request = URLRequest(url: baseURL.appendingPathComponent("/health-sync/sync"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Build request body
        var body: [String: Any] = [
            "recovery": recovery.toAPIFormat()
        ]

        if let baseline = baseline {
            body["baseline"] = [
                "hrvMedian": baseline.hrvMedian,
                "hrvStdDev": baseline.hrvStdDev,
                "rhrMedian": baseline.rhrMedian,
                "sampleCount": 60 // Approximate - we use 60-day baseline
            ]
        }

        if let weight = weight {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            body["weight"] = [
                "weightLbs": weight,
                "date": formatter.string(from: Date())
            ]
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // Create session matching APIClient's setup
        let config = URLSessionConfiguration.default
        config.connectionProxyDictionary = [:]
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: config)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to parse error message
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                throw SyncError.apiError(errorResponse.error.message)
            }
            throw SyncError.httpError(httpResponse.statusCode)
        }

        // Parse response to verify success
        let apiResponse = try JSONDecoder().decode(APIResponse<SyncResponse>.self, from: data)
        guard apiResponse.data.synced else {
            throw SyncError.syncFailed
        }
    }
}

// MARK: - Sync Errors

private enum SyncError: LocalizedError {
    case invalidResponse
    case httpError(Int)
    case apiError(String)
    case syncFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .apiError(let message):
            return message
        case .syncFailed:
            return "Sync failed"
        }
    }
}

// MARK: - RecoveryData Extension

private extension RecoveryData {
    /// Convert to API format for sync request
    func toAPIFormat() -> [String: Any] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        return [
            "date": formatter.string(from: date),
            "hrvMs": hrvMs,
            "hrvVsBaseline": hrvVsBaseline,
            "rhrBpm": rhrBpm,
            "rhrVsBaseline": rhrVsBaseline,
            "sleepHours": sleepHours,
            "sleepEfficiency": sleepEfficiency,
            "deepSleepPercent": deepSleepPercent,
            "score": score,
            "state": state.rawValue,
            "source": "healthkit"
        ]
    }
}
