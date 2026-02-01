import SwiftUI

/// Component for managing iOS notification settings
/// Shows permission state and provides enable/test/recovery actions
struct NotificationSettingsView: View {
    @State private var notificationManager = NotificationManager.shared
    @State private var isEnabling = false
    @State private var isTesting = false
    @State private var showTestConfirmation = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            statusRow

            if notificationManager.canRequest {
                Divider().background(Theme.divider)
                enableButton
            }

            if notificationManager.isAuthorized {
                Divider().background(Theme.divider)
                testButton
            }

            if notificationManager.isDenied {
                Divider().background(Theme.divider)
                deniedInstructions
            }

            if let error = error {
                Divider().background(Theme.divider)
                errorBanner(error)
            }

            if showTestConfirmation {
                Divider().background(Theme.divider)
                confirmationBanner
            }
        }
        .glassCard(.card, padding: 0)
        .task {
            await notificationManager.refreshAuthorizationStatus()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task {
                await notificationManager.refreshAuthorizationStatus()
            }
        }
    }

    // MARK: - Status Row

    @ViewBuilder
    private var statusRow: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: statusIconName)
                .foregroundColor(statusColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text("Notifications")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                Text(statusText)
                    .font(.footnote)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)
        }
        .padding(Theme.Spacing.space4)
    }

    private var statusIconName: String {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "bell.fill"
        case .denied:
            return "bell.slash.fill"
        case .notDetermined:
            return "bell.badge.fill"
        @unknown default:
            return "bell.fill"
        }
    }

    private var statusColor: Color {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return Theme.success
        case .denied:
            return Theme.destructive
        case .notDetermined:
            return Theme.warning
        @unknown default:
            return Theme.textSecondary
        }
    }

    private var statusText: String {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "Notifications enabled"
        case .denied:
            return "Notifications blocked"
        case .notDetermined:
            return "Notifications not set up"
        @unknown default:
            return "Unknown status"
        }
    }

    // MARK: - Enable Button

    @ViewBuilder
    private var enableButton: some View {
        Button {
            Task {
                isEnabling = true
                error = nil
                let granted = await notificationManager.requestAuthorization()
                isEnabling = false
                if !granted {
                    error = "Permission was not granted"
                }
            }
        } label: {
            HStack {
                if isEnabling {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Image(systemName: "bell.badge")
                    Text("Enable Notifications")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.space4)
            .foregroundColor(Theme.interactivePrimary)
        }
        .disabled(isEnabling)
    }

    // MARK: - Test Button

    @ViewBuilder
    private var testButton: some View {
        Button {
            Task {
                isTesting = true
                error = nil
                showTestConfirmation = false

                do {
                    try await notificationManager.scheduleTestNotification()
                    showTestConfirmation = true
                    try? await Task.sleep(for: .seconds(5))
                    showTestConfirmation = false
                } catch {
                    self.error = "Failed to schedule notification"
                }

                isTesting = false
            }
        } label: {
            HStack {
                Image(systemName: "paperplane.fill")
                if isTesting {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Send Test Notification")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.space4)
            .foregroundColor(Theme.interactivePrimary)
        }
        .disabled(isTesting)
    }

    // MARK: - Denied Instructions

    @ViewBuilder
    private var deniedInstructions: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("To enable notifications:")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            Text("1. Open Settings\n2. Tap BradOS\n3. Tap Notifications\n4. Enable Allow Notifications")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            } label: {
                HStack {
                    Image(systemName: "gear")
                    Text("Open Settings")
                }
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(Theme.interactivePrimary)
            }
            .padding(.top, Theme.Spacing.space1)
        }
        .padding(Theme.Spacing.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.destructive.opacity(0.10))
    }

    // MARK: - Banners

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(Theme.destructive)
            Text(message)
                .font(.caption)
                .foregroundColor(Theme.destructive)
            Spacer()
            Button {
                error = nil
            } label: {
                Image(systemName: "xmark")
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.destructive.opacity(0.10))
    }

    @ViewBuilder
    private var confirmationBanner: some View {
        HStack {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(Theme.success)
            Text("Test notification scheduled! Check in 5 seconds.")
                .font(.caption)
                .foregroundColor(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.success.opacity(0.10))
    }
}

#Preview("Not Determined") {
    VStack {
        NotificationSettingsView()
    }
    .padding(Theme.Spacing.space5)
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
