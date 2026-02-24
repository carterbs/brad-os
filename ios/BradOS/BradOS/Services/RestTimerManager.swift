import AVFoundation
import Foundation
import UserNotifications

/// Manages the rest timer between sets with background support and audio notifications
final class RestTimerManager: ObservableObject {
    // MARK: - Published State

    @Published private(set) var isActive = false
    @Published private(set) var elapsedSeconds: Int = 0
    @Published private(set) var targetSeconds: Int = 0
    @Published private(set) var isComplete = false

    // MARK: - Timer State

    private var startedAt: Date?
    private var timer: Timer?
    private var audioPlayer: AVAudioPlayer?

    // MARK: - Public Methods

    /// Start a new rest timer
    func start(targetSeconds: Int) {
        // Stop any existing timer
        dismiss()

        self.targetSeconds = targetSeconds
        self.startedAt = Date()
        self.elapsedSeconds = 0
        self.isComplete = false
        self.isActive = true

        scheduleLocalNotification(in: targetSeconds)
        startTimer()
        configureAudioSession()
    }

    /// Restore a timer from persisted state
    func restore(startedAt: Date, targetSeconds: Int) {
        self.targetSeconds = targetSeconds
        self.startedAt = startedAt
        self.elapsedSeconds = Int(Date().timeIntervalSince(startedAt))
        self.isComplete = elapsedSeconds >= targetSeconds
        self.isActive = true

        // Only schedule notification if timer hasn't completed
        if !isComplete {
            let remaining = targetSeconds - elapsedSeconds
            if remaining > 0 {
                scheduleLocalNotification(in: remaining)
            }
        }

        startTimer()
    }

    /// Dismiss the timer
    func dismiss() {
        stopTimer()
        cancelNotification()
        isActive = false
        isComplete = false
        elapsedSeconds = 0
        targetSeconds = 0
        startedAt = nil
    }

    /// Handle app returning to foreground
    func handleForeground() {
        guard isActive, let startedAt = startedAt else { return }
        elapsedSeconds = Int(Date().timeIntervalSince(startedAt))
        if elapsedSeconds >= targetSeconds && !isComplete {
            isComplete = true
            // Don't play sound here - notification would have played it
        }
    }

    /// Request notification authorization
    static func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            #if DEBUG
            if let error = error {
                DebugLogger.error("Notification auth error: \(error)", attributes: ["source": "RestTimerManager"])
            } else {
                DebugLogger.info("Notification auth granted: \(granted)", attributes: ["source": "RestTimerManager"])
            }
            #endif
        }
    }

    // MARK: - Private Methods

    private func startTimer() {
        let newTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
        timer = newTimer
        // Ensure timer runs on main run loop mode for background support
        RunLoop.current.add(newTimer, forMode: .common)
    }

    private func tick() {
        guard let startedAt = startedAt else { return }
        elapsedSeconds = Int(Date().timeIntervalSince(startedAt))

        if elapsedSeconds >= targetSeconds && !isComplete {
            isComplete = true
            playCompletionSound()
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func configureAudioSession() {
        do {
            try AudioSessionManager.shared.configure()
            try AudioSessionManager.shared.activate()
        } catch {
            DebugLogger.error("Failed to configure audio session: \(error)", attributes: ["source": "RestTimerManager"])
        }
    }

    private func playCompletionSound() {
        // Try to play a custom sound, fall back to system sound
        if let soundURL = Bundle.main.url(forResource: "timer_complete", withExtension: "wav") {
            do {
                audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
                audioPlayer?.play()
                return
            } catch {
                DebugLogger.error("Failed to play custom sound: \(error)", attributes: ["source": "RestTimerManager"])
            }
        }

        // Fall back to system sound
        AudioServicesPlaySystemSound(1007) // Standard "tweet" sound
    }

    private func scheduleLocalNotification(in seconds: Int) {
        guard seconds > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Rest Complete"
        content.body = "Time for your next set!"
        content.sound = .default
        content.badge = 1

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: Double(seconds),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: "restTimer",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            #if DEBUG
            if let error = error {
                DebugLogger.error("Failed to schedule notification: \(error)", attributes: ["source": "RestTimerManager"])
            }
            #endif
        }
    }

    private func cancelNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: ["restTimer"]
        )
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: ["restTimer"]
        )
        // Clear badge
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }
}
