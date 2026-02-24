import Foundation

/// Structured debug logger. All methods are no-ops in release builds.
/// Use this instead of print() for structured, queryable logging.
enum DebugLogger {
    static func info(_ message: String, attributes: [String: String] = [:]) {
        #if DEBUG
        DebugTelemetry.shared.log(severity: .info, message: message, attributes: attributes)
        #endif
    }

    static func warn(_ message: String, attributes: [String: String] = [:]) {
        #if DEBUG
        DebugTelemetry.shared.log(severity: .warn, message: message, attributes: attributes)
        #endif
    }

    static func error(_ message: String, error: Error? = nil, attributes: [String: String] = [:]) {
        #if DEBUG
        var attrs = attributes
        if let error = error {
            attrs["error"] = String(describing: error)
        }
        DebugTelemetry.shared.log(severity: .error, message: message, attributes: attrs)
        #endif
    }
}
