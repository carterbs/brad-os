import Foundation
import OSLog

enum HealthKitBackgroundLogger {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.bradcarter.brad-os",
        category: "HealthKitBackground"
    )

    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
        DebugLogger.info(message, attributes: ["source": "HealthKitBackground"])
    }

    static func warning(_ message: String) {
        logger.warning("\(message, privacy: .public)")
        DebugLogger.warn(message, attributes: ["source": "HealthKitBackground"])
    }

    static func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
        DebugLogger.error(message, attributes: ["source": "HealthKitBackground"])
    }
}
