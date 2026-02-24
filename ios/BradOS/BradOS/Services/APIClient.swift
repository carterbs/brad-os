import Foundation
import BradOSCore
import FirebaseAppCheck

/// Empty body for POST/PUT requests that don't need a body
struct EmptyBody: Encodable {}

/// Cache TTL presets for API responses
enum CacheTTL {
    /// 5 minutes — frequently changing data (today's workout, latest sessions)
    static let short: TimeInterval = 300
    /// 15 minutes — moderate change rate (cycling data, recovery, calendar)
    static let medium: TimeInterval = 900
    /// 30 minutes — slow changing data (FTP, training block, health history)
    static let long: TimeInterval = 1800
}

/// In-memory response cache with per-key TTL
final class ResponseCache: @unchecked Sendable {
    struct Entry {
        let data: Data
        let timestamp: Date
        let ttl: TimeInterval
        var isValid: Bool { Date().timeIntervalSince(timestamp) < ttl }
    }

    private var cache: [String: Entry] = [:]
    private let lock = NSLock()

    func get(_ key: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        guard let entry = cache[key], entry.isValid else {
            cache.removeValue(forKey: key)
            return nil
        }
        return entry.data
    }

    func set(_ key: String, data: Data, ttl: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        cache[key] = Entry(data: data, timestamp: Date(), ttl: ttl)
    }

    /// Invalidate all entries whose key contains the given substring
    func invalidate(matching substring: String) {
        lock.lock()
        defer { lock.unlock() }
        cache = cache.filter { !$0.key.contains(substring) }
    }
}

/// Main API client for Brad OS server
final class APIClient: APIClientProtocol {
    // MARK: - Singleton

    static let shared = APIClient()

    // MARK: - Properties

    let configuration: APIConfiguration
    let session: URLSession
    let decoder: JSONDecoder
    let encoder: JSONEncoder
    /// Encoder that converts camelCase Swift keys to snake_case for workout/exercise/plan/mesocycle endpoints
    let snakeCaseEncoder: JSONEncoder
    let responseCache = ResponseCache()

    // MARK: - Initialization

    init(configuration: APIConfiguration = .default, session: URLSession? = nil) {
        self.configuration = configuration

        // Use a custom session that bypasses proxies for local network access
        if let session = session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.connectionProxyDictionary = [:]
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }

        DebugLogger.info("Initialized with baseURL: \(configuration.baseURL.absoluteString)", attributes: ["source": "APIClient"])

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            guard let date = Self.parseDate(dateString) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Cannot decode date from: \(dateString)"
                )
            }
            return date
        }

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601

        self.snakeCaseEncoder = JSONEncoder()
        self.snakeCaseEncoder.keyEncodingStrategy = .convertToSnakeCase
        self.snakeCaseEncoder.dateEncodingStrategy = .iso8601
    }

    /// Parse a date string trying multiple formats
    private static func parseDate(_ dateString: String) -> Date? {
        let iso8601Fractional = ISO8601DateFormatter()
        iso8601Fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso8601Fractional.date(from: dateString) { return date }

        let iso8601 = ISO8601DateFormatter()
        iso8601.formatOptions = [.withInternetDateTime]
        if let date = iso8601.date(from: dateString) { return date }

        let dateOnly = DateFormatter()
        dateOnly.dateFormat = "yyyy-MM-dd"
        dateOnly.locale = Locale(identifier: "en_US_POSIX")
        dateOnly.timeZone = TimeZone.current
        if let date = dateOnly.date(from: dateString) { return date }

        let sqlite = DateFormatter()
        sqlite.dateFormat = "yyyy-MM-dd HH:mm:ss"
        sqlite.locale = Locale(identifier: "en_US_POSIX")
        sqlite.timeZone = TimeZone(identifier: "UTC")
        if let date = sqlite.date(from: dateString) { return date }

        let sqliteFractional = DateFormatter()
        sqliteFractional.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSS"
        sqliteFractional.locale = Locale(identifier: "en_US_POSIX")
        sqliteFractional.timeZone = TimeZone(identifier: "UTC")
        return sqliteFractional.date(from: dateString)
    }

    // MARK: - Cache Management

    /// Invalidate cached responses matching a URL path substring
    func invalidateCache(matching path: String) {
        responseCache.invalidate(matching: path)
    }

    // MARK: - Core Request Methods

    /// Perform GET request and decode response, with optional caching
    func get<T: Decodable>(
        _ path: String, queryItems: [URLQueryItem]? = nil,
        cacheTTL: TimeInterval? = nil
    ) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performRequest(request, cacheTTL: cacheTTL)
    }

    /// Perform GET request that may return null, with optional caching
    func getOptional<T: Decodable>(
        _ path: String, queryItems: [URLQueryItem]? = nil,
        cacheTTL: TimeInterval? = nil
    ) async throws -> T? {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performOptionalRequest(request, cacheTTL: cacheTTL)
    }

    /// Perform POST request with body
    func post<T: Decodable, B: Encodable>(
        _ path: String, body: B, headers: [String: String]? = nil, encoder override: JSONEncoder? = nil
    ) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try (`override` ?? encoder).encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let headers {
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
        return try await performRequest(request)
    }

    /// Perform PUT request with optional body
    func put<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "PUT")
        return try await performRequest(request)
    }

    /// Perform PUT request with body
    func put<T: Decodable, B: Encodable>(_ path: String, body: B, encoder override: JSONEncoder? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        request.httpBody = try (`override` ?? encoder).encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await performRequest(request)
    }

    /// Perform DELETE request (no response body)
    func deleteRequest(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response)
    }

    /// Perform DELETE request with response body
    func deleteRequest<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "DELETE")
        return try await performRequest(request)
    }

    // MARK: - Request Building

    func buildRequest(
        path: String, method: String,
        queryItems: [URLQueryItem]? = nil
    ) throws -> URLRequest {
        let fullURL = configuration.baseURL.appendingPathComponent(path)
        var components = URLComponents(url: fullURL, resolvingAgainstBaseURL: true)
        if let queryItems = queryItems, !queryItems.isEmpty {
            components?.queryItems = queryItems
        }

        guard let url = components?.url else {
            throw APIError.unknown("Invalid URL path: \(path)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    // MARK: - Response Handling

    func performDataTask(for request: URLRequest) async throws -> (Data, URLResponse) {
        var request = request

        // Skip App Check for emulator (localhost) - server bypasses verification in emulator mode
        if configuration.isEmulator {
            DebugLogger.warn("Skipping App Check for emulator", attributes: ["source": "APIClient"])
        } else {
            // Attach App Check token to request
            do {
                let token = try await AppCheck.appCheck().token(forcingRefresh: false)
                request.setValue(token.token, forHTTPHeaderField: "X-Firebase-AppCheck")
            } catch {
                // Log warning but continue - server will reject if enforcement is on
                DebugLogger.error("Failed to get App Check token: \(error.localizedDescription)", attributes: ["source": "APIClient"])
            }
        }

        let method = request.httpMethod ?? "?"
        let urlString = request.url?.absoluteString ?? "?"
        let path = request.url?.path ?? "?"
        let span = DebugTracing.startSpan("\(method) \(path)", kind: .client, attributes: [
            "http.method": method,
            "http.url": urlString
        ])
        DebugLogger.info("\(method) \(urlString)", attributes: ["source": "APIClient"])
        do {
            let (data, response) = try await session.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                span.setAttribute(key: "http.status_code", value: "\(httpResponse.statusCode)")
                span.setAttribute(key: "http.response_bytes", value: "\(data.count)")
                DebugLogger.info("Response: \(httpResponse.statusCode) (\(data.count) bytes)", attributes: ["source": "APIClient"])
            }
            span.end()
            return (data, response)
        } catch {
            span.setError(error)
            span.end()
            DebugLogger.error("Network error: \(error.localizedDescription)", attributes: ["source": "APIClient"])
            throw APIError.network(error)
        }
    }

    func performRequest<T: Decodable>(_ request: URLRequest, cacheTTL: TimeInterval? = nil) async throws -> T {
        let cacheKey = request.url?.absoluteString ?? ""

        // Check cache for GET requests
        if cacheTTL != nil, !cacheKey.isEmpty, let cached = responseCache.get(cacheKey) {
            do {
                let apiResponse = try decoder.decode(APIResponse<T>.self, from: cached)
                DebugLogger.info("CACHE HIT \(request.url?.path ?? "")", attributes: ["source": "APIClient"])
                return apiResponse.data
            } catch {
                // Cache decode failed (type mismatch?), fall through to network
            }
        }

        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response)

        // Cache successful GET response
        if let ttl = cacheTTL, !cacheKey.isEmpty {
            responseCache.set(cacheKey, data: data, ttl: ttl)
        }

        do {
            let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)
            return apiResponse.data
        } catch let decodingError {
            // Log the raw response for debugging
            if let jsonString = String(data: data, encoding: .utf8) {
                DebugLogger.error("Failed to decode response: \(jsonString)", attributes: ["source": "APIClient"])
                DebugLogger.error("Decoding error: \(decodingError)", attributes: ["source": "APIClient"])
            }
            throw APIError.decoding(decodingError)
        }
    }

    func performOptionalRequest<T: Decodable>(_ request: URLRequest, cacheTTL: TimeInterval? = nil) async throws -> T? {
        let cacheKey = request.url?.absoluteString ?? ""

        // Check cache for GET requests
        if cacheTTL != nil, !cacheKey.isEmpty, let cached = responseCache.get(cacheKey) {
            do {
                let apiResponse = try decoder.decode(APIResponse<T?>.self, from: cached)
                DebugLogger.info("CACHE HIT \(request.url?.path ?? "")", attributes: ["source": "APIClient"])
                return apiResponse.data
            } catch {
                // Cache decode failed, fall through to network
            }
        }

        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response)

        // Cache successful GET response
        if let ttl = cacheTTL, !cacheKey.isEmpty {
            responseCache.set(cacheKey, data: data, ttl: ttl)
        }

        do {
            // Try to decode as APIResponse<T?>
            let apiResponse = try decoder.decode(APIResponse<T?>.self, from: data)
            return apiResponse.data
        } catch {
            throw APIError.decoding(error)
        }
    }

    func validateResponse(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.network(NSError(domain: "APIClient", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid response type"
            ]))
        }

        // Success range
        if (200...299).contains(httpResponse.statusCode) {
            return
        }

        // Try to parse error response
        if let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data) {
            let code = APIErrorCode(rawValue: errorResponse.error.code) ?? .unknown
            throw APIError(
                code: code,
                message: errorResponse.error.message,
                statusCode: httpResponse.statusCode
            )
        }

        // Fallback error based on status code
        let message = "Request failed with status \(httpResponse.statusCode)"
        switch httpResponse.statusCode {
        case 404:
            throw APIError.notFound(message)
        case 400:
            throw APIError.validation(message)
        case 409:
            throw APIError.conflict(message)
        case 403:
            throw APIError.forbidden(message)
        case 500...599:
            throw APIError.internalError(message)
        default:
            throw APIError.unknown(message, statusCode: httpResponse.statusCode)
        }
    }
}
