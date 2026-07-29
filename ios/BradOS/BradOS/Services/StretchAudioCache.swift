import Foundation
import CryptoKit

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
        let fileURL = cacheDirectory.appendingPathComponent("\(key).caf")
        return FileManager.default.fileExists(atPath: fileURL.path) ? fileURL : nil
    }

    /// Render on-device speech and return the cached local audio URL.
    @MainActor
    func getOrRender(text: String, renderer: OnDeviceSpeechRenderer = .shared) async throws -> URL {
        if let cachedURL = cachedFileURL(for: text) {
            return cachedURL
        }

        let key = cacheKey(for: text)
        let fileURL = cacheDirectory.appendingPathComponent("\(key).caf")
        try await renderer.render(text: text, to: fileURL)
        return fileURL
    }
}
