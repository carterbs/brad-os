import AVFoundation
import Combine
import Foundation

/// Audio engine for meditation playback managing narration, bell, and keepalive
final class MeditationAudioEngine: ObservableObject {
    static let shared = MeditationAudioEngine()

    // MARK: - Audio Players

    private var keepalivePlayer: AVAudioPlayer?

    // MARK: - State

    private var isInitialized = false
    private let audioSession = AudioSessionManager.shared
    private static let logFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    // MARK: - Initialization

    init() {
        setupInterruptionHandler()
    }

    private func setupInterruptionHandler() {
        audioSession.onInterruption = { [weak self] type in
            switch type {
            case .began:
                break
            case .ended:
                // Will be handled by the view to resume if needed
                break
            @unknown default:
                break
            }
        }
    }

    /// Initialize the audio engine (call during user gesture to ensure audio works)
    func initialize() async throws {
        guard !isInitialized else { return }

        // Configure and activate audio session (ducking happens per narration clip)
        try audioSession.configure()
        try audioSession.activate()

        // Setup keepalive with silence
        try setupKeepalive()

        isInitialized = true
    }

    // MARK: - Audio File Resolution

    /// Get URL for an audio file, checking bundle first
    /// Paths come from manifest like "sessions/basic-breathing/intro-welcome.wav" or "shared/bell.wav"
    /// Files are stored in Audio/meditation/...
    private func getAudioURL(for path: String) -> URL? {
        let components = path.components(separatedBy: "/")
        let filename = components.last ?? path
        let filenameWithoutExt = (filename as NSString).deletingPathExtension
        let ext = (filename as NSString).pathExtension.isEmpty ? "wav" : (filename as NSString).pathExtension

        // Build subdirectory path: Audio/meditation/{folder}
        let folder = components.count > 1 ? components.dropLast().joined(separator: "/") : ""
        let subdirectory = folder.isEmpty ? "Audio/meditation" : "Audio/meditation/\(folder)"

        // Try in the expected location
        if let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: subdirectory
        ) {
            #if DEBUG
            log("[MeditationAudioEngine] Found audio: \(path) at \(url.path)")
            #endif
            return url
        }

        // Fallback: Try just the filename anywhere in bundle
        if let url = Bundle.main.url(forResource: filenameWithoutExt, withExtension: ext) {
            #if DEBUG
            log("[MeditationAudioEngine] Found audio (fallback): \(path) at \(url.path)")
            #endif
            return url
        }

        #if DEBUG
        log("[MeditationAudioEngine] Audio file not found: \(path) (looked in \(subdirectory))")
        #endif
        return nil
    }

    // MARK: - Narration Playback

    /// Play a narration audio file (interruption/ducking handled by AudioSessionManager)
    func playNarration(file: String) async throws {
        guard let url = getAudioURL(for: file) else {
            log("[MeditationAudioEngine] Audio file not found: \(file)")
            return
        }

        let shouldPauseKeepalive = (keepalivePlayer?.isPlaying ?? false) && audioSession.isOtherAudioPlaying
        if shouldPauseKeepalive {
            stopKeepalive()
        }
        defer {
            if shouldPauseKeepalive {
                startKeepalive()
            }
        }

        try await audioSession.playNarration(url: url)
    }

    /// Stop any playing narration
    func stopNarration() {
        audioSession.stopNarration()
    }

    // MARK: - Bell Sound

    /// Play the meditation bell (interruption/ducking handled by AudioSessionManager)
    func playBell() async throws {
        guard let bellURL = getAudioURL(for: "shared/bell.wav") else {
            log("[MeditationAudioEngine] Bell sound not available")
            return
        }
        let shouldPauseKeepalive = (keepalivePlayer?.isPlaying ?? false) && audioSession.isOtherAudioPlaying
        if shouldPauseKeepalive {
            stopKeepalive()
        }
        defer {
            if shouldPauseKeepalive {
                startKeepalive()
            }
        }
        try await audioSession.playNarration(url: bellURL)
    }

    // MARK: - Keepalive

    /// Setup the keepalive player with silent audio
    private func setupKeepalive() throws {
        // Try to find silence file in bundle
        if let silenceURL = getAudioURL(for: "shared/silence.wav") {
            keepalivePlayer = try AVAudioPlayer(contentsOf: silenceURL)
            keepalivePlayer?.numberOfLoops = -1  // Loop indefinitely
            keepalivePlayer?.volume = 0.01  // Nearly silent but enough to keep session alive
            keepalivePlayer?.prepareToPlay()
        } else {
            // Generate silence programmatically if no file available
            try generateSilentKeepalive()
        }
    }

    /// Generate a silent audio buffer for keepalive
    private func generateSilentKeepalive() throws {
        // Keepalive audio generation is not yet implemented.
        // The app will still work but background audio might stop.
        keepalivePlayer = nil
    }

    /// Start the keepalive loop for background playback
    func startKeepalive() {
        keepalivePlayer?.play()
    }

    /// Stop the keepalive loop
    func stopKeepalive() {
        keepalivePlayer?.stop()
    }

    // MARK: - Pause/Resume

    /// Pause all audio playback
    func pause() {
        audioSession.stopNarration()
        keepalivePlayer?.pause()
    }

    /// Resume audio playback
    func resume() {
        keepalivePlayer?.play()
        // Don't resume narration - let the cue scheduler handle it
    }

    // MARK: - Cleanup

    /// Stop all audio immediately (for early session end)
    func stopAll() {
        stopNarration()
        stopKeepalive()
    }

    private func log(_ message: String) {
        let timestamp = Self.logFormatter.string(from: Date())
        DebugLogger.info("\(timestamp) \(message)")
    }
}
