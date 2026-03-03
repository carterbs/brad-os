import Foundation

/// API error codes matching server responses
public enum APIErrorCode: String, Codable, Sendable {
    case notFound = "NOT_FOUND"
    case validationError = "VALIDATION_ERROR"
    case conflict = "CONFLICT"
    case forbidden = "FORBIDDEN"
    case internalError = "INTERNAL_ERROR"
    case networkError = "NETWORK_ERROR"
    case decodingError = "DECODING_ERROR"
    case unknown = "UNKNOWN_ERROR"
}

/// Structured API error with code and message
public struct APIError: Error, LocalizedError, Sendable {
    public let code: APIErrorCode
    public let message: String
    public let statusCode: Int?

    public var errorDescription: String? { message }

    public init(code: APIErrorCode, message: String, statusCode: Int? = nil) {
        self.code = code
        self.message = message
        self.statusCode = statusCode
    }

    // MARK: - Computed Properties

    public var isValidationError: Bool {
        code == .validationError
    }

    public var isNotFoundError: Bool {
        code == .notFound
    }

    public var isNetworkError: Bool {
        code == .networkError
    }

    // MARK: - Convenience Initializers

    public static func notFound(_ message: String) -> APIError {
        APIError(code: .notFound, message: message, statusCode: 404)
    }

    public static func validation(_ message: String) -> APIError {
        APIError(code: .validationError, message: message, statusCode: 400)
    }

    public static func conflict(_ message: String) -> APIError {
        APIError(code: .conflict, message: message, statusCode: 409)
    }

    public static func forbidden(_ message: String) -> APIError {
        APIError(code: .forbidden, message: message, statusCode: 403)
    }

    public static func internalError(_ message: String) -> APIError {
        APIError(code: .internalError, message: message, statusCode: 500)
    }

    public static func network(_ error: Error) -> APIError {
        APIError(code: .networkError, message: error.localizedDescription, statusCode: nil)
    }

    public static func decoding(_ error: Error) -> APIError {
        APIError(code: .decodingError, message: "Failed to decode response: \(String(describing: error))", statusCode: nil)
    }

    public static func unknown(_ message: String, statusCode: Int? = nil) -> APIError {
        APIError(code: .unknown, message: message, statusCode: statusCode)
    }
}
