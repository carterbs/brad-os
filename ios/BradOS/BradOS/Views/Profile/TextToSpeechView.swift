import SwiftUI

/// Text to Speech view: enter text, tap Play, hear it spoken
struct TextToSpeechView: View {
    @StateObject private var viewModel = TextToSpeechViewModel()

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                textInputSection
                actionButtons
                errorSection
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Text to Speech")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    // MARK: - Text Input

    @ViewBuilder
    private var textInputSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Text")

            ZStack(alignment: .topLeading) {
                TextEditor(text: $viewModel.text)
                    .scrollContentBackground(.hidden)
                    .font(.body)
                    .foregroundColor(Theme.textPrimary)
                    .frame(minHeight: 160)
                    .padding(Theme.Spacing.space3)
                    .disabled(viewModel.state != .idle)

                if viewModel.text.isEmpty {
                    Text("Enter text to speak aloud...")
                        .font(.body)
                        .foregroundColor(Theme.textTertiary)
                        .padding(Theme.Spacing.space3)
                        .padding(.top, 8)
                        .padding(.leading, 4)
                        .allowsHitTesting(false)
                }
            }
            .glassCard(.card)
        }
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private var actionButtons: some View {
        switch viewModel.state {
        case .idle:
            Button {
                viewModel.generateAndPlay()
            } label: {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "play.fill")
                    Text("Play")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(!viewModel.canPlay)
            .opacity(viewModel.canPlay ? 1.0 : 0.5)

        case .generating:
            Button {} label: {
                HStack(spacing: Theme.Spacing.space2) {
                    ProgressView()
                        .tint(Theme.textPrimary)
                    Text("Generating...")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
            .disabled(true)

        case .playing:
            Button {
                viewModel.stop()
            } label: {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "stop.fill")
                    Text("Stop")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
        }
    }

    // MARK: - Error Display

    @ViewBuilder
    private var errorSection: some View {
        if let error = viewModel.errorMessage {
            HStack(spacing: Theme.Spacing.space3) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Theme.destructive)
                Text(error)
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(Theme.Spacing.space4)
            .glassCard(.card)
        }
    }
}

#Preview {
    NavigationStack {
        TextToSpeechView()
    }
    .preferredColorScheme(.dark)
}
