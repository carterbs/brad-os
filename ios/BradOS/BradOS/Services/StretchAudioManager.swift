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

    /// Observer for audio session interruptions (phone calls, Siri, etc.)
    private var interruptionObserver: NSObjectProtocol?

    init() {
        setupInterruptionObserver()
    }

    deinit {
        // Clean up observers synchronously - do NOT create a Task here
        // as it would capture self after deallocation begins, causing
        // "deallocated with non-zero retain count" crash
        if let observer = narrationObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = keepaliveObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        narrationPlayer?.pause()
        keepalivePlayer?.pause()
    }

    // MARK: - Audio Interruption Handling

    private func setupInterruptionObserver() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            self?.handleInterruption(notification)
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            #if DEBUG
            print("[StretchAudioManager] Audio interruption began (e.g. phone call)")
            #endif

        case .ended:
            #if DEBUG
            print("[StretchAudioManager] Audio interruption ended")
            #endif
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    // Reactivate audio session and restart keepalive so the
                    // timer continues running while the screen is locked
                    try? AVAudioSession.sharedInstance().setActive(true)
                    resumeKeepalivePlayback()
                }
            }

        @unknown default:
            break
        }
    }

    // MARK: - Session Lifecycle

    /// Configure and activate the audio session for stretching
    /// Call this when starting a stretch session
    func activateSession() throws {
        do {
            // Use .playback to allow background audio
            // Use .mixWithOthers to let Spotify continue playing at full volume
            // Ducking is enabled only during narration via enableDucking()
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers]
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

    /// Enable audio ducking before narration
    /// This lowers Spotify/other audio volume while our narration plays
    private func enableDucking() {
        do {
            // Deactivate first to cleanly change category - this is key for
            // triggering ducking instead of pausing in apps like Spotify
            try AVAudioSession.sharedInstance().setActive(false)

            // Navigation app pattern: .voicePrompt mode with ducking options
            // .duckOthers lowers other audio volume
            // .interruptSpokenAudioAndMixWithOthers allows mixing with music
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .voicePrompt,
                options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
            )

            // Reactivate with new category
            try AVAudioSession.sharedInstance().setActive(true)

            // Restart keepalive - setActive(false) stops all audio players,
            // so the keepalive loop must be re-triggered to prevent iOS from
            // suspending the app while the screen is locked
            resumeKeepalivePlayback()
        } catch {
            #if DEBUG
            print("[StretchAudioManager] Failed to enable ducking: \(error)")
            #endif
        }
    }

    /// Restore audio after narration completes
    /// This removes ducking so Spotify/other audio returns to normal volume
    private func restoreAudioAfterDucking() {
        do {
            // Deactivate with notification to tell other apps (Spotify) to resume
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )

            // Switch back to non-ducking category
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers]
            )

            // Reactivate our session for keepalive
            try AVAudioSession.sharedInstance().setActive(true)

            // Restart keepalive - setActive(false) stops all audio players,
            // so the keepalive loop must be re-triggered to prevent iOS from
            // suspending the app while the screen is locked
            resumeKeepalivePlayback()
        } catch {
            #if DEBUG
            print("[StretchAudioManager] Failed to restore audio: \(error)")
            #endif
        }
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

    /// Ensure the keepalive audio loop is actively playing.
    /// Call this after returning from background or after audio interruptions
    /// to guarantee the audio session stays alive and iOS doesn't suspend the app.
    func ensureKeepaliveActive() {
        guard isKeepaliveRunning else {
            // Keepalive was never started or was intentionally stopped
            return
        }

        // Reactivate session in case it was deactivated
        try? AVAudioSession.sharedInstance().setActive(true)
        resumeKeepalivePlayback()
    }

    /// Resume keepalive playback after an audio session interruption
    /// Unlike startKeepalive(), this doesn't recreate the player — it just
    /// seeks to the start and plays again, which is sufficient after
    /// setActive(false) stops the player mid-stream.
    private func resumeKeepalivePlayback() {
        guard isKeepaliveRunning, let player = keepalivePlayer else { return }
        player.seek(to: .zero)
        player.play()
    }

    // MARK: - Narration Playback

    /// Plays narration audio. Returns when clip finishes.
    /// Keepalive continues running during narration (matching PWA behavior).
    /// Other audio (Spotify) is ducked (lowered) during narration via .duckOthers.
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

        // Enable ducking before narration plays
        // This lowers Spotify/other audio volume during our narration
        enableDucking()
        try? AVAudioSession.sharedInstance().setActive(true, options: [])

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
                // Restore audio so Spotify/other audio returns to normal volume
                self?.restoreAudioAfterDucking()
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
        if narrationPlayer != nil {
            narrationPlayer?.pause()
            narrationPlayer = nil
            // Restore audio so Spotify/other audio returns to normal volume
            restoreAudioAfterDucking()
        }
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
