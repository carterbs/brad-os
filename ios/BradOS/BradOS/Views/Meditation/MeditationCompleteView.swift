import SwiftUI
import BradOSCore

/// Meditation session completion view
struct MeditationCompleteView: View {
    let session: MeditationSession
    var meditationTitle: String = "Meditation"
    let isSaving: Bool
    let saveError: Error?
    let onDone: () -> Void
    let onStartAnother: () -> Void
    let onRetrySync: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Success icon
            Image(systemName: session.completedFully ? "checkmark.circle.fill" : "clock.badge.checkmark.fill")
                .font(.system(size: Theme.Typography.iconXXL))
                .foregroundColor(Theme.meditation)

            Text(session.completedFully ? "Well Done!" : "Session Ended")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text(meditationTitle)
                .font(.headline)
                .foregroundColor(Theme.meditation)

            Text(session.completedFully
                 ? "You completed your meditation session."
                 : "You meditated for \(session.formattedActualDuration).")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            // Stats
            VStack(spacing: Theme.Spacing.space4) {
                StatRow(label: "Session", value: meditationTitle)
                StatRow(label: "Planned Duration", value: session.formattedPlannedDuration)
                StatRow(label: "Actual Duration", value: session.formattedActualDuration)
                StatRow(label: "Completed", value: session.completedFully ? "Yes" : "Ended Early")
            }
            .glassCard()

            // Sync Status
            syncStatusView

            Spacer()

            // Actions
            VStack(spacing: Theme.Spacing.space4) {
                Button(action: onDone) {
                    Text("Done")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())

                Button(action: onStartAnother) {
                    Text("Start Another Session")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(Theme.Spacing.space4)
    }

    // MARK: - Sync Status

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: Theme.Spacing.space2) {
            if isSaving {
                ProgressView()
                    .tint(Theme.meditation)
                Text("Saving session...")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            } else if saveError != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Theme.warning)
                Text("Failed to save")
                    .font(.caption)
                    .foregroundColor(Theme.warning)
                Button("Retry", action: onRetrySync)
                    .font(.caption)
                    .foregroundColor(Theme.interactivePrimary)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Theme.success)
                Text("Session saved")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.space2)
    }
}
