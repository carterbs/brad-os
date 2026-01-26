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
/// Interrupts Spotify during narration and resumes it after completion
@MainActor
class StretchAudioManager: ObservableObject {
    private var player: AVPlayer?
    private var playbackObserver: NSObjectProtocol?

    /// Base path for stretch audio files in bundle
    private let audioBasePath = "Audio/Stretching"

    init() {}

    deinit {
        Task { @MainActor in
            stopAudio()
        }
    }

    /// Plays narration audio, interrupting Spotify. Returns when clip finishes.
    /// - Parameter clipPath: Relative path to audio file (e.g., "back/childs-pose-begin.wav")
    func playNarration(_ clipPath: String) async throws {
        // Clean up any existing playback
        stopAudio()

        // Configure audio session to interrupt other audio
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: []
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            throw StretchAudioError.sessionConfigurationFailed(error)
        }

        // Build full path and find in bundle
        // The clipPath comes as "back/childs-pose-begin.wav"
        // We need to find it in the bundle (either as nested folders or flat files)
        let url = findAudioFile(clipPath)
        guard let audioURL = url else {
            // Silently skip missing audio files - this allows the app to work
            // even if audio files haven't been bundled yet
            print("Audio file not found, skipping: \(clipPath)")
            try await deactivateAudioSession()
            return
        }

        // Create player
        let playerItem = AVPlayerItem(url: audioURL)
        player = AVPlayer(playerItem: playerItem)

        // Wait for playback to complete
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            playbackObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: playerItem,
                queue: .main
            ) { [weak self] _ in
                self?.removeObserver()
                continuation.resume()
            }

            // Also handle playback errors
            playerItem.addObserver(
                self as! NSObject,
                forKeyPath: "status",
                options: [.new],
                context: nil
            )

            player?.play()
        }

        // Deactivate session to let Spotify resume
        try await deactivateAudioSession()
    }

    /// Plays narration without waiting for completion (fire-and-forget)
    /// - Parameter clipPath: Relative path to audio file
    func playNarrationAsync(_ clipPath: String) {
        Task {
            try? await playNarration(clipPath)
        }
    }

    /// Stop any currently playing audio and deactivate the audio session
    func stopAudio() {
        removeObserver()
        player?.pause()
        player = nil

        // Deactivate session to let other audio resume
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    // MARK: - Private Helpers

    private func removeObserver() {
        if let observer = playbackObserver {
            NotificationCenter.default.removeObserver(observer)
            playbackObserver = nil
        }
    }

    private func deactivateAudioSession() async throws {
        try AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    /// Find audio file in bundle
    /// Tries multiple strategies to locate the file
    private func findAudioFile(_ clipPath: String) -> URL? {
        // Strategy 1: Try as full path within Audio/Stretching folder
        let components = clipPath.components(separatedBy: "/")
        let filename = components.last ?? clipPath
        let filenameWithoutExt = (filename as NSString).deletingPathExtension
        let ext = (filename as NSString).pathExtension

        // Try with full directory structure
        if let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: "Audio/Stretching/\(components.dropLast().joined(separator: "/"))"
        ) {
            return url
        }

        // Strategy 2: Try flat file in Audio/Stretching
        if let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: "Audio/Stretching"
        ) {
            return url
        }

        // Strategy 3: Try in Resources/Audio/Stretching
        if let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: "Resources/Audio/Stretching"
        ) {
            return url
        }

        // Strategy 4: Try just the filename anywhere in bundle
        if let url = Bundle.main.url(forResource: filenameWithoutExt, withExtension: ext) {
            return url
        }

        return nil
    }
}

// MARK: - Spotify Integration

extension StretchAudioManager {
    /// Open Spotify playlist via deep link
    /// - Parameter urlString: Spotify playlist URL (web or deep link format)
    @MainActor
    func openSpotifyPlaylist(_ urlString: String) {
        guard !urlString.isEmpty else { return }

        var spotifyURL: URL?

        // If it's already a spotify: deep link, use directly
        if urlString.hasPrefix("spotify:") {
            spotifyURL = URL(string: urlString)
        }
        // Convert web URL to deep link
        else if let url = URL(string: urlString) {
            // Handle https://open.spotify.com/playlist/abc or similar
            let pathComponents = url.pathComponents
            if pathComponents.count >= 3 {
                let type = pathComponents[1]  // "playlist", "album", "track"
                let id = pathComponents[2]
                spotifyURL = URL(string: "spotify:\(type):\(id)")
            }
        }

        // Try to open the Spotify app
        if let url = spotifyURL {
            // First check if Spotify is installed
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            } else {
                // Fallback to web URL
                if let webURL = URL(string: urlString) {
                    UIApplication.shared.open(webURL, options: [:], completionHandler: nil)
                }
            }
        }
    }
}
