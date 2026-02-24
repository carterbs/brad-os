import SwiftUI
import UIKit
import AVFoundation
import BradOSCore

/// Active meditation session view with timestamp-based timer
struct MeditationActiveView: View {
    let duration: MeditationDuration
    let recoveredState: MeditationSessionPersisted?
    let onComplete: (MeditationSession) -> Void

    @Environment(\.scenePhase) var scenePhase
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    // Timer state - using timestamps for background resilience
    @State var sessionStartTime = Date()
    @State var pausedElapsed: TimeInterval = 0
    @State var pausedAt: Date?
    @State var isPaused: Bool = false
    @State var displayedTimeRemaining: Int = 0

    // Breathing animation state
    @State var breathingPhase: BreathingPhase = .inhale
    @State var breathingProgress: Double = 0
    @State var circleScale: CGFloat = 1.0
    @State var circleOpacity: Double = 0.6

    // Timer for updates
    @State var displayTimer: Timer?
    @State var breathingTimer: Timer?

    // Audio cue scheduling
    @State var scheduledCues: [ScheduledCue] = []
    @State var isPlayingCue: Bool = false

    // Pause timeout
    @State var pauseTimeoutTimer: Timer?

    // UI state
    @State var showEndConfirmation: Bool = false
    @State var showAudioError: Bool = false
    @State var audioErrorMessage: String = ""

    // Debouncing for rapid pause/resume
    @State var lastPauseToggleTime: Date = .distantPast
    let pauseDebounceInterval: TimeInterval = 0.3

    // Haptic feedback generators
    let impactGenerator = UIImpactFeedbackGenerator(style: .medium)
    let notificationGenerator = UINotificationFeedbackGenerator()

    // Audio and storage
    let storage = MeditationStorage.shared
    let audioEngine = MeditationAudioEngine.shared
    let nowPlaying = NowPlayingManager.shared
    let manifestService = ServiceFactory.meditationManifestService

    init(
        duration: MeditationDuration,
        recoveredState: MeditationSessionPersisted? = nil,
        onComplete: @escaping (MeditationSession) -> Void
    ) {
        self.duration = duration
        self.recoveredState = recoveredState
        self.onComplete = onComplete
        self._displayedTimeRemaining = State(initialValue: duration.seconds)
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Timer
            timerSection

            // Breathing Animation
            breathingSection

            // Phase indicator
            phaseSection

            Spacer()

            // Controls
            controlsSection
        }
        .padding(Theme.Spacing.space4)
        .onAppear {
            // Prepare haptic generators
            impactGenerator.prepare()
            notificationGenerator.prepare()

            initializeSession()
        }
        .onDisappear {
            cleanup()
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notification in
            handleAudioInterruption(notification)
        }
        .alert("End Session?", isPresented: $showEndConfirmation) {
            Button("End Session", role: .destructive) {
                completeSession(fully: false)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to end this meditation session early?")
        }
        .alert("Audio Error", isPresented: $showAudioError) {
            Button("Continue Without Audio") {
                // Session continues even without audio
            }
            Button("Retry") {
                retryAudioInitialization()
            }
        } message: {
            Text(audioErrorMessage)
        }
    }

    // MARK: - Timer Section

    @ViewBuilder
    var timerSection: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Text(formattedTime)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(Theme.textPrimary)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .accessibilityLabel("\(displayedTimeRemaining / 60) minutes and \(displayedTimeRemaining % 60) seconds remaining")

            Text("remaining")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .accessibilityHidden(true)
        }
    }

    var formattedTime: String {
        let minutes = displayedTimeRemaining / 60
        let seconds = displayedTimeRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Breathing Section

    @ViewBuilder
    var breathingSection: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(Theme.meditation.opacity(0.2), lineWidth: 4)
                .frame(width: 200, height: 200)

            if reduceMotion {
                // Static indicator for Reduce Motion users
                breathingStaticIndicator
            } else {
                // Animated inner circle
                Circle()
                    .fill(Theme.meditation.opacity(circleOpacity))
                    .frame(width: 100 * circleScale, height: 100 * circleScale)
            }

            // Center dot
            Circle()
                .fill(Theme.meditation)
                .frame(width: 20, height: 20)
        }
        .auroraGlow(Theme.meditation)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Breathing circle")
        .accessibilityValue(breathingPhase.accessibilityLabel)
    }

    /// Static breathing indicator for Reduce Motion users
    @ViewBuilder
    var breathingStaticIndicator: some View {
        // Show phase-appropriate static size
        let staticScale: CGFloat = breathingPhase == .inhale || breathingPhase == .holdIn ? 1.8 : 1.0
        let staticOpacity: Double = breathingPhase == .inhale || breathingPhase == .holdIn ? 1.0 : 0.6

        Circle()
            .fill(Theme.meditation.opacity(staticOpacity))
            .frame(width: 100 * staticScale, height: 100 * staticScale)
    }

    // MARK: - Phase Section

    @ViewBuilder
    var phaseSection: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Text(breathingPhase.rawValue)
                .font(.title2)
                .fontWeight(.medium)
                .foregroundColor(Theme.meditation)
                .accessibilityLabel(breathingPhase.accessibilityLabel)
                .onChange(of: breathingPhase) { oldPhase, newPhase in
                    // Announce phase changes to VoiceOver users
                    if oldPhase != newPhase {
                        announcePhaseChange(newPhase)
                    }
                }

            if isPaused {
                Text("PAUSED")
                    .font(.headline)
                    .foregroundColor(Theme.warning)
                    .accessibilityLabel("Session paused")
            }
        }
    }

    /// Announce breathing phase change for VoiceOver users
    func announcePhaseChange(_ phase: BreathingPhase) {
        // Only announce if VoiceOver is running
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: phase.accessibilityLabel)
        }
    }

    // MARK: - Controls Section

    @ViewBuilder
    var controlsSection: some View {
        HStack(spacing: Theme.Spacing.space7) {
            // End button
            Button(action: endSession) {
                VStack {
                    Image(systemName: "stop.fill")
                        .font(.title2)
                    Text("End")
                        .font(.caption)
                }
                .foregroundColor(Theme.textSecondary)
            }
            .buttonStyle(GlassCircleButtonStyle())
            .accessibilityLabel("End session early")
            .accessibilityHint("Shows confirmation before ending")

            // Pause/Resume button
            Button(action: togglePauseWithHaptic) {
                Image(systemName: isPaused ? "play.fill" : "pause.fill")
                    .font(.title)
                    .foregroundColor(Theme.textOnAccent)
            }
            .buttonStyle(GlassPrimaryCircleButtonStyle(color: Theme.meditation))
            .accessibilityLabel(isPaused ? "Resume session" : "Pause session")

            // Placeholder for symmetry
            Color.clear
                .frame(width: Theme.Dimensions.circleButtonSM, height: Theme.Dimensions.circleButtonSM)
                .accessibilityHidden(true)
        }
    }
}
