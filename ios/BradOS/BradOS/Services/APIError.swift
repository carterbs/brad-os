import Foundation

/// API error codes matching server responses
enum APIErrorCode: String, Codable {
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
struct APIError: Error, LocalizedError {
    let code: APIErrorCode
    let message: String
    let statusCode: Int?
    let details: Any?

    var errorDescription: String? { message }

    // MARK: - Convenience Initializers

    static func notFound(_ message: String) -> APIError {
        APIError(code: .notFound, message: message, statusCode: 404, details: nil)
    }

    static func validation(_ message: String, details: Any? = nil) -> APIError {
        APIError(code: .validationError, message: message, statusCode: 400, details: details)
    }

    static func conflict(_ message: String) -> APIError {
        APIError(code: .conflict, message: message, statusCode: 409, details: nil)
    }

    static func forbidden(_ message: String) -> APIError {
        APIError(code: .forbidden, message: message, statusCode: 403, details: nil)
    }

    static func internalError(_ message: String) -> APIError {
        APIError(code: .internalError, message: message, statusCode: 500, details: nil)
    }

    static func network(_ error: Error) -> APIError {
        APIError(code: .networkError, message: error.localizedDescription, statusCode: nil, details: nil)
    }

    static func decoding(_ error: Error) -> APIError {
        APIError(code: .decodingError, message: "Failed to decode response: \(error.localizedDescription)", statusCode: nil, details: nil)
    }

    static func unknown(_ message: String, statusCode: Int? = nil) -> APIError {
        APIError(code: .unknown, message: message, statusCode: statusCode, details: nil)
    }
}
