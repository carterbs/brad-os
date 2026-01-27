import Foundation

/// API configuration for different environments
struct APIConfiguration {
    let baseURL: URL

    /// Cloud Functions base URL
    private static let cloudFunctionsURL = "https://brad-os.web.app/api"

    /// Default configuration based on build settings
    static var `default`: APIConfiguration {
        #if DEBUG
        #if targetEnvironment(simulator)
        // Local development - use Express server for fast iteration
        let urlString = "http://localhost:3001/api"
        print("🔧 [APIConfiguration] Using SIMULATOR config: \(urlString)")
        #else
        // Device testing - use Cloud Functions
        // Can be overridden via environment variable for local testing
        let envURL = ProcessInfo.processInfo.environment["BRAD_OS_API_URL"]
        let urlString = envURL ?? cloudFunctionsURL
        print("🔧 [APIConfiguration] Using DEVICE config: \(urlString) (env: \(envURL ?? "not set"))")
        #endif
        #else
        // Production - Cloud Functions
        let urlString = cloudFunctionsURL
        print("🔧 [APIConfiguration] Using PRODUCTION config: \(urlString)")
        #endif

        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
    }

    /// Create configuration with custom base URL
    static func custom(_ baseURLString: String) -> APIConfiguration {
        guard let url = URL(string: baseURLString) else {
            fatalError("Invalid API base URL: \(baseURLString)")
        }
        return APIConfiguration(baseURL: url)
    }

    /// Create configuration for localhost with specific port
    static func localhost(port: Int = 3001) -> APIConfiguration {
        let urlString = "http://localhost:\(port)/api"
        guard let url = URL(string: urlString) else {
            fatalError("Invalid localhost URL with port: \(port)")
        }
        return APIConfiguration(baseURL: url)
    }
}
