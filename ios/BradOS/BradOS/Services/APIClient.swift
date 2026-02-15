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

    func invalidateAll() {
        lock.lock()
        defer { lock.unlock() }
        cache.removeAll()
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
    let responseCache = ResponseCache()

    // MARK: - Initialization

    init(configuration: APIConfiguration = .default, session: URLSession? = nil) {
        self.configuration = configuration

        // Use a custom session that bypasses proxies for local network access
        if let session = session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.connectionProxyDictionary = [:] // Disable proxies (including Private Relay)
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }

        print("🌐 [APIClient] Initialized with baseURL: \(configuration.baseURL.absoluteString) (proxy bypass enabled)")

        // Configure decoder for ISO 8601 dates with fractional seconds
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO 8601 with fractional seconds first
            let formatterWithFractional = ISO8601DateFormatter()
            formatterWithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatterWithFractional.date(from: dateString) {
                return date
            }

            // Try ISO 8601 without fractional seconds
            let formatterWithoutFractional = ISO8601DateFormatter()
            formatterWithoutFractional.formatOptions = [.withInternetDateTime]
            if let date = formatterWithoutFractional.date(from: dateString) {
                return date
            }

            // Try date-only format (YYYY-MM-DD)
            // Use local timezone since the server already converts to local date
            let dateOnlyFormatter = DateFormatter()
            dateOnlyFormatter.dateFormat = "yyyy-MM-dd"
            dateOnlyFormatter.locale = Locale(identifier: "en_US_POSIX")
            dateOnlyFormatter.timeZone = TimeZone.current
            if let date = dateOnlyFormatter.date(from: dateString) {
                return date
            }

            // Try space-separated datetime format (YYYY-MM-DD HH:mm:ss) - SQLite default format
            let sqliteFormatter = DateFormatter()
            sqliteFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            sqliteFormatter.locale = Locale(identifier: "en_US_POSIX")
            sqliteFormatter.timeZone = TimeZone(identifier: "UTC")
            if let date = sqliteFormatter.date(from: dateString) {
                return date
            }

            // Try space-separated datetime with fractional seconds (YYYY-MM-DD HH:mm:ss.SSSSSS)
            let sqliteFractionalFormatter = DateFormatter()
            sqliteFractionalFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSS"
            sqliteFractionalFormatter.locale = Locale(identifier: "en_US_POSIX")
            sqliteFractionalFormatter.timeZone = TimeZone(identifier: "UTC")
            if let date = sqliteFractionalFormatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date from: \(dateString)"
            )
        }

        // Configure encoder for ISO 8601 dates
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Cache Management

    /// Invalidate cached responses matching a URL path substring
    func invalidateCache(matching path: String) {
        responseCache.invalidate(matching: path)
    }

    /// Invalidate all cached responses
    func invalidateAllCaches() {
        responseCache.invalidateAll()
    }

    // MARK: - Core Request Methods

    /// Perform GET request and decode response, with optional caching
    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil, cacheTTL: TimeInterval? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performRequest(request, cacheTTL: cacheTTL)
    }

    /// Perform GET request that may return null, with optional caching
    func getOptional<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil, cacheTTL: TimeInterval? = nil) async throws -> T? {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performOptionalRequest(request, cacheTTL: cacheTTL)
    }

    /// Perform POST request with body
    func post<T: Decodable, B: Encodable>(_ path: String, body: B, headers: [String: String]? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
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
    func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await performRequest(request)
    }

    /// Perform DELETE request (no response body)
    func deleteRequest(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response, allowEmpty: true)
    }

    /// Perform DELETE request with response body
    func deleteRequest<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "DELETE")
        return try await performRequest(request)
    }

    // MARK: - Request Building

    func buildRequest(path: String, method: String, queryItems: [URLQueryItem]? = nil) throws -> URLRequest {
        var components = URLComponents(url: configuration.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
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
            print("🔧 [APIClient] Skipping App Check for emulator")
        } else {
            // Attach App Check token to request
            do {
                let token = try await AppCheck.appCheck().token(forcingRefresh: false)
                request.setValue(token.token, forHTTPHeaderField: "X-Firebase-AppCheck")
            } catch {
                // Log warning but continue - server will reject if enforcement is on
                print("⚠️ [APIClient] Failed to get App Check token: \(error.localizedDescription)")
            }
        }

        print("🌐 [APIClient] \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        do {
            let (data, response) = try await session.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                print("🌐 [APIClient] Response: \(httpResponse.statusCode) (\(data.count) bytes)")
            }
            return (data, response)
        } catch {
            print("🌐 [APIClient] Network error: \(error.localizedDescription)")
            throw APIError.network(error)
        }
    }

    func performRequest<T: Decodable>(_ request: URLRequest, cacheTTL: TimeInterval? = nil) async throws -> T {
        let cacheKey = request.url?.absoluteString ?? ""

        // Check cache for GET requests
        if let ttl = cacheTTL, !cacheKey.isEmpty, let cached = responseCache.get(cacheKey) {
            do {
                let apiResponse = try decoder.decode(APIResponse<T>.self, from: cached)
                print("🌐 [APIClient] CACHE HIT \(request.url?.path ?? "")")
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
            #if DEBUG
            if let jsonString = String(data: data, encoding: .utf8) {
                print("[APIClient] Failed to decode response: \(jsonString)")
                print("[APIClient] Decoding error: \(decodingError)")
            }
            #endif
            throw APIError.decoding(decodingError)
        }
    }

    func performOptionalRequest<T: Decodable>(_ request: URLRequest, cacheTTL: TimeInterval? = nil) async throws -> T? {
        let cacheKey = request.url?.absoluteString ?? ""

        // Check cache for GET requests
        if let ttl = cacheTTL, !cacheKey.isEmpty, let cached = responseCache.get(cacheKey) {
            do {
                let apiResponse = try decoder.decode(APIResponse<T?>.self, from: cached)
                print("🌐 [APIClient] CACHE HIT \(request.url?.path ?? "")")
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

    func validateResponse(data: Data, response: URLResponse, allowEmpty: Bool = false) throws {
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
