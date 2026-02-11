import SwiftUI

/// Text to Speech view: enter text, tap Play, hear it spoken
struct TextToSpeechView: View {
    @StateObject private var viewModel = TextToSpeechViewModel()
    #if DEBUG
    @StateObject private var duckingHarness = DuckingTestHarness()
    #endif

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                textInputSection
                actionButtons
                errorSection
                #if DEBUG
                duckingTestSection
                #endif
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

    // MARK: - Ducking Test Harness (DEBUG only)

    #if DEBUG
    @ViewBuilder
    private var duckingTestSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Ducking Test Harness")

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Toggle(isOn: $duckingHarness.forceDucking) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Force Ducking")
                            .font(.subheadline)
                            .foregroundColor(Theme.textPrimary)
                        Text("Exercises ducking code path without external audio")
                            .font(.caption2)
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .tint(Theme.interactivePrimary)

                // Current session state
                VStack(alignment: .leading, spacing: 4) {
                    Text("Audio Session State")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(Theme.textSecondary)

                    HStack(spacing: Theme.Spacing.space2) {
                        Circle()
                            .fill(duckingHarness.isOtherAudioPlaying ? Theme.success : Theme.textTertiary)
                            .frame(width: 8, height: 8)
                        Text("Other Audio Playing: \(duckingHarness.isOtherAudioPlaying ? "Yes" : "No")")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }

                    HStack(spacing: Theme.Spacing.space2) {
                        Circle()
                            .fill(duckingHarness.forceDucking ? Theme.warning : Theme.textTertiary)
                            .frame(width: 8, height: 8)
                        Text("Force Ducking: \(duckingHarness.forceDucking ? "ON" : "OFF")")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                Divider().overlay(Theme.textTertiary.opacity(0.3))

                // Event log
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Event Log")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.textSecondary)
                        Spacer()
                        if !duckingHarness.events.isEmpty {
                            Button("Clear") {
                                duckingHarness.events.removeAll()
                            }
                            .font(.caption2)
                            .foregroundColor(Theme.interactivePrimary)
                        }
                    }

                    if duckingHarness.events.isEmpty {
                        Text("Tap Play to see ducking lifecycle events...")
                            .font(.caption2)
                            .foregroundColor(Theme.textTertiary)
                            .italic()
                    } else {
                        ForEach(Array(duckingHarness.events.enumerated()), id: \.offset) { _, event in
                            HStack(alignment: .top, spacing: 6) {
                                Text(event.icon)
                                    .font(.caption2)
                                Text("[\(event.formattedTime)] \(event.message)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(Theme.textSecondary)
                            }
                        }
                    }
                }
            }
            .padding(Theme.Spacing.space3)
            .glassCard(.card)
        }
    }
    #endif
}

// MARK: - Ducking Test Harness

#if DEBUG
@MainActor
final class DuckingTestHarness: ObservableObject {
    struct Event: Identifiable {
        let id = UUID()
        let timestamp: Date
        let message: String

        var icon: String {
            if message.contains("enableDucking") { return "🔉" }
            if message.contains("restore") { return "🔊" }
            if message.contains("playback: COMPLETE") { return "✅" }
            if message.contains("playback: starting") { return "▶️" }
            return "📋"
        }

        var formattedTime: String {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm:ss.SSS"
            return formatter.string(from: timestamp)
        }
    }

    @Published var forceDucking: Bool = false {
        didSet {
            AudioSessionManager.shared.forceDucking = forceDucking
        }
    }
    @Published var events: [Event] = []
    @Published var isOtherAudioPlaying: Bool = false

    private var pollTimer: Timer?

    init() {
        AudioSessionManager.shared.onDuckingEvent = { [weak self] message in
            Task { @MainActor [weak self] in
                self?.events.append(Event(timestamp: Date(), message: message))
            }
        }

        // Poll isOtherAudioPlaying every 2 seconds
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isOtherAudioPlaying = AudioSessionManager.shared.isOtherAudioPlaying
            }
        }
    }

    deinit {
        pollTimer?.invalidate()
        // Can't access AudioSessionManager here (non-sendable), cleaned up on next access
    }
}
#endif

#Preview {
    NavigationStack {
        TextToSpeechView()
    }
    .preferredColorScheme(.dark)
}
