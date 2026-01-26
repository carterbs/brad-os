import Foundation
import AVFoundation
import UIKit

/// Errors that can occur during audio playback
enum StretchAudioError: Error, LocalizedError {
    case fileNotFound(String)
    case playbackFailed(Error)
    case sessionConfigurationFailed(Error)

    var errorDescription: String? {
        switch self {
        case .fileNotFound(let path):
            return "Audio file not found: \(path)"
        case .playbackFailed(let error):
            return "Audio playback failed: \(error.localizedDescription)"
        case .sessionConfigurationFailed(let error):
            return "Failed to configure audio session: \(error.localizedDescription)"
        }
    }
}

/// Manages audio playback for stretch narration
///
/// Uses a keepalive audio loop pattern (matching PWA) that:
/// 1. Plays silent audio at low volume to maintain the audio session
/// 2. Allows Spotify to continue playing alongside stretching
/// 3. Keeps the app alive when the screen is locked
/// 4. Plays narration audio on top of the keepalive without pausing it
@MainActor
class StretchAudioManager: ObservableObject {
    /// Player for narration audio clips
    private var narrationPlayer: AVPlayer?
    private var narrationObserver: NSObjectProtocol?

    /// Player for silent keepalive loop
    private var keepalivePlayer: AVPlayer?
    private var keepaliveObserver: NSObjectProtocol?
    private var isKeepaliveRunning = false

    /// Base path for stretch audio files in bundle
    private let audioBasePath = "Audio/stretching"

    /// Keepalive volume (matches PWA's 1% / 0.01)
    private let keepaliveVolume: Float = 0.01

    init() {}

    deinit {
        Task { @MainActor in
            stopAllAudio()
        }
    }

    // MARK: - Session Lifecycle

    /// Configure and activate the audio session for stretching
    /// Call this when starting a stretch session
    func activateSession() throws {
        do {
            // Use .playback to allow background audio
            // Use .mixWithOthers to let Spotify continue playing
            // Use .duckOthers to lower Spotify volume during narration
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.mixWithOthers, .duckOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            throw StretchAudioError.sessionConfigurationFailed(error)
        }
    }

    /// Deactivate the audio session when ending a stretch session
    func deactivateSession() {
        stopAllAudio()
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    // MARK: - Keepalive Loop

    /// Start the silent keepalive audio loop
    /// This maintains the audio session and keeps the app alive on lock screen
    func startKeepalive() {
        guard !isKeepaliveRunning else { return }

        // Find silence audio file
        guard let silenceURL = findAudioFile("shared/silence-1s.wav") else {
            #if DEBUG
            print("[StretchAudioManager] Silence file not found, skipping keepalive")
            #endif
            return
        }

        // Create looping player
        let playerItem = AVPlayerItem(url: silenceURL)
        keepalivePlayer = AVPlayer(playerItem: playerItem)
        keepalivePlayer?.volume = keepaliveVolume

        // Set up loop notification
        keepaliveObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            // Loop by seeking back to start
            self?.keepalivePlayer?.seek(to: .zero)
            self?.keepalivePlayer?.play()
        }

        keepalivePlayer?.play()
        isKeepaliveRunning = true

        #if DEBUG
        print("[StretchAudioManager] Keepalive started")
        #endif
    }

    /// Stop the keepalive audio loop
    func stopKeepalive() {
        if let observer = keepaliveObserver {
            NotificationCenter.default.removeObserver(observer)
            keepaliveObserver = nil
        }
        keepalivePlayer?.pause()
        keepalivePlayer = nil
        isKeepaliveRunning = false

        #if DEBUG
        print("[StretchAudioManager] Keepalive stopped")
        #endif
    }

    /// Check if keepalive is currently running
    var isKeepaliveActive: Bool {
        isKeepaliveRunning
    }

    // MARK: - Narration Playback

    /// Plays narration audio. Returns when clip finishes.
    /// Keepalive continues running during narration (matching PWA behavior).
    /// - Parameter clipPath: Relative path to audio file (e.g., "back/childs-pose-begin.wav")
    func playNarration(_ clipPath: String) async throws {
        // Stop any existing narration (but not keepalive)
        stopNarration()

        // Build full path and find in bundle
        let url = findAudioFile(clipPath)
        guard let audioURL = url else {
            // Silently skip missing audio files - this allows the app to work
            // even if audio files haven't been bundled yet
            #if DEBUG
            print("[StretchAudioManager] Audio file not found, skipping: \(clipPath)")
            #endif
            return
        }

        // Create player
        let playerItem = AVPlayerItem(url: audioURL)
        narrationPlayer = AVPlayer(playerItem: playerItem)

        // Wait for playback to complete
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            narrationObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: playerItem,
                queue: .main
            ) { [weak self] _ in
                self?.removeNarrationObserver()
                continuation.resume()
            }

            narrationPlayer?.play()
        }
    }

    /// Plays narration without waiting for completion (fire-and-forget)
    /// Timer should NOT wait for this - it runs in parallel.
    /// - Parameter clipPath: Relative path to audio file
    func playNarrationAsync(_ clipPath: String) {
        Task {
            try? await playNarration(clipPath)
        }
    }

    /// Stop any currently playing narration (but not keepalive)
    func stopNarration() {
        removeNarrationObserver()
        narrationPlayer?.pause()
        narrationPlayer = nil
    }

    /// Stop all audio including keepalive
    func stopAllAudio() {
        stopNarration()
        stopKeepalive()
    }

    // MARK: - Private Helpers

    private func removeNarrationObserver() {
        if let observer = narrationObserver {
            NotificationCenter.default.removeObserver(observer)
            narrationObserver = nil
        }
    }

    /// Find audio file in bundle
    /// Paths come from manifest like "back/childs-pose-begin.wav" or "shared/switch-sides.wav"
    /// Files are stored in Audio/stretching/...
    private func findAudioFile(_ clipPath: String) -> URL? {
        let components = clipPath.components(separatedBy: "/")
        let filename = components.last ?? clipPath
        let filenameWithoutExt = (filename as NSString).deletingPathExtension
        let ext = (filename as NSString).pathExtension.isEmpty ? "wav" : (filename as NSString).pathExtension

        // Build subdirectory path: Audio/stretching/{folder}
        let folder = components.count > 1 ? components.dropLast().joined(separator: "/") : ""
        let subdirectory = folder.isEmpty ? "Audio/stretching" : "Audio/stretching/\(folder)"

        // Try in the expected location
        if let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: subdirectory
        ) {
            #if DEBUG
            print("[StretchAudioManager] Found audio: \(clipPath) at \(url.path)")
            #endif
            return url
        }

        // Fallback: Try just the filename anywhere in bundle
        if let url = Bundle.main.url(forResource: filenameWithoutExt, withExtension: ext) {
            #if DEBUG
            print("[StretchAudioManager] Found audio (fallback): \(clipPath) at \(url.path)")
            #endif
            return url
        }

        #if DEBUG
        print("[StretchAudioManager] Audio file not found: \(clipPath) (looked in \(subdirectory))")
        #endif
        return nil
    }
}

// MARK: - Spotify Integration

extension StretchAudioManager {
    /// Open Spotify playlist via deep link
    /// - Parameter urlString: Spotify playlist URL (web or deep link format)
    /// - Returns: The playlist ID if a valid Spotify URL was found, nil otherwise
    @MainActor
    func openSpotifyPlaylist(_ urlString: String) -> String? {
        guard !urlString.isEmpty else { return nil }

        var spotifyURL: URL?
        var playlistId: String?

        // If it's already a spotify: deep link, use directly
        if urlString.hasPrefix("spotify:") {
            spotifyURL = URL(string: urlString)
            // Extract ID from spotify:playlist:ID format
            let components = urlString.components(separatedBy: ":")
            if components.count >= 3 {
                playlistId = components[2]
            }
        }
        // Convert web URL to deep link
        else if let url = URL(string: urlString) {
            // Handle https://open.spotify.com/playlist/abc or similar
            let pathComponents = url.pathComponents
            if pathComponents.count >= 3 {
                let type = pathComponents[1]  // "playlist", "album", "track"
                let id = pathComponents[2]
                spotifyURL = URL(string: "spotify:\(type):\(id)")
                playlistId = id
            }
        }

        // Try to open the Spotify app
        if let url = spotifyURL {
            // First check if Spotify is installed
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                return playlistId
            } else {
                // Fallback to web URL
                if let webURL = URL(string: urlString) {
                    UIApplication.shared.open(webURL, options: [:], completionHandler: nil)
                    return playlistId
                }
            }
        }
        return nil
    }
}
