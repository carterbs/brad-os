import AVFoundation
import Foundation

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    DO NOT MODIFY WITHOUT READING THIS                       ║
// ║                                                                             ║
// ║  This file controls ALL audio session behavior for the entire app.          ║
// ║  The category, mode, and options are carefully chosen to:                   ║
// ║                                                                             ║
// ║  1. Play audio in the background and with the screen locked                 ║
// ║     (.playback category + UIBackgroundModes audio in Info.plist)            ║
// ║                                                                             ║
// ║  2. Duck music and pause podcasts during narration                          ║
// ║     (.voicePrompt mode + .duckOthers + .interruptSpokenAudioAndMix)        ║
// ║                                                                             ║
// ║  3. Restore other apps' audio volume after narration finishes               ║
// ║     (setActive(false, .notifyOthersOnDeactivation) or category swap)       ║
// ║                                                                             ║
// ║  4. Keep the audio session alive on lock screen via keepalive players       ║
// ║     (backgroundSafe restore avoids deactivation that kills keepalive)       ║
// ║                                                                             ║
// ║  WHAT WILL BREAK IF YOU CHANGE THINGS:                                      ║
// ║  - Removing .duckOthers: music blasts over narration                        ║
// ║  - Removing .interruptSpokenAudioAndMixWithOthers: podcasts garble          ║
// ║    under narration instead of pausing cleanly                               ║
// ║  - Removing .mixWithOthers from restore: our app steals audio focus and     ║
// ║    kills Spotify/Music permanently                                          ║
// ║  - Removing .notifyOthersOnDeactivation: other apps stay ducked forever     ║
// ║  - Calling setActive(false) during backgroundSafe mode: kills keepalive,    ║
// ║    audio stops working on lock screen                                       ║
// ║  - Bypassing this manager (direct AVAudioSession calls): creates session    ║
// ║    conflicts, undefined ducking behavior, audio randomly stops              ║
// ║                                                                             ║
// ║  ALL audio session config in the app MUST go through this singleton.        ║
// ║  Do not call AVAudioSession.sharedInstance() directly from views,           ║
// ║  view models, or other services.                                            ║
// ║                                                                             ║
// ║  Test changes with the debug harness: Profile > Text to Speech >            ║
// ║  "Ducking Test Harness" section. Use Force Ducking + Playback Delay         ║
// ║  to verify background + ducking behavior on simulator.                      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/// Centralized audio session manager handling narration playback, other-audio interruption,
/// and session lifecycle. All narration playback across the app goes through `playNarration`,
/// which requests ducking/interrupt for other audio when it was already playing and restores
/// afterward (some apps pause instead of ducking).
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

    /// Callback fired on every ducking lifecycle event (for debug harness).
    var onDuckingEvent: ((String) -> Void)?

    #if DEBUG
    /// When true, forces the ducking code path even when no external audio is playing.
    /// Toggle this from the TTS debug harness to verify ducking without needing Safari/Music.
    var forceDucking: Bool = false
    #endif

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

    /// Configure audio session for background playback with mixing (no interruption).
    /// Temporary interruption/ducking is applied only during narration via `playNarration`.
    func configure() throws {
        guard !isConfigured else { return }
        NSLog("[AudioSession] configure() - setting .playback, .mixWithOthers")
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
        NSLog("[AudioSession] activate() - setActive(true)")
        try session.setActive(true)
    }

    /// Activate session for mixing without interruption.
    /// Between narration clips, background audio can play at full volume.
    func activateForMixing() throws {
        NSLog("[AudioSession] activateForMixing() - .playback, .mixWithOthers, setActive(true)")
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
        NSLog("[AudioSession] deactivate() - notifyOthersOnDeactivation")
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            NSLog("[AudioSession] deactivate() - success")
        } catch {
            NSLog("[AudioSession] deactivate() - FAILED: %@", error.localizedDescription)
        }
    }

    // MARK: - Narration Playback (with automatic interruption/ducking)

    /// Play narration audio from a URL with automatic interruption/ducking.
    /// Requests ducking/interrupt only if other audio was already playing,
    /// and restores only in that case.
    /// This is the single entry point for all narration across the app.
    /// - Parameters:
    ///   - url: File URL to the audio file
    ///   - backgroundSafe: When true and ducking was used, restores by changing category options
    ///     instead of deactivating the session. This prevents killing keepalive audio on lock screen.
    func playNarration(url: URL, backgroundSafe: Bool = false) async throws {
        stopNarration()

        guard FileManager.default.fileExists(atPath: url.path) else {
            NSLog("[AudioSession] playNarration() - file not found: %@", url.path)
            return
        }

        NSLog("[AudioSession] ========== NARRATION START ==========")
        NSLog("[AudioSession] playNarration() - file: %@, backgroundSafe: %@", url.lastPathComponent, backgroundSafe ? "true" : "false")

        #if DEBUG
        let shouldDuckExternalAudio = session.isOtherAudioPlaying || forceDucking
        #else
        let shouldDuckExternalAudio = session.isOtherAudioPlaying
        #endif
        NSLog("[AudioSession] playNarration() - isOtherAudioPlaying: %@, silencedHint: %@, willDuck: %@",
              session.isOtherAudioPlaying ? "true" : "false",
              session.secondaryAudioShouldBeSilencedHint ? "true" : "false",
              shouldDuckExternalAudio ? "true" : "false")

        if shouldDuckExternalAudio {
            do {
                try enableDucking()
            } catch {
                NSLog("[AudioSession] playNarration() - failed to enable ducking: %@", error.localizedDescription)
            }
        } else {
            NSLog("[AudioSession] playNarration() - no other audio, activating for mixing")
            try? activateForMixing()
        }

        // Ensure ducking is always restored even on error/cancellation (backgroundSafe path only;
        // the async restoreAfterDucking path is handled after the do/catch below).
        defer {
            if shouldDuckExternalAudio && backgroundSafe {
                NSLog("[AudioSession] playNarration() - defer: backgroundSafe restore")
                try? restoreAfterDuckingBackgroundSafe()
            }
            narrationPlayer = nil
            NSLog("[AudioSession] ========== NARRATION END ==========")
        }

        let playerItem = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: playerItem)
        narrationPlayer = player

        NSLog("[AudioSession] playNarration() - starting AVPlayer playback")
        onDuckingEvent?("playback: starting AVPlayer")

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
                    NSLog("[AudioSession] playNarration() - playback COMPLETE")
                    self?.onDuckingEvent?("playback: COMPLETE")
                    cont?.resume()
                }
                player.play()
            }
        } catch {
            NSLog("[AudioSession] playNarration() - playback ERROR: %@", error.localizedDescription)
            playbackError = error
        }

        // Async restoration for non-backgroundSafe mode (can't go in defer)
        if shouldDuckExternalAudio && !backgroundSafe {
            do {
                try await restoreAfterDucking()
            } catch {
                NSLog("[AudioSession] playNarration() - restore after ducking FAILED: %@", error.localizedDescription)
            }
        }

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
    // WARNING: The exact combination of category/mode/options below was carefully researched
    // and tested. Changing ANY option will break ducking, background audio, or both.
    // See thoughts/shared/ios-audio-ducking-research.md for the full rationale.

    /// Enable other-audio interruption/ducking before narration.
    /// Uses voice prompt mode with ducking and mixing. Some apps pause instead of ducking.
    private func enableDucking() throws {
        NSLog("[AudioSession] enableDucking() - .voicePrompt, .duckOthers + .interruptSpokenAudioAndMixWithOthers")
        onDuckingEvent?("enableDucking: .voicePrompt + .duckOthers + .interruptSpokenAudio")
        try session.setCategory(
            .playback,
            mode: .voicePrompt,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try session.setActive(true)
        NSLog("[AudioSession] enableDucking() - DONE, music ducked / spoken audio paused")
        onDuckingEvent?("enableDucking: DONE - external audio should be ducked")
    }

    /// Restore other audio after narration WITHOUT deactivating the session.
    /// This is safe for background/lock screen use — it just removes ducking options
    /// so other audio returns to full volume, without killing our keepalive player.
    private func restoreAfterDuckingBackgroundSafe() throws {
        NSLog("[AudioSession] restoreAfterDuckingBackgroundSafe() - removing duckOthers, keeping session active")
        onDuckingEvent?("restoreBackgroundSafe: removing .duckOthers, keeping session active")
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        NSLog("[AudioSession] restoreAfterDuckingBackgroundSafe() - DONE, Spotify should return to full volume")
        onDuckingEvent?("restoreBackgroundSafe: DONE - external audio should be full volume")
    }

    /// Restore other audio after narration, removing interruption/ducking.
    /// WARNING: This deactivates the session which can kill keepalive audio.
    /// Use restoreAfterDuckingBackgroundSafe() when background audio must survive.
    private func restoreAfterDucking() async throws {
        NSLog("[AudioSession] restoreAfterDucking() - deactivating with notification")
        onDuckingEvent?("restoreAfterDucking: deactivating with .notifyOthersOnDeactivation")
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
            NSLog("[AudioSession] restoreAfterDucking() - other audio resumed")
        } else {
            NSLog("[AudioSession] restoreAfterDucking() - other audio still paused, reactivating anyway")
        }

        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        try session.setActive(true)
        NSLog("[AudioSession] restoreAfterDucking() - DONE, Spotify should return to full volume")
        onDuckingEvent?("restoreAfterDucking: DONE - reactivated with .mixWithOthers")
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
                        NSLog("[AudioSession] handleInterruption() - reactivation FAILED: %@", error.localizedDescription)
                    }
                }
            }

        @unknown default:
            break
        }
    }
}
