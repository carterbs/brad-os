import AVFoundation

/// Manages AVAudioSession configuration for meditation playback
final class AudioSessionManager {
    static let shared = AudioSessionManager()

    private let session = AVAudioSession.sharedInstance()
    private var isConfigured = false
    private var interruptionObserver: NSObjectProtocol?

    /// Callback for audio interruptions
    var onInterruption: ((AVAudioSession.InterruptionType) -> Void)?

    private init() {
        setupInterruptionObserver()
    }

    deinit {
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Configuration

    /// Configure audio session for background meditation playback
    func configure() throws {
        guard !isConfigured else { return }

        // Configure for playback, mixing with other audio but ducking it
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers, .duckOthers]
        )
        isConfigured = true
    }

    /// Activate the audio session
    func activate() throws {
        try configure()
        try session.setActive(true)
    }

    /// Deactivate the audio session
    func deactivate() {
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("Failed to deactivate audio session: \(error)")
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
            // Audio was interrupted (e.g., phone call)
            print("Audio session interrupted")

        case .ended:
            // Interruption ended, check if we should resume
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    // Reactivate session
                    do {
                        try activate()
                    } catch {
                        print("Failed to reactivate audio session: \(error)")
                    }
                }
            }

        @unknown default:
            break
        }
    }
}
