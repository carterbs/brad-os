import AVFoundation
import Foundation

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    DO NOT MODIFY WITHOUT READING THIS                       ║
// ║                                                                             ║
// ║  This file controls ALL audio session behavior for the entire app.          ║
// ║  The category, mode, and options are carefully chosen to:                   ║
// ║                                                                             ║
// ║  1. Duck music and pause podcasts during narration                          ║
// ║     (.voicePrompt mode + .duckOthers + .interruptSpokenAudioAndMix)        ║
// ║                                                                             ║
// ║  2. Restore other apps' audio volume after narration finishes               ║
// ║     (setActive(false, .notifyOthersOnDeactivation))                        ║
// ║                                                                             ║
// ║  The session is configured once with ducking options, then activated/       ║
// ║  deactivated per narration clip (Organic Maps pattern). Screen stays on     ║
// ║  during stretch sessions via isIdleTimerDisabled — no keepalive needed.     ║
// ║                                                                             ║
// ║  WHAT WILL BREAK IF YOU CHANGE THINGS:                                      ║
// ║  - Removing .duckOthers: music blasts over narration                        ║
// ║  - Removing .interruptSpokenAudioAndMixWithOthers: podcasts garble          ║
// ║    under narration instead of pausing cleanly                               ║
// ║  - Removing .notifyOthersOnDeactivation: other apps stay ducked forever     ║
// ║  - Bypassing this manager (direct AVAudioSession calls): creates session    ║
// ║    conflicts, undefined ducking behavior, audio randomly stops              ║
// ║                                                                             ║
// ║  ALL audio session config in the app MUST go through this singleton.        ║
// ║  Do not call AVAudioSession.sharedInstance() directly from views,           ║
// ║  view models, or other services.                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/// Centralized audio session manager handling narration playback, other-audio ducking,
/// and session lifecycle. All narration playback across the app goes through `playNarration`,
/// which activates the session (ducking other audio), plays the clip, then deactivates
/// (restoring other audio volume).
final class AudioSessionManager {
    static let shared = AudioSessionManager()

    private let session = AVAudioSession.sharedInstance()
    private var isConfigured = false
    private var interruptionObserver: NSObjectProtocol?

    // MARK: - Narration Playback State

    private var narrationPlayer: AVPlayer?
    private var narrationObserver: NSObjectProtocol?
    private var narrationContinuation: CheckedContinuation<Void, Error>?

    /// Callback for audio interruptions
    var onInterruption: ((AVAudioSession.InterruptionType) -> Void)?

    /// Whether other audio (Spotify, etc.) is currently playing.
    /// Falls back to `secondaryAudioShouldBeSilencedHint` which is sometimes
    /// more reliable on the iOS Simulator.
    var isOtherAudioPlaying: Bool {
        session.isOtherAudioPlaying || session.secondaryAudioShouldBeSilencedHint
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

    /// Configure audio session for ducking playback.
    /// Sets the category once: .playback, .voicePrompt, with ducking options.
    /// Idempotent — safe to call multiple times.
    func configure() throws {
        guard !isConfigured else { return }
        NSLog("[AudioSession] configure() - .playback, .voicePrompt, .duckOthers + .interruptSpokenAudioAndMixWithOthers")
        try session.setCategory(
            .playback,
            mode: .voicePrompt,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        isConfigured = true
    }

    /// Activate the audio session
    func activate() throws {
        try configure()
        NSLog("[AudioSession] activate() - setActive(true)")
        try session.setActive(true)
    }

    /// Deactivate the audio session with notification to restore other apps' audio
    func deactivate() {
        NSLog("[AudioSession] deactivate() - notifyOthersOnDeactivation")
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            NSLog("[AudioSession] deactivate() - success")
        } catch {
            NSLog("[AudioSession] deactivate() - FAILED: %@", error.localizedDescription)
        }
    }

    // MARK: - Narration Playback (with automatic ducking)

    /// Play narration audio from a URL with automatic ducking.
    /// Activates the session (ducking other audio), plays the clip,
    /// then deactivates (restoring other audio volume).
    /// This is the single entry point for all narration across the app.
    func playNarration(url: URL) async throws {
        stopNarration()

        guard FileManager.default.fileExists(atPath: url.path) else {
            NSLog("[AudioSession] playNarration() - file not found: %@", url.path)
            return
        }

        NSLog("[AudioSession] ========== NARRATION START ==========")
        NSLog("[AudioSession] playNarration() - file: %@", url.lastPathComponent)

        // Activate session — this ducks other audio
        try activate()

        defer {
            NSLog("[AudioSession] ========== NARRATION END ==========")
        }

        let playbackError = await performPlayback(url: url)

        // Clear player I/O BEFORE deactivating — AVPlayer holds an audio unit open
        // even after playback finishes, which blocks setActive(false) from working.
        narrationPlayer?.replaceCurrentItem(with: nil)
        narrationPlayer = nil

        // Deactivate session — this restores other audio volume
        deactivate()

        if let playbackError {
            throw playbackError
        }
    }

    private func performPlayback(url: URL) async -> Error? {
        let playerItem = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: playerItem)
        narrationPlayer = player

        NSLog("[AudioSession] playNarration() - starting AVPlayer playback")

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                narrationContinuation = continuation
                narrationObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: playerItem,
                    queue: .main
                ) { [weak self] _ in
                    guard let self else { return }
                    self.removeNarrationObserver()
                    let cont = self.narrationContinuation
                    self.narrationContinuation = nil
                    NSLog("[AudioSession] playNarration() - playback COMPLETE")
                    cont?.resume()
                }
                player.play()
            }
            return nil
        } catch {
            NSLog("[AudioSession] playNarration() - playback ERROR: %@",
                  error.localizedDescription)
            return error
        }
    }

    /// Play narration audio from data (e.g. TTS API response) with automatic ducking.
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
            NSLog("[AudioSession] handleInterruption() - BEGAN")

        case .ended:
            NSLog("[AudioSession] handleInterruption() - ENDED")
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    NSLog("[AudioSession] handleInterruption() - shouldResume, reactivating")
                    do {
                        try activate()
                    } catch {
                        NSLog("[AudioSession] handleInterruption() - reactivation FAILED: %@",
                          error.localizedDescription)
                    }
                }
            }

        @unknown default:
            break
        }
    }
}
