import Foundation

/// API configuration for different environments
struct APIConfiguration {
    let baseURL: URL

    // MARK: - Debug Flag
    // Set to true to use dev API on physical device for testing
    private static let forceDevAPIOnPhysicalDevice = false

    /// Hosted API base URLs
    private static let devHostedAPIURL = "https://brad-os.web.app/api/dev"
    private static let prodHostedAPIURL = "https://brad-os.web.app/api/prod"

    /// Whether we're running on a physical device (not simulator)
    private static var isPhysicalDevice: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return true
        #endif
    }

    /// Default configuration based on build settings
    static var `default`: APIConfiguration {
        #if DEBUG
        return resolveDefault(
            environment: ProcessInfo.processInfo.environment,
            isPhysicalDevice: isPhysicalDevice
        )
        #else
        let urlString = prodHostedAPIURL
        DebugLogger.info("Using PROD: \(urlString)", attributes: ["source": "APIConfiguration"])
        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
        #endif
    }

    /// Resolve debug configuration, including an optional standalone local API.
    static func resolveDefault(
        environment: [String: String],
        isPhysicalDevice: Bool
    ) -> APIConfiguration {
        if let envURL = environment["BRAD_OS_API_URL"] {
            DebugLogger.info("Using CUSTOM: \(envURL)", attributes: ["source": "APIConfiguration"])
            guard let url = URL(string: envURL) else {
                fatalError("Invalid custom API URL: \(envURL)")
            }
            return APIConfiguration(baseURL: url)
        }

        if isPhysicalDevice && !forceDevAPIOnPhysicalDevice {
            let urlString = prodHostedAPIURL
            DebugLogger.info("Using PROD (physical device): \(urlString)", attributes: ["source": "APIConfiguration"])
            guard let url = URL(string: urlString) else {
                fatalError("Invalid API base URL: \(urlString)")
            }
            return APIConfiguration(baseURL: url)
        } else if isPhysicalDevice && forceDevAPIOnPhysicalDevice {
            let urlString = devHostedAPIURL
            DebugLogger.warn("FORCED DEV on physical device: \(urlString)", attributes: ["source": "APIConfiguration"])
            guard let url = URL(string: urlString) else {
                fatalError("Invalid API base URL: \(urlString)")
            }
            return APIConfiguration(baseURL: url)
        } else {
            let urlString = devHostedAPIURL
            DebugLogger.info("Using DEV (simulator): \(urlString)", attributes: ["source": "APIConfiguration"])
            guard let url = URL(string: urlString) else {
                fatalError("Invalid API base URL: \(urlString)")
            }
            return APIConfiguration(baseURL: url)
        }
    }
}
