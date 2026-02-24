import Foundation
import AVFoundation
import UIKit

/// Manages audio playback for stretch narration
///
/// Uses the Organic Maps pattern: configure the audio session once with ducking
/// options, then activate/deactivate per narration clip. The screen stays on via
/// `isIdleTimerDisabled` — no silent keepalive audio needed.
@MainActor
class StretchAudioManager: ObservableObject {
    /// Pre-fetched audio URLs from TTS cache
    private var preparedAudio: PreparedStretchAudio?

    /// Shared audio session manager (handles ducking centrally)
    private let audioSession = AudioSessionManager.shared

    // MARK: - Audio Sources

    /// Set the prepared audio sources for the current session
    func setAudioSources(_ prepared: PreparedStretchAudio) {
        self.preparedAudio = prepared
    }

    /// Get cached audio URL for a specific stretch (full instructions)
    func audioURL(for stretchId: String) -> URL? {
        preparedAudio?.stretchAudio[stretchId]
    }

    /// Get cached audio URL for a stretch name announcement only
    func nameAudioURL(for stretchId: String) -> URL? {
        preparedAudio?.stretchNameAudio[stretchId]
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

    /// Configure and activate the audio session for stretching.
    /// Also keeps the screen on to prevent iOS suspension.
    func activateSession() throws {
        NSLog("[StretchAudioManager] activateSession()")
        try audioSession.configure()
        UIApplication.shared.isIdleTimerDisabled = true
    }

    /// Deactivate the audio session when ending a stretch session.
    /// Re-enables the idle timer so the screen can turn off normally.
    func deactivateSession() {
        NSLog("[StretchAudioManager] deactivateSession()")
        stopNarration()
        preparedAudio = nil
        UIApplication.shared.isIdleTimerDisabled = false
        audioSession.deactivate()
    }

    // MARK: - Narration Playback

    /// Plays narration audio from a URL. Returns when clip finishes.
    /// Ducking is handled automatically by AudioSessionManager.
    /// - Parameter url: File URL to the audio file (from TTS cache or bundle)
    func playNarration(_ url: URL) async throws {
        NSLog("[StretchAudioManager] playNarration() - url: %@", url.lastPathComponent)

        // Pause keepalive so the audio session can fully deactivate during restore
        // (setActive(false) fails if any players are still active on the session).
        // The narration audio itself keeps the app alive during playback.
        keepalivePlayer?.pause()

        do {
            try await audioSession.playNarration(url: url)
            NSLog("[StretchAudioManager] playNarration() - completed successfully")
        } catch {
            NSLog("[StretchAudioManager] playNarration() - ERROR: %@", error.localizedDescription)
            // Reactivate and resume keepalive even on error
            try? audioSession.activateForMixing()
            resumeKeepalivePlayback()
            throw error
        }
<<<<<<< Updated upstream
=======

        // Reactivate session (was deactivated to notify podcast apps) and resume keepalive
        try? audioSession.activateForMixing()
        resumeKeepalivePlayback()
>>>>>>> Stashed changes
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

    /// Stop any currently playing narration
    func stopNarration() {
        NSLog("[StretchAudioManager] stopNarration()")
        audioSession.stopNarration()
    }

    /// Stop all audio (same as stopNarration — no keepalive to stop)
    func stopAllAudio() {
        NSLog("[StretchAudioManager] stopAllAudio()")
        stopNarration()
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
