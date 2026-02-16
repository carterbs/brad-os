import SwiftUI
import BradOSCore

// MARK: - Floating Action Button Views

extension WorkoutView {

    @ViewBuilder
    var pendingActionButtons: some View {
        HStack(spacing: Theme.Spacing.space4) {
            Button(
                action: { Task { await startWorkout() } },
                label: {
                    HStack {
                        if isStarting {
                            ProgressView()
                                .tint(Theme.textOnAccent)
                        } else {
                            Image(systemName: "play.fill")
                        }
                        Text("Start Workout")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.space2)
                }
            )
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isStarting)

            skipButton
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.bottom, Theme.Spacing.space4)
    }

    @ViewBuilder
    var inProgressActionButtons: some View {
        HStack(spacing: Theme.Spacing.space4) {
            Button(
                action: { showingCompleteAlert = true },
                label: {
                    HStack {
                        if isCompleting {
                            ProgressView()
                                .tint(Theme.textOnAccent)
                        } else {
                            Image(systemName: "checkmark")
                        }
                        Text("Complete")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.space2)
                }
            )
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isCompleting)

            skipButton
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.bottom, Theme.Spacing.space4)
    }

    @ViewBuilder
    private var skipButton: some View {
        Button(
            action: { showingSkipAlert = true },
            label: {
                Text("Skip")
                    .padding(.horizontal, Theme.Spacing.space4)
                    .padding(.vertical, Theme.Spacing.space2)
            }
        )
        .buttonStyle(GlassSecondaryButtonStyle())
        .disabled(isSkipping)
    }
}
