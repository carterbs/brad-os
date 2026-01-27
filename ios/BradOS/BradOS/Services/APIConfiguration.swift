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

    /// Firebase Emulator URL (hosting emulator serves at port 5002)
    private static let emulatorURL = "http://localhost:5002/api/dev"

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
        // Physical devices always use prod, simulators use dev (unless overridden)
        // Override with USE_EMULATOR=true or BRAD_OS_API_URL env var for local testing
        #if DEBUG
        // Check for emulator mode first (only makes sense on simulator)
        if ProcessInfo.processInfo.environment["USE_EMULATOR"] == "true" {
            print("🔧 [APIConfiguration] Using EMULATOR: \(emulatorURL)")
            guard let url = URL(string: emulatorURL) else {
                fatalError("Invalid emulator URL: \(emulatorURL)")
            }
            return APIConfiguration(baseURL: url)
        }

        // Check for custom URL override
        if let envURL = ProcessInfo.processInfo.environment["BRAD_OS_API_URL"] {
            print("🔧 [APIConfiguration] Using CUSTOM: \(envURL)")
            guard let url = URL(string: envURL) else {
                fatalError("Invalid custom API URL: \(envURL)")
            }
            return APIConfiguration(baseURL: url)
        }

        // Physical devices use prod, simulators use dev
        if isPhysicalDevice {
            let urlString = prodCloudFunctionsURL
            print("🔧 [APIConfiguration] Using PROD (physical device): \(urlString)")
            guard let url = URL(string: urlString) else {
                fatalError("Invalid API base URL: \(urlString)")
            }
            return APIConfiguration(baseURL: url)
        } else {
            let urlString = devCloudFunctionsURL
            print("🔧 [APIConfiguration] Using DEV (simulator): \(urlString)")
            guard let url = URL(string: urlString) else {
                fatalError("Invalid API base URL: \(urlString)")
            }
            return APIConfiguration(baseURL: url)
        }
        #else
        let urlString = prodCloudFunctionsURL
        print("🔧 [APIConfiguration] Using PROD: \(urlString)")
        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
        #endif
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
