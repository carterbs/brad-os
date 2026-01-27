import Foundation

/// API configuration for different environments
struct APIConfiguration {
    let baseURL: URL

    /// Default configuration based on build settings
    static var `default`: APIConfiguration {
        #if DEBUG
        // Use localhost for simulator, configurable IP for device
        #if targetEnvironment(simulator)
        let urlString = "http://localhost:3001/api"
        print("🔧 [APIConfiguration] Using SIMULATOR config: \(urlString)")
        #else
        // For physical device testing, use your Mac's IP address
        // This can be configured via the Settings app or environment variable
        let envURL = ProcessInfo.processInfo.environment["BRAD_OS_API_URL"]
        let urlString = envURL ?? "http://192.168.5.98:3000/api"
        print("🔧 [APIConfiguration] Using DEVICE config: \(urlString) (env: \(envURL ?? "not set"))")
        #endif
        #else
        // Production URL
        let urlString = "https://api.brad-os.com/api"
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
