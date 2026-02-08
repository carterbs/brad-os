import Foundation
import Security

// MARK: - Keychain Errors

enum KeychainError: Error, LocalizedError {
    case unhandledError(status: OSStatus)
    case itemNotFound
    case encodingError
    case decodingError

    var errorDescription: String? {
        switch self {
        case .unhandledError(let status):
            return "Keychain error: \(status)"
        case .itemNotFound:
            return "Item not found in keychain"
        case .encodingError:
            return "Failed to encode data for keychain"
        case .decodingError:
            return "Failed to decode data from keychain"
        }
    }
}

// MARK: - Strava Tokens

/// Tokens received from Strava OAuth flow
struct StravaTokens: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int
    let athleteId: Int

    /// Check if the access token has expired (with 5 minute buffer)
    var isExpired: Bool {
        let expirationDate = Date(timeIntervalSince1970: TimeInterval(expiresAt))
        let bufferDate = Date().addingTimeInterval(5 * 60) // 5 minute buffer
        return bufferDate >= expirationDate
    }
}

// MARK: - Keychain Service

/// Service for securely storing and retrieving data from the iOS Keychain
final class KeychainService {
    // MARK: - Singleton

    static let shared = KeychainService()

    // MARK: - Constants

    private let service = "com.bradcarter.brad-os"
    private let stravaTokensKey = "strava-tokens"

    // MARK: - Initialization

    private init() {}

    // MARK: - Generic Keychain Operations

    /// Save data to the keychain
    /// - Parameters:
    ///   - key: The key to store the data under
    ///   - data: The data to store
    func save(key: String, data: Data) throws {
        // First, try to delete any existing item
        try? delete(key: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }

        print("[KeychainService] Saved data for key: \(key)")
    }

    /// Load data from the keychain
    /// - Parameter key: The key to load data for
    /// - Returns: The stored data, or nil if not found
    func load(key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            return result as? Data
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unhandledError(status: status)
        }
    }

    /// Delete data from the keychain
    /// - Parameter key: The key to delete
    func delete(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }

        print("[KeychainService] Deleted data for key: \(key)")
    }

    // MARK: - Strava Token Convenience Methods

    /// Save Strava tokens to the keychain
    /// - Parameter tokens: The tokens to save
    func saveStravaTokens(_ tokens: StravaTokens) throws {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(tokens) else {
            throw KeychainError.encodingError
        }
        try save(key: stravaTokensKey, data: data)
        print("[KeychainService] Saved Strava tokens for athlete: \(tokens.athleteId)")
    }

    /// Load Strava tokens from the keychain
    /// - Returns: The stored tokens, or nil if not found
    func loadStravaTokens() throws -> StravaTokens? {
        guard let data = try load(key: stravaTokensKey) else {
            return nil
        }

        let decoder = JSONDecoder()
        guard let tokens = try? decoder.decode(StravaTokens.self, from: data) else {
            throw KeychainError.decodingError
        }

        return tokens
    }

    /// Delete Strava tokens from the keychain
    func deleteStravaTokens() throws {
        try delete(key: stravaTokensKey)
        print("[KeychainService] Deleted Strava tokens")
    }
}
