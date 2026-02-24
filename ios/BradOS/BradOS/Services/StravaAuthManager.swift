import Foundation
import AuthenticationServices

// MARK: - Strava Auth Errors

enum StravaAuthError: Error, LocalizedError {
    case missingCredentials
    case authenticationFailed(String)
    case tokenExchangeFailed(String)
    case tokenRefreshFailed(String)
    case invalidCallbackURL
    case noAuthorizationCode
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .missingCredentials:
            return "Strava credentials not configured. Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET."
        case .authenticationFailed(let message):
            return "Authentication failed: \(message)"
        case .tokenExchangeFailed(let message):
            return "Token exchange failed: \(message)"
        case .tokenRefreshFailed(let message):
            return "Token refresh failed: \(message)"
        case .invalidCallbackURL:
            return "Invalid callback URL received from Strava"
        case .noAuthorizationCode:
            return "No authorization code in callback URL"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

// MARK: - Strava API Responses

/// Response from Strava token exchange
private struct StravaTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int
    let athlete: StravaAthlete

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case athlete
    }
}

/// Strava athlete info
private struct StravaAthlete: Decodable {
    let id: Int
}

/// Strava API error response
private struct StravaErrorResponse: Decodable {
    let message: String?
}

// MARK: - Strava Auth Manager

/// Manager for Strava OAuth authentication flow
@MainActor
final class StravaAuthManager: NSObject, ObservableObject {
    // MARK: - Published Properties

    @Published var isConnected: Bool = false
    @Published var athleteId: Int?
    @Published var isLoading: Bool = false
    @Published var error: String?

    // MARK: - Private Properties

    private let clientId: String
    private let clientSecret: String
    private let redirectUri = "bradosapp://strava-callback"
    private let keychainService: KeychainService

    private var pendingContinuation: CheckedContinuation<URL, Error>?

    // MARK: - Constants

    private static let authorizationURL = "https://www.strava.com/oauth/authorize"
    private static let tokenURL = "https://www.strava.com/oauth/token"
    private static let requiredScopes = "activity:read"

    // MARK: - Initialization

    init(keychainService: KeychainService = .shared) {
        // Load credentials from environment or Info.plist
        self.clientId = ProcessInfo.processInfo.environment["STRAVA_CLIENT_ID"]
            ?? Bundle.main.object(forInfoDictionaryKey: "StravaClientID") as? String
            ?? ""
        self.clientSecret = ProcessInfo.processInfo.environment["STRAVA_CLIENT_SECRET"]
            ?? Bundle.main.object(forInfoDictionaryKey: "StravaClientSecret") as? String
            ?? ""
        self.keychainService = keychainService

        super.init()

        loadExistingTokens()

        if clientId.isEmpty || clientSecret.isEmpty {
            DebugLogger.warn("Warning: Strava credentials not configured", attributes: ["source": "StravaAuthManager"])
        } else {
            DebugLogger.info("Initialized with client ID: \(clientId.prefix(8))...", attributes: ["source": "StravaAuthManager"])
        }
    }

    // MARK: - Public Methods

    /// Start the OAuth flow to connect to Strava
    func startOAuthFlow() async throws {
        guard !clientId.isEmpty, !clientSecret.isEmpty else {
            throw StravaAuthError.missingCredentials
        }

        isLoading = true
        error = nil

        defer {
            isLoading = false
        }

        do {
            // Build authorization URL
            let authURL = try buildAuthURL()
            DebugLogger.info("Starting OAuth flow with URL: \(authURL)", attributes: ["source": "StravaAuthManager"])

            // Present authentication session
            let callbackURL = try await presentAuthSession(url: authURL)

            // Extract authorization code from callback
            let code = try extractAuthorizationCode(from: callbackURL)
            DebugLogger.info("Received authorization code", attributes: ["source": "StravaAuthManager"])

            // Exchange code for tokens
            let tokens = try await exchangeCodeForTokens(code: code)
            DebugLogger.info("Token exchange successful for athlete: \(tokens.athleteId)", attributes: ["source": "StravaAuthManager"])

            // Save tokens to keychain
            try keychainService.saveStravaTokens(tokens)

            // Sync tokens to backend so webhooks can use them
            await syncTokensToBackend(tokens)

            // Update state
            isConnected = true
            athleteId = tokens.athleteId

            DebugLogger.info("Successfully connected to Strava", attributes: ["source": "StravaAuthManager"])
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    /// Disconnect from Strava
    func disconnect() async throws {
        DebugLogger.info("Disconnecting from Strava", attributes: ["source": "StravaAuthManager"])

        // Delete tokens from keychain
        try keychainService.deleteStravaTokens()

        // Update state
        isConnected = false
        athleteId = nil
        error = nil

        DebugLogger.info("Disconnected from Strava", attributes: ["source": "StravaAuthManager"])
    }

    /// Handle callback URL from deep link
    func handleCallbackURL(_ url: URL) {
        guard url.scheme == "bradosapp", url.host == "strava-callback" else {
            DebugLogger.info("Ignoring non-Strava callback URL: \(url)", attributes: ["source": "StravaAuthManager"])
            return
        }

        DebugLogger.info("Handling Strava callback URL", attributes: ["source": "StravaAuthManager"])

        // Resume the pending continuation if we have one
        // Note: ASWebAuthenticationSession usually handles this automatically,
        // but we keep this as a fallback for edge cases
        if let continuation = pendingContinuation {
            pendingContinuation = nil
            continuation.resume(returning: url)
        }
    }

    // MARK: - Private Methods

    /// Sync tokens to the backend so webhooks can fetch activities.
    /// Best-effort — failure here should not block the OAuth flow.
    private func syncTokensToBackend(_ tokens: StravaTokens) async {
        do {
            try await APIClient.shared.syncStravaTokens(tokens)
            DebugLogger.info("Tokens synced to backend", attributes: ["source": "StravaAuthManager"])
        } catch {
            DebugLogger.error("Failed to sync tokens to backend (non-fatal): \(error.localizedDescription)", attributes: ["source": "StravaAuthManager"])
        }
    }

    /// Load existing tokens from keychain
    private func loadExistingTokens() {
        do {
            if let tokens = try keychainService.loadStravaTokens() {
                isConnected = true
                athleteId = tokens.athleteId
                DebugLogger.info("Loaded existing tokens for athlete: \(tokens.athleteId)", attributes: ["source": "StravaAuthManager"])

                // Sync existing tokens to backend (handles migration for pre-sync users)
                Task {
                    await syncTokensToBackend(tokens)
                }

                // Check if tokens need refresh
                if tokens.isExpired {
                    DebugLogger.error("Tokens are expired, will refresh on next use", attributes: ["source": "StravaAuthManager"])
                }
            }
        } catch {
            DebugLogger.error("Failed to load existing tokens: \(error)", attributes: ["source": "StravaAuthManager"])
        }
    }

    /// Build the authorization URL
    private func buildAuthURL() throws -> URL {
        guard var components = URLComponents(string: Self.authorizationURL) else {
            throw StravaAuthError.authenticationFailed("Invalid authorization URL")
        }

        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: Self.requiredScopes),
            URLQueryItem(name: "approval_prompt", value: "auto")
        ]

        guard let url = components.url else {
            throw StravaAuthError.authenticationFailed("Failed to build authorization URL")
        }
        return url
    }

    /// Present ASWebAuthenticationSession
    private func presentAuthSession(url: URL) async throws -> URL {
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "bradosapp"
            ) { callbackURL, error in
                if let error = error {
                    if let authError = error as? ASWebAuthenticationSessionError,
                       authError.code == .canceledLogin {
                        continuation.resume(throwing: StravaAuthError.authenticationFailed("User cancelled"))
                    } else {
                        continuation.resume(throwing: StravaAuthError.authenticationFailed(error.localizedDescription))
                    }
                    return
                }

                guard let callbackURL = callbackURL else {
                    continuation.resume(throwing: StravaAuthError.invalidCallbackURL)
                    return
                }

                continuation.resume(returning: callbackURL)
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false

            if !session.start() {
                continuation.resume(throwing: StravaAuthError.authenticationFailed("Failed to start auth session"))
            }
        }
    }

    /// Extract authorization code from callback URL
    private func extractAuthorizationCode(from url: URL) throws -> String {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            throw StravaAuthError.invalidCallbackURL
        }

        // Check for error in callback
        if let errorParam = queryItems.first(where: { $0.name == "error" })?.value {
            throw StravaAuthError.authenticationFailed(errorParam)
        }

        // Extract code
        guard let code = queryItems.first(where: { $0.name == "code" })?.value else {
            throw StravaAuthError.noAuthorizationCode
        }

        return code
    }

    /// Exchange authorization code for tokens
    private func exchangeCodeForTokens(code: String) async throws -> StravaTokens {
        guard let tokenURL = URL(string: Self.tokenURL) else {
            throw StravaAuthError.tokenExchangeFailed("Invalid token URL")
        }
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let bodyParams = [
            "client_id": clientId,
            "client_secret": clientSecret,
            "code": code,
            "grant_type": "authorization_code"
        ]

        request.httpBody = bodyParams
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw StravaAuthError.tokenExchangeFailed("Invalid response")
            }

            if httpResponse.statusCode != 200 {
                if let errorResponse = try? JSONDecoder().decode(StravaErrorResponse.self, from: data) {
                    let message = errorResponse.message ?? "Unknown error"
                    throw StravaAuthError.tokenExchangeFailed(message)
                }
                throw StravaAuthError.tokenExchangeFailed("HTTP \(httpResponse.statusCode)")
            }

            let tokenResponse = try JSONDecoder().decode(StravaTokenResponse.self, from: data)

            return StravaTokens(
                accessToken: tokenResponse.accessToken,
                refreshToken: tokenResponse.refreshToken,
                expiresAt: tokenResponse.expiresAt,
                athleteId: tokenResponse.athlete.id
            )
        } catch let error as StravaAuthError {
            throw error
        } catch {
            throw StravaAuthError.networkError(error)
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension StravaAuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Get the key window for presentation
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}
