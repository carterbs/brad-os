import Foundation
import UserNotifications

/// Manager for iOS notification permissions and scheduling
/// Uses @Observable macro for reactive state updates
@Observable
class NotificationManager {
    // MARK: - Singleton

    static let shared = NotificationManager()

    // MARK: - Observable State

    /// Current authorization status from the system
    var authorizationStatus: UNAuthorizationStatus = .notDetermined

    // MARK: - Computed Properties

    /// Whether notifications are fully authorized
    var isAuthorized: Bool {
        authorizationStatus == .authorized
    }

    /// Whether notifications have been denied
    var isDenied: Bool {
        authorizationStatus == .denied
    }

    /// Whether we can request permission (not yet determined)
    var canRequest: Bool {
        authorizationStatus == .notDetermined
    }

    // MARK: - Initialization

    private init() {
        // Initial status check on creation
        Task {
            await refreshAuthorizationStatus()
        }
    }

    // MARK: - Authorization

    /// Refresh the current authorization status from the system
    @MainActor
    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        self.authorizationStatus = settings.authorizationStatus
    }

    /// Request notification permission from the user
    /// Returns true if permission was granted
    @MainActor
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            await refreshAuthorizationStatus()
            return granted
        } catch {
            DebugLogger.error("Failed to request authorization: \(error)", attributes: ["source": "NotificationManager"])
            return false
        }
    }

    // MARK: - Test Notification

    /// Schedule a test notification for 5 seconds from now
    func scheduleTestNotification() async throws {
        let content = UNMutableNotificationContent()
        content.title = "Test Notification"
        content.body = "Your notifications are working!"
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let request = UNNotificationRequest(
            identifier: "test-notification-\(UUID().uuidString)",
            content: content,
            trigger: trigger
        )

        try await UNUserNotificationCenter.current().add(request)
    }
}
