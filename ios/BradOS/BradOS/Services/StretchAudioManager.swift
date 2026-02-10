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
/// 2. Allows other audio to play between narrations (may pause during narration)
/// 3. Keeps the app alive when the screen is locked
/// 4. Plays narration audio on top of the keepalive without pausing it
@MainActor
class StretchAudioManager: ObservableObject {
    /// Player for silent keepalive loop (AVQueuePlayer for use with AVPlayerLooper)
    private var keepalivePlayer: AVQueuePlayer?
    private var keepaliveLooper: AVPlayerLooper?
    private var isKeepaliveRunning = false

    /// Keepalive volume (matches PWA's 1% / 0.01)
    private let keepaliveVolume: Float = 0.01

    /// Pre-fetched audio URLs from TTS cache
    private var preparedAudio: PreparedStretchAudio?

    /// Shared audio session manager (handles interruption/ducking centrally)
    private let audioSession = AudioSessionManager.shared

    init() {
        audioSession.onInterruption = { [weak self] type in
            guard type == .ended else { return }
            Task { @MainActor [weak self] in
                self?.resumeKeepalivePlayback()
            }
        }
    }

    deinit {
        keepaliveLooper?.disableLooping()
        keepalivePlayer?.pause()
    }

    // MARK: - Audio Sources

    /// Set the prepared audio sources for the current session
    func setAudioSources(_ prepared: PreparedStretchAudio) {
        self.preparedAudio = prepared
    }

    /// Get cached audio URL for a specific stretch
    func audioURL(for stretchId: String) -> URL? {
        preparedAudio?.stretchAudio[stretchId]
    }

    /// Get cached audio URL for a shared cue
    func sharedAudioURL(for cue: SharedStretchCue) -> URL? {
        guard let prepared = preparedAudio else { return nil }
        let url: URL
        switch cue {
        case .switchSides: url = prepared.switchSidesURL
        case .halfway: url = prepared.halfwayURL
        case .sessionComplete: url = prepared.sessionCompleteURL
        }
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: - Session Lifecycle

    /// Configure and activate the audio session for stretching
    /// Call this when starting a stretch session
    func activateSession() throws {
        NSLog("[StretchAudioManager] activateSession()")
        try audioSession.activateForMixing()
    }

    /// Deactivate the audio session when ending a stretch session
    func deactivateSession() {
        NSLog("[StretchAudioManager] deactivateSession()")
        stopAllAudio()
        preparedAudio = nil
        audioSession.deactivate()
    }

    // MARK: - Keepalive Loop

    /// Start the silent keepalive audio loop using AVPlayerLooper for gapless background playback.
    /// This maintains the audio session and keeps the app alive on lock screen.
    func startKeepalive() {
        guard !isKeepaliveRunning else {
            NSLog("[StretchAudioManager] startKeepalive() - already running, skipping")
            return
        }

        // Find silence audio file
        guard let silenceURL = findAudioFile("shared/silence-1s.wav") else {
            NSLog("[StretchAudioManager] startKeepalive() - silence file not found, skipping")
            return
        }

        NSLog("[StretchAudioManager] startKeepalive() - creating AVQueuePlayer + AVPlayerLooper")

        // Create AVQueuePlayer + AVPlayerLooper for gapless looping
        let templateItem = AVPlayerItem(url: silenceURL)
        let queuePlayer = AVQueuePlayer()
        queuePlayer.volume = keepaliveVolume
        keepalivePlayer = queuePlayer
        keepaliveLooper = AVPlayerLooper(player: queuePlayer, templateItem: templateItem)

        queuePlayer.play()
        isKeepaliveRunning = true

        NSLog("[StretchAudioManager] startKeepalive() - keepalive started, looper status: %d", keepaliveLooper?.status.rawValue ?? -1)
    }

    /// Stop the keepalive audio loop
    func stopKeepalive() {
        NSLog("[StretchAudioManager] stopKeepalive() - wasRunning: %@", isKeepaliveRunning ? "true" : "false")
        keepaliveLooper?.disableLooping()
        keepaliveLooper = nil
        keepalivePlayer?.pause()
        keepalivePlayer = nil
        isKeepaliveRunning = false
        NSLog("[StretchAudioManager] stopKeepalive() - done")
    }

    /// Check if keepalive is currently running
    var isKeepaliveActive: Bool {
        isKeepaliveRunning
    }

    /// Ensure the keepalive audio loop is actively playing.
    /// Call this after returning from background or after audio interruptions
    /// to guarantee the audio session stays alive and iOS doesn't suspend the app.
    func ensureKeepaliveActive() {
        guard isKeepaliveRunning else {
            NSLog("[StretchAudioManager] ensureKeepaliveActive() - not running, skipping")
            return
        }
        NSLog("[StretchAudioManager] ensureKeepaliveActive() - reactivating session and resuming playback")
        try? audioSession.activateForMixing()
        resumeKeepalivePlayback()
    }

    /// Resume keepalive playback after an audio session interruption.
    /// Unlike startKeepalive(), this doesn't recreate the player — it just
    /// resumes play, which is sufficient after interruption stops the player.
    private func resumeKeepalivePlayback() {
        guard isKeepaliveRunning, let player = keepalivePlayer else {
            NSLog("[StretchAudioManager] resumeKeepalivePlayback() - skipped (running: %@, player: %@)",
                  isKeepaliveRunning ? "true" : "false",
                  keepalivePlayer != nil ? "exists" : "nil")
            return
        }
        NSLog("[StretchAudioManager] resumeKeepalivePlayback() - resuming player")
        player.play()
    }

    // MARK: - Narration Playback

    /// Plays narration audio from a URL. Returns when clip finishes.
    /// Keepalive continues running during narration — it's 1% volume silent audio
    /// and won't interfere with narration playback.
    /// - Parameter url: File URL to the audio file (from TTS cache or bundle)
    func playNarration(_ url: URL) async throws {
        NSLog("[StretchAudioManager] playNarration() - url: %@, keepalive running: %@",
              url.lastPathComponent, isKeepaliveRunning ? "true" : "false")

        do {
            try await audioSession.playNarration(url: url, backgroundSafe: true)
            NSLog("[StretchAudioManager] playNarration() - completed successfully")
        } catch {
            NSLog("[StretchAudioManager] playNarration() - ERROR: %@", error.localizedDescription)
            throw error
        }

        // Resume keepalive after narration (session changes during ducking may have paused it)
        resumeKeepalivePlayback()
    }

    /// Plays narration without waiting for completion (fire-and-forget)
    /// Timer should NOT wait for this - it runs in parallel.
    /// - Parameter url: File URL to the audio file, or nil to skip
    func playNarrationAsync(_ url: URL?) {
        guard let url else { return }
        NSLog("[StretchAudioManager] playNarrationAsync() - url: %@", url.lastPathComponent)
        Task {
            do {
                try await playNarration(url)
            } catch {
                NSLog("[StretchAudioManager] playNarrationAsync() - ERROR: %@", error.localizedDescription)
            }
        }
    }

    /// Stop any currently playing narration (but not keepalive)
    func stopNarration() {
        NSLog("[StretchAudioManager] stopNarration()")
        audioSession.stopNarration()
    }

    /// Stop all audio including keepalive
    func stopAllAudio() {
        NSLog("[StretchAudioManager] stopAllAudio()")
        stopNarration()
        stopKeepalive()
    }

    // MARK: - Private Helpers

    /// Find audio file in bundle (used only for keepalive silence)
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
            NSLog("[StretchAudioManager] Found audio: %@ at %@", clipPath, url.path)
            return url
        }

        // Fallback: Try just the filename anywhere in bundle
        if let url = Bundle.main.url(forResource: filenameWithoutExt, withExtension: ext) {
            NSLog("[StretchAudioManager] Found audio (fallback): %@ at %@", clipPath, url.path)
            return url
        }

        NSLog("[StretchAudioManager] Audio file not found: %@ (looked in %@)", clipPath, subdirectory)
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
