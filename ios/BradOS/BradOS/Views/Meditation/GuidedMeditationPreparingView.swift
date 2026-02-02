import SwiftUI
import BradOSCore

struct GuidedMeditationPreparingView: View {
    let script: GuidedMeditationScript
    let onReady: ([PreparedAudioSegment], [ResolvedInterjection]) -> Void
    let onCancel: () -> Void

    @StateObject private var service = GuidedMeditationService.shared
    @State private var error: Error?

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            Image(systemName: "waveform")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.meditation)
                .symbolEffect(.variableColor.iterative, isActive: error == nil)

            Text(script.title)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)
                .multilineTextAlignment(.center)

            if let error = error {
                // Error state
                VStack(spacing: Theme.Spacing.space4) {
                    Text("Preparation failed")
                        .font(.headline)
                        .foregroundColor(Theme.warning)
                    Text(error.localizedDescription)
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)

                    Button("Retry") {
                        self.error = nil
                        prepareAudio()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
            } else {
                // Progress state
                VStack(spacing: Theme.Spacing.space4) {
                    Text("Preparing meditation...")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)

                    ProgressView(value: service.preparationProgress)
                        .tint(Theme.meditation)
                        .padding(.horizontal, Theme.Spacing.space8)

                    Text("\(Int(service.preparationProgress * 100))%")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .monospacedDigit()
                }
            }

            Spacer()

            Button(action: onCancel) {
                Text("Cancel")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .padding(Theme.Spacing.space4)
        .onAppear {
            prepareAudio()
        }
    }

    private func prepareAudio() {
        Task {
            do {
                // Load full script with segments if needed
                let fullScript: GuidedMeditationScript
                if script.segments != nil {
                    fullScript = script
                } else {
                    fullScript = try await service.loadFullScript(id: script.id)
                }

                let (segments, interjections) = try await service.prepareAudio(for: fullScript)
                onReady(segments, interjections)
            } catch {
                self.error = error
            }
        }
    }
}
