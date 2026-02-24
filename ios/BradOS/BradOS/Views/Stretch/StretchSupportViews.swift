import SwiftUI
import BradOSCore

// MARK: - App Return Wait View

/// View shown while waiting for user to return to the app
/// Shows different messaging based on whether Spotify was configured
struct AppReturnWaitView: View {
    let hasSpotify: Bool
    let onStartNow: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Icon
            Image(systemName: hasSpotify ? "music.note.list" : "figure.flexibility")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.stretch)

            Text(hasSpotify ? "Opening Spotify..." : "Get Ready!")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text(hasSpotify
                ? "Come back here when your music is playing"
                : "Switch away to start your music, then come back")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Spacer()

            // Start now button
            Button(action: onStartNow) {
                Text("Start Now")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.horizontal, Theme.Spacing.space4)
            .padding(.bottom, Theme.Spacing.space7)
        }
        .padding(Theme.Spacing.space4)
    }
}

// MARK: - Array Extension

extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Preparation View

/// View shown while TTS audio is being prepared before session starts
struct StretchPreparationView: View {
    @ObservedObject var audioPreparer: StretchAudioService
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            Image(systemName: "waveform")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.stretch)

            Text("Preparing Audio...")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            VStack(spacing: Theme.Spacing.space2) {
                ProgressView(value: audioPreparer.progress)
                    .tint(Theme.stretch)
                    .padding(.horizontal, Theme.Spacing.space7)

                Text("\(Int(audioPreparer.progress * 100))%")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .monospacedDigit()
            }

            if audioPreparer.error != nil {
                Text("Some audio could not be prepared. The session will continue without those cues.")
                    .font(.caption)
                    .foregroundColor(Theme.warning)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()

            Button(action: onCancel) {
                Text("Cancel")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.horizontal, Theme.Spacing.space4)
            .padding(.bottom, Theme.Spacing.space7)
        }
        .padding(Theme.Spacing.space4)
    }
}
