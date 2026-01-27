import Foundation

/// API configuration for different environments
struct APIConfiguration {
    let baseURL: URL

    /// Whether this configuration points to localhost (emulator)
    var isEmulator: Bool {
        baseURL.host == "localhost" || baseURL.host == "127.0.0.1"
    }

    /// Cloud Functions base URLs
    private static let devCloudFunctionsURL = "https://brad-os.web.app/api/dev"
    private static let prodCloudFunctionsURL = "https://brad-os.web.app/api/prod"

    /// Firebase Emulator URL (hosting emulator serves at port 5000)
    private static let emulatorURL = "http://localhost:5000/api/dev"

    /// Default configuration based on build settings
    static var `default`: APIConfiguration {
        // DEBUG builds use dev functions, Release builds use prod functions
        // Override with USE_EMULATOR=true or BRAD_OS_API_URL env var for local testing
        #if DEBUG
        // Check for emulator mode first
        if ProcessInfo.processInfo.environment["USE_EMULATOR"] == "true" {
            print("🔧 [APIConfiguration] Using EMULATOR: \(emulatorURL)")
            guard let url = URL(string: emulatorURL) else {
                fatalError("Invalid emulator URL: \(emulatorURL)")
            }
            return APIConfiguration(baseURL: url)
        }

        // Check for custom URL override
        let envURL = ProcessInfo.processInfo.environment["BRAD_OS_API_URL"]
        let urlString = envURL ?? devCloudFunctionsURL
        print("🔧 [APIConfiguration] Using DEV: \(urlString) (env override: \(envURL != nil))")
        #else
        let urlString = prodCloudFunctionsURL
        print("🔧 [APIConfiguration] Using PROD: \(urlString)")
        #endif

        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
    }

    /// Create configuration for Firebase emulator
    static func emulator() -> APIConfiguration {
        guard let url = URL(string: emulatorURL) else {
            fatalError("Invalid emulator URL: \(emulatorURL)")
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
