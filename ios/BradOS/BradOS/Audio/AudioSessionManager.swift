import AVFoundation
import Foundation

/// Centralized audio session manager handling narration playback, other-audio interruption,
/// and session lifecycle. All narration playback across the app goes through `playNarration`,
/// which requests ducking/interrupt for other audio when it was already playing and restores
/// afterward (some apps pause instead of ducking).
final class AudioSessionManager {
    static let shared = AudioSessionManager()

    private let session = AVAudioSession.sharedInstance()
    private var isConfigured = false
    private var interruptionObserver: NSObjectProtocol?
    private static let logFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    // MARK: - Narration Playback State

    private var narrationPlayer: AVPlayer?
    private var narrationObserver: NSObjectProtocol?
    private var narrationContinuation: CheckedContinuation<Void, Error>?

    /// Callback for audio interruptions
    var onInterruption: ((AVAudioSession.InterruptionType) -> Void)?

    /// Whether other audio (Spotify, etc.) is currently playing.
    var isOtherAudioPlaying: Bool {
        session.isOtherAudioPlaying
    }

    private init() {
        setupInterruptionObserver()
    }

    deinit {
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        removeNarrationObserver()
    }

    // MARK: - Configuration

    /// Configure audio session for background playback with mixing (no interruption).
    /// Temporary interruption/ducking is applied only during narration via `playNarration`.
    func configure() throws {
        guard !isConfigured else { return }
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        isConfigured = true
    }

    /// Activate the audio session for mixing (no interruption)
    func activate() throws {
        try configure()
        try session.setActive(true)
    }

    /// Activate session for mixing without interruption.
    /// Between narration clips, background audio can play at full volume.
    func activateForMixing() throws {
        log("[AudioSession] Activating for mixing (.mixWithOthers, no ducking)")
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        try session.setActive(true)
        isConfigured = true
    }

    /// Deactivate the audio session
    func deactivate() {
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            log("[AudioSession] Failed to deactivate: \(error)")
        }
    }

    // MARK: - Narration Playback (with automatic interruption/ducking)

    /// Play narration audio from a URL with automatic interruption/ducking.
    /// Requests ducking/interrupt only if other audio was already playing,
    /// and restores only in that case.
    /// This is the single entry point for all narration across the app.
    func playNarration(url: URL) async throws {
        stopNarration()

        guard FileManager.default.fileExists(atPath: url.path) else {
            log("[AudioSession] Narration file not found: \(url.path)")
            return
        }

        log("[AudioSession] ========== NARRATION START ==========")
        log("[AudioSession] Playing: \(url.lastPathComponent)")

        let shouldDuckExternalAudio = session.isOtherAudioPlaying

        if shouldDuckExternalAudio {
            do {
                try enableDucking()
            } catch {
                log("[AudioSession] Failed to enable ducking: \(error)")
            }
        } else {
            log("[AudioSession] Skipping ducking (no other audio playing)")
            try? activateForMixing()
        }

        let playerItem = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: playerItem)
        narrationPlayer = player

        var playbackError: Error?
        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                narrationContinuation = continuation
                narrationObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: playerItem,
                    queue: .main
                ) { [weak self] _ in
                    self?.removeNarrationObserver()
                    let cont = self?.narrationContinuation
                    self?.narrationContinuation = nil
                    self?.log("[AudioSession] Narration playback COMPLETE")
                    cont?.resume()
                }
                player.play()
            }
        } catch {
            playbackError = error
        }

        if shouldDuckExternalAudio {
            do {
                try await restoreAfterDucking()
            } catch {
                log("[AudioSession] Failed to restore after ducking: \(error)")
            }
        }

        narrationPlayer = nil
        log("[AudioSession] ========== NARRATION END ==========")

        if let playbackError {
            throw playbackError
        }
    }

    /// Play narration audio from data (e.g. TTS API response) with automatic interruption/ducking.
    func playNarration(data: Data) async throws {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp3")
        try data.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }
        try await playNarration(url: tempURL)
    }

    /// Stop any currently playing narration and restore audio.
    func stopNarration() {
        removeNarrationObserver()
        narrationPlayer?.pause()
        narrationPlayer = nil
        // Resume any waiting continuation so callers don't hang
        let cont = narrationContinuation
        narrationContinuation = nil
        cont?.resume()
    }

    private func removeNarrationObserver() {
        if let observer = narrationObserver {
            NotificationCenter.default.removeObserver(observer)
            narrationObserver = nil
        }
    }

    // MARK: - Ducking (private)

    /// Enable other-audio interruption/ducking before narration.
    /// Uses voice prompt mode with ducking and mixing. Some apps pause instead of ducking.
    private func enableDucking() throws {
        log("[AudioSession] ENABLING ducking")
        try session.setCategory(
            .playback,
            mode: .voicePrompt,
            options: [.mixWithOthers, .duckOthers]
        )
        try session.setActive(true)
        log("[AudioSession] Ducking ENABLED - Spotify should lower volume now")
    }

    /// Restore other audio after narration, removing interruption/ducking.
    private func restoreAfterDucking() async throws {
        log("[AudioSession] RESTORING after ducking - deactivating with notification")
        try session.setActive(false, options: .notifyOthersOnDeactivation)

        // Give other audio apps a moment to resume before reactivating.
        let maxWaitNanos: UInt64 = 1_000_000_000
        let pollIntervalNanos: UInt64 = 200_000_000
        var waited: UInt64 = 0
        while !session.isOtherAudioPlaying && waited < maxWaitNanos {
            try? await Task.sleep(nanoseconds: pollIntervalNanos)
            waited += pollIntervalNanos
        }
        if session.isOtherAudioPlaying {
            log("[AudioSession] Other audio resumed before reactivation")
        } else {
            log("[AudioSession] Other audio still paused; reactivating anyway")
        }

        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        try session.setActive(true)
        log("[AudioSession] Ducking RESTORED - Spotify should return to full volume")
    }

    // MARK: - Interruption Handling

    private func setupInterruptionObserver() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
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

        onInterruption?(type)

        switch type {
        case .began:
            log("[AudioSession] Session interrupted")

        case .ended:
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    do {
                        try activate()
                    } catch {
                        log("[AudioSession] Failed to reactivate: \(error)")
                    }
                }
            }

        @unknown default:
            break
        }
    }

    private func log(_ message: String) {
        let timestamp = Self.logFormatter.string(from: Date())
        print("\(timestamp) \(message)")
    }
}
