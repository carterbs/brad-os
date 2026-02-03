import Foundation
import CryptoKit
import BradOSCore

/// Disk cache for stretch TTS audio files.
/// Same pattern as TTSAudioCache but in a separate directory.
final class StretchAudioCache {
    static let shared = StretchAudioCache()

    private let cacheDirectory: URL

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        cacheDirectory = caches.appendingPathComponent("stretch-tts", isDirectory: true)

        // Create directory if needed
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Generate cache key from text content
    private func cacheKey(for text: String) -> String {
        let hash = SHA256.hash(data: Data(text.utf8))
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// Get cached file URL if it exists
    func cachedFileURL(for text: String) -> URL? {
        let key = cacheKey(for: text)
        let fileURL = cacheDirectory.appendingPathComponent("\(key).mp3")
        return FileManager.default.fileExists(atPath: fileURL.path) ? fileURL : nil
    }

    /// Store audio data and return file URL
    func store(data: Data, for text: String) throws -> URL {
        let key = cacheKey(for: text)
        let fileURL = cacheDirectory.appendingPathComponent("\(key).mp3")
        try data.write(to: fileURL)
        return fileURL
    }

    /// Get from cache or fetch via API client
    func getOrFetch(text: String, using apiClient: APIClientProtocol) async throws -> URL {
        if let cachedURL = cachedFileURL(for: text) {
            return cachedURL
        }

        let data = try await apiClient.synthesizeSpeech(text: text)
        return try store(data: data, for: text)
    }

    /// Clear entire cache
    func clearCache() throws {
        try FileManager.default.removeItem(at: cacheDirectory)
        try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
}
