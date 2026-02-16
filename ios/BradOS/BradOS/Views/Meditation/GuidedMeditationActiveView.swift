import SwiftUI
import UIKit
import AVFoundation
import BradOSCore

struct GuidedMeditationActiveView: View {
    let script: GuidedMeditationScript
    let preparedSegments: [PreparedAudioSegment]
    let resolvedInterjections: [ResolvedInterjection]
    let onComplete: (MeditationSession) -> Void
    let onCancel: () -> Void

    @Environment(\.scenePhase) var scenePhase

    @StateObject private var pipeline = GuidedMeditationPipeline()

    @State private var showEndConfirmation = false
    @State private var sessionStartTime = Date()

    private let impactGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let notificationGenerator = UINotificationFeedbackGenerator()
    private let nowPlaying = NowPlayingManager.shared
    private let storage = MeditationStorage.shared

    private var totalDuration: TimeInterval {
        TimeInterval(script.durationSeconds)
    }

    private var remainingSeconds: Int {
        max(0, Int(totalDuration - pipeline.elapsedSeconds))
    }

    private var formattedTime: String {
        let minutes = remainingSeconds / 60
        let seconds = remainingSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    /// Display name for current phase
    private var phaseDisplayName: String {
        switch pipeline.currentPhase {
        case "opening": return "Opening"
        case "teachings": return "Teachings"
        case "closing": return "Closing"
        case "complete": return "Complete"
        default: return "Silence"
        }
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Timer
            VStack(spacing: Theme.Spacing.space2) {
                Text(formattedTime)
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                Text("remaining")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            // Phase indicator
            VStack(spacing: Theme.Spacing.space2) {
                Text(phaseDisplayName)
                    .font(.title2)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.meditation)

                if !pipeline.isPlaying {
                    Text("PAUSED")
                        .font(.headline)
                        .foregroundColor(Theme.warning)
                }
            }

            // Meditation title
            VStack(spacing: Theme.Spacing.space2) {
                Text(script.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)
                Text(script.subtitle)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .padding(.horizontal, Theme.Spacing.space4)
            .multilineTextAlignment(.center)

            // Progress bar
            ProgressView(value: pipeline.elapsedSeconds, total: totalDuration)
                .tint(Theme.meditation)
                .padding(.horizontal, Theme.Spacing.space8)

            Spacer()

            // Controls
            HStack(spacing: Theme.Spacing.space7) {
                // End button
                Button(action: { showEndConfirmation = true }, label: {
                    VStack {
                        Image(systemName: "stop.fill")
                            .font(.title2)
                        Text("End")
                            .font(.caption)
                    }
                    .foregroundColor(Theme.textSecondary)
                })
                .buttonStyle(GlassCircleButtonStyle())

                // Pause/Resume button
                Button(action: togglePause) {
                    Image(systemName: pipeline.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title)
                        .foregroundColor(Theme.textOnAccent)
                }
                .buttonStyle(GlassPrimaryCircleButtonStyle(color: Theme.meditation))

                // Placeholder for symmetry
                Color.clear
                    .frame(width: Theme.Dimensions.circleButtonSM, height: Theme.Dimensions.circleButtonSM)
            }
        }
        .padding(Theme.Spacing.space4)
        .onAppear {
            impactGenerator.prepare()
            notificationGenerator.prepare()
            initializeSession()
        }
        .onDisappear {
            pipeline.stop()
            nowPlaying.clear()
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
        .alert("End Session?", isPresented: $showEndConfirmation) {
            Button("End Session", role: .destructive) {
                completeSession(fully: false)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to end this meditation session early?")
        }
    }

    // MARK: - Session Lifecycle

    private func initializeSession() {
        sessionStartTime = Date()

        do {
            try pipeline.buildTimeline(
                from: preparedSegments,
                interjections: resolvedInterjections,
                totalDuration: totalDuration
            )

            pipeline.onComplete = {
                completeSession(fully: true)
            }

            pipeline.play()

            // Setup lock screen controls
            nowPlaying.setupRemoteCommands(
                onPlay: { pipeline.resume() },
                onPause: { pipeline.pause() }
            )

            updateNowPlaying()

            // Save initial state for crash recovery
            saveSessionState()
        } catch {
            // If pipeline build fails, still allow manual end
            print("Failed to build timeline: \(error)")
        }
    }

    private func togglePause() {
        impactGenerator.impactOccurred()

        if pipeline.isPlaying {
            pipeline.pause()
        } else {
            pipeline.resume()
        }

        updateNowPlaying()
        saveSessionState()
    }

    private func completeSession(fully: Bool) {
        pipeline.stop()
        nowPlaying.clear()
        storage.clearMeditationState()

        if fully {
            notificationGenerator.notificationOccurred(.success)
        } else {
            impactGenerator.impactOccurred()
        }

        let actualDuration = Int(pipeline.elapsedSeconds)
        let session = MeditationSession(
            id: UUID().uuidString,
            completedAt: Date(),
            sessionType: "reactivity-\(script.id)",
            plannedDurationSeconds: script.durationSeconds,
            actualDurationSeconds: actualDuration,
            completedFully: fully
        )
        onComplete(session)
    }

    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            updateNowPlaying()
        case .background:
            saveSessionState()
        default:
            break
        }
    }

    private func updateNowPlaying() {
        nowPlaying.updateMetadata(
            title: script.title,
            phase: phaseDisplayName,
            duration: totalDuration,
            elapsedTime: pipeline.elapsedSeconds,
            isPlaying: pipeline.isPlaying
        )
    }

    // MARK: - State Persistence

    private func saveSessionState() {
        let state = MeditationSessionPersisted(
            status: pipeline.isPlaying ? .active : .paused,
            sessionType: "reactivity-\(script.id)",
            durationMinutes: script.durationSeconds / 60,
            sessionStartedAt: sessionStartTime,
            pausedAt: pipeline.isPlaying ? nil : Date(),
            pausedElapsed: 0,  // Pipeline tracks its own elapsed time
            scheduledCues: [],  // Not used for guided sessions
            currentPhaseIndex: 0,
            guidedScriptId: script.id,
            guidedCategory: "reactivity",
            guidedElapsedSeconds: pipeline.elapsedSeconds
        )
        storage.saveMeditationState(state)
    }
}
