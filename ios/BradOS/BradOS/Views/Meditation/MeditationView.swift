import SwiftUI
import UIKit
import AVFoundation
import BradOSCore

/// Meditation session states
enum MeditationSessionState {
    case setup
    case active
    case complete
}

/// Breathing phase for meditation (spec: 4-2-6-2 = 14 second cycle)
enum BreathingPhase: String, CaseIterable {
    case inhale = "Inhale"
    case holdIn = "Hold"
    case exhale = "Exhale"
    case rest = "Rest"

    var duration: Double {
        switch self {
        case .inhale: return 4.0
        case .holdIn: return 2.0
        case .exhale: return 6.0
        case .rest: return 2.0
        }
    }

    var next: BreathingPhase {
        switch self {
        case .inhale: return .holdIn
        case .holdIn: return .exhale
        case .exhale: return .rest
        case .rest: return .inhale
        }
    }

    /// Scale factor for the breathing circle (1.0 to 1.8)
    var targetScale: CGFloat {
        switch self {
        case .inhale: return 1.8   // Grows to 1.8
        case .holdIn: return 1.8   // Stays at 1.8
        case .exhale: return 1.0   // Shrinks to 1.0
        case .rest: return 1.0     // Stays at 1.0
        }
    }

    /// Starting scale for the phase
    var startScale: CGFloat {
        switch self {
        case .inhale: return 1.0
        case .holdIn: return 1.8
        case .exhale: return 1.8
        case .rest: return 1.0
        }
    }

    /// Opacity for the breathing circle (0.6 to 1.0)
    var targetOpacity: Double {
        switch self {
        case .inhale: return 1.0   // Fades to 1.0
        case .holdIn: return 1.0   // Stays at 1.0
        case .exhale: return 0.6   // Fades to 0.6
        case .rest: return 0.6     // Stays at 0.6
        }
    }

    /// Starting opacity for the phase
    var startOpacity: Double {
        switch self {
        case .inhale: return 0.6
        case .holdIn: return 1.0
        case .exhale: return 1.0
        case .rest: return 0.6
        }
    }

    /// VoiceOver description for the phase
    var accessibilityLabel: String {
        switch self {
        case .inhale: return "Inhale for 4 seconds"
        case .holdIn: return "Hold breath for 2 seconds"
        case .exhale: return "Exhale for 6 seconds"
        case .rest: return "Rest for 2 seconds"
        }
    }
}

/// Main meditation view managing session lifecycle
struct MeditationView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) var scenePhase

    @State private var sessionState: MeditationSessionState = .setup
    @State private var selectedDuration: MeditationDuration = .five
    @State private var completedSession: MeditationSession?
    @State private var showRecoveryPrompt: Bool = false
    @State private var recoverableSession: MeditationSessionPersisted?
    @State private var isSavingSession: Bool = false
    @State private var saveError: Error?

    private let storage = MeditationStorage.shared
    private let apiService = MeditationAPIService.shared

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()

                switch sessionState {
                case .setup:
                    MeditationSetupView(
                        selectedDuration: $selectedDuration,
                        onStart: startSession
                    )

                case .active:
                    MeditationActiveView(
                        duration: selectedDuration,
                        recoveredState: recoverableSession,
                        onComplete: { session in
                            completedSession = session
                            sessionState = .complete
                            storage.clearMeditationState()

                            // Save session to API
                            saveSessionToServer(session)
                        },
                        onCancel: {
                            sessionState = .setup
                            storage.clearMeditationState()
                        }
                    )

                case .complete:
                    if let session = completedSession {
                        MeditationCompleteView(
                            session: session,
                            isSaving: isSavingSession,
                            saveError: saveError,
                            onDone: {
                                appState.isShowingMeditation = false
                            },
                            onStartAnother: {
                                recoverableSession = nil
                                sessionState = .setup
                            },
                            onRetrySync: {
                                saveSessionToServer(session)
                            }
                        )
                    }
                }
            }
            .navigationTitle("Meditation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if sessionState == .setup {
                        Button(action: {
                            appState.isShowingMeditation = false
                        }) {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.interactivePrimary)
                        }
                    }
                }
            }
            .onAppear {
                loadSavedPreferences()
                checkForRecoverableSession()
            }
            .alert("Resume Session?", isPresented: $showRecoveryPrompt) {
                Button("Resume") {
                    if let recovered = recoverableSession {
                        selectedDuration = MeditationDuration(rawValue: recovered.durationMinutes) ?? .five
                        sessionState = .active
                    }
                }
                Button("Start Fresh", role: .cancel) {
                    recoverableSession = nil
                    storage.clearMeditationState()
                }
            } message: {
                Text("You have an unfinished meditation session. Would you like to resume?")
            }
        }
    }

    private func loadSavedPreferences() {
        let config = storage.loadMeditationConfig()
        selectedDuration = MeditationDuration(rawValue: config.duration) ?? .five
    }

    private func checkForRecoverableSession() {
        if let recovered = storage.recoverableSession() {
            recoverableSession = recovered
            showRecoveryPrompt = true
        }
    }

    private func startSession() {
        // Save duration preference
        storage.saveMeditationConfig(MeditationConfig(duration: selectedDuration.rawValue))
        recoverableSession = nil
        sessionState = .active
    }

    private func saveSessionToServer(_ session: MeditationSession) {
        isSavingSession = true
        saveError = nil

        Task {
            do {
                _ = try await apiService.saveSession(session)
                await MainActor.run {
                    isSavingSession = false
                    saveError = nil
                }
            } catch {
                await MainActor.run {
                    isSavingSession = false
                    saveError = error
                }
            }
        }
    }
}

/// Setup view for configuring meditation session
struct MeditationSetupView: View {
    @Binding var selectedDuration: MeditationDuration
    let onStart: () -> Void

    @State private var lastSession: MeditationSession?
    @State private var isLoadingLastSession: Bool = false

    private let storage = MeditationStorage.shared
    private let apiService = MeditationAPIService.shared

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Icon
            Image(systemName: "brain.head.profile")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.meditation)

            Text("Mindful Breathing")
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Focus on your breath to calm your mind")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Spacer()

            // Duration Selection
            durationSelectionSection

            // Last Session Info
            if isLoadingLastSession {
                ProgressView()
                    .tint(Theme.meditation)
            } else if let lastSession = lastSession {
                lastSessionSection(lastSession)
            }

            Spacer()

            // Start Button
            Button(action: onStart) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("Begin Session")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(Theme.Spacing.space4)
        .onAppear {
            fetchLastSession()
        }
        .onChange(of: selectedDuration) { _, newDuration in
            // Save preference when changed
            storage.saveMeditationConfig(MeditationConfig(duration: newDuration.rawValue))
        }
    }

    // MARK: - API

    private func fetchLastSession() {
        isLoadingLastSession = true
        Task {
            do {
                let session = try await apiService.fetchLatestSession()
                await MainActor.run {
                    lastSession = session
                    isLoadingLastSession = false
                }
            } catch {
                await MainActor.run {
                    // If fetch fails, just don't show last session
                    lastSession = nil
                    isLoadingLastSession = false
                }
            }
        }
    }

    // MARK: - Duration Selection

    @ViewBuilder
    private var durationSelectionSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            Text("Duration")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: Theme.Spacing.space4) {
                ForEach(MeditationDuration.allCases) { duration in
                    MeditationDurationOption(
                        duration: duration,
                        isSelected: selectedDuration == duration,
                        onSelect: { selectedDuration = duration }
                    )
                }
            }
        }
    }

    // MARK: - Last Session

    @ViewBuilder
    private func lastSessionSection(_ session: MeditationSession) -> some View {
        HStack {
            Image(systemName: "clock")
                .foregroundColor(Theme.textSecondary)

            Text("Last session: \(formattedDate(session.completedAt))")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

/// Duration option button for meditation
struct MeditationDurationOption: View {
    let duration: MeditationDuration
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 4) {
                Text("\(duration.rawValue)")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(isSelected ? Theme.meditation : Theme.textPrimary)

                Text("min")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .glassCard(.card, radius: Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(isSelected ? Theme.meditation : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("\(duration.rawValue) minutes")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(isSelected ? "Currently selected" : "Double tap to select")
    }
}

/// Active meditation session view with timestamp-based timer
struct MeditationActiveView: View {
    let duration: MeditationDuration
    let recoveredState: MeditationSessionPersisted?
    let onComplete: (MeditationSession) -> Void
    let onCancel: () -> Void

    @Environment(\.scenePhase) var scenePhase
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    // Timer state - using timestamps for background resilience
    @State private var sessionStartTime: Date = Date()
    @State private var pausedElapsed: TimeInterval = 0
    @State private var pausedAt: Date?
    @State private var isPaused: Bool = false
    @State private var displayedTimeRemaining: Int = 0

    // Breathing animation state
    @State private var breathingPhase: BreathingPhase = .inhale
    @State private var breathingProgress: Double = 0
    @State private var circleScale: CGFloat = 1.0
    @State private var circleOpacity: Double = 0.6
    @State private var previousPhase: BreathingPhase? = nil

    // Timer for updates
    @State private var displayTimer: Timer?
    @State private var breathingTimer: Timer?

    // Audio cue scheduling
    @State private var scheduledCues: [ScheduledCue] = []
    @State private var isPlayingCue: Bool = false

    // Pause timeout
    @State private var pauseTimeoutTimer: Timer?

    // UI state
    @State private var showEndConfirmation: Bool = false
    @State private var showAudioError: Bool = false
    @State private var audioErrorMessage: String = ""

    // Debouncing for rapid pause/resume
    @State private var lastPauseToggleTime: Date = .distantPast
    private let pauseDebounceInterval: TimeInterval = 0.3

    // Haptic feedback generators
    private let impactGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let notificationGenerator = UINotificationFeedbackGenerator()

    // Audio and storage
    private let storage = MeditationStorage.shared
    private let audioEngine = MeditationAudioEngine.shared
    private let nowPlaying = NowPlayingManager.shared
    private let manifestService = MeditationManifestService.shared

    init(
        duration: MeditationDuration,
        recoveredState: MeditationSessionPersisted? = nil,
        onComplete: @escaping (MeditationSession) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.duration = duration
        self.recoveredState = recoveredState
        self.onComplete = onComplete
        self.onCancel = onCancel
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
    private var timerSection: some View {
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

    private var formattedTime: String {
        let minutes = displayedTimeRemaining / 60
        let seconds = displayedTimeRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Breathing Section

    @ViewBuilder
    private var breathingSection: some View {
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
    private var breathingStaticIndicator: some View {
        // Show phase-appropriate static size
        let staticScale: CGFloat = breathingPhase == .inhale || breathingPhase == .holdIn ? 1.8 : 1.0
        let staticOpacity: Double = breathingPhase == .inhale || breathingPhase == .holdIn ? 1.0 : 0.6

        Circle()
            .fill(Theme.meditation.opacity(staticOpacity))
            .frame(width: 100 * staticScale, height: 100 * staticScale)
    }

    // MARK: - Phase Section

    @ViewBuilder
    private var phaseSection: some View {
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
    private func announcePhaseChange(_ phase: BreathingPhase) {
        // Only announce if VoiceOver is running
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: phase.accessibilityLabel)
        }
    }

    // MARK: - Controls Section

    @ViewBuilder
    private var controlsSection: some View {
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

    // MARK: - Session Lifecycle

    private func initializeSession() {
        // Recover state if available
        if let recovered = recoveredState {
            sessionStartTime = recovered.sessionStartedAt ?? Date()
            pausedElapsed = recovered.pausedElapsed
            if recovered.status == .paused {
                pausedAt = recovered.pausedAt
                isPaused = true
            }
        } else {
            sessionStartTime = Date()
            pausedElapsed = 0
            pausedAt = nil
            isPaused = false
        }

        // Initialize audio and load cues
        Task {
            do {
                try await audioEngine.initialize()
                audioEngine.startKeepalive()

                // Load scheduled cues from recovered state or generate new ones
                if let recovered = recoveredState, !recovered.scheduledCues.isEmpty {
                    await MainActor.run {
                        scheduledCues = recovered.scheduledCues
                    }
                } else {
                    let cues = try await manifestService.generateScheduledCues(
                        sessionId: "basic-breathing",
                        duration: duration.rawValue
                    )
                    await MainActor.run {
                        scheduledCues = cues
                    }
                }
            } catch {
                // Show error but allow session to continue without audio
                await MainActor.run {
                    audioErrorMessage = "Could not initialize audio. The session will continue without sound."
                    showAudioError = true
                }
            }
        }

        // Setup lock screen controls
        nowPlaying.setupRemoteCommands(
            onPlay: { resumeSession() },
            onPause: { pauseSession() }
        )

        // Start timers
        startDisplayTimer()
        startBreathingCycle()

        // Save initial state
        saveSessionState()

        // Update Now Playing
        updateNowPlaying()
    }

    private func cleanup() {
        displayTimer?.invalidate()
        displayTimer = nil
        breathingTimer?.invalidate()
        breathingTimer = nil
        pauseTimeoutTimer?.invalidate()
        pauseTimeoutTimer = nil
        audioEngine.stopAll()
        nowPlaying.clear()
    }

    // MARK: - Audio Error Handling

    private func retryAudioInitialization() {
        Task {
            do {
                try await audioEngine.initialize()
                audioEngine.startKeepalive()
            } catch {
                await MainActor.run {
                    audioErrorMessage = "Could not initialize audio: \(error.localizedDescription)"
                    showAudioError = true
                }
            }
        }
    }

    // MARK: - Display Timer

    private func startDisplayTimer() {
        displayTimer?.invalidate()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            updateDisplayedTime()
        }
    }

    private func updateDisplayedTime() {
        let elapsed = calculateElapsed()
        let remaining = max(0, Double(duration.seconds) - elapsed)
        displayedTimeRemaining = Int(remaining)

        // Check for pending audio cues
        if !isPaused {
            checkPendingCues(elapsedSeconds: Int(elapsed))
        }

        if remaining <= 0 {
            completeSession(fully: true)
        }
    }

    // MARK: - Audio Cue Scheduling

    private func checkPendingCues(elapsedSeconds: Int) {
        guard !isPlayingCue else { return }

        // Find the next unplayed cue that should have played by now
        if let index = scheduledCues.firstIndex(where: { !$0.played && $0.atSeconds <= elapsedSeconds }) {
            playCue(at: index)
        }
    }

    private func playCue(at index: Int) {
        guard index < scheduledCues.count else { return }

        let cue = scheduledCues[index]
        isPlayingCue = true

        Task {
            do {
                try await audioEngine.playNarration(file: cue.audioFile)
                // Mark cue as played
                await MainActor.run {
                    scheduledCues[index].played = true
                    isPlayingCue = false
                    saveSessionState()
                }
            } catch {
                print("Failed to play cue: \(error)")
                await MainActor.run {
                    scheduledCues[index].played = true  // Skip failed cues
                    isPlayingCue = false
                }
            }
        }
    }

    private func calculateElapsed() -> TimeInterval {
        if let pausedAt = pausedAt {
            // Currently paused - elapsed is time until pause
            return pausedAt.timeIntervalSince(sessionStartTime) - pausedElapsed
        } else {
            // Running - elapsed is time since start minus paused time
            return Date().timeIntervalSince(sessionStartTime) - pausedElapsed
        }
    }

    // MARK: - Breathing Animation

    private func startBreathingCycle() {
        breathingTimer?.invalidate()

        // Start at correct initial values
        circleScale = breathingPhase.startScale
        circleOpacity = breathingPhase.startOpacity

        runBreathingPhase()
    }

    private func runBreathingPhase() {
        guard displayedTimeRemaining > 0 else { return }

        if isPaused {
            // Check again in a moment when paused
            breathingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in
                runBreathingPhase()
            }
            return
        }

        let phase = breathingPhase
        breathingProgress = 0

        // Animate to target values
        withAnimation(.easeInOut(duration: phase.duration)) {
            circleScale = phase.targetScale
            circleOpacity = phase.targetOpacity
            breathingProgress = 1
        }

        // Schedule next phase
        breathingTimer = Timer.scheduledTimer(withTimeInterval: phase.duration, repeats: false) { _ in
            if displayedTimeRemaining > 0 {
                breathingPhase = phase.next
                runBreathingPhase()
            }
        }
    }

    // MARK: - Pause/Resume

    /// Toggle pause with haptic feedback and debouncing
    private func togglePauseWithHaptic() {
        // Debounce rapid taps
        let now = Date()
        guard now.timeIntervalSince(lastPauseToggleTime) >= pauseDebounceInterval else {
            return
        }
        lastPauseToggleTime = now

        // Haptic feedback
        impactGenerator.impactOccurred()

        togglePause()
    }

    private func togglePause() {
        if isPaused {
            resumeSession()
        } else {
            pauseSession()
        }
    }

    private func pauseSession() {
        guard !isPaused else { return }

        isPaused = true
        pausedAt = Date()

        // Pause audio
        audioEngine.pause()

        // Update Now Playing
        nowPlaying.updatePlaybackState(isPlaying: false, elapsedTime: calculateElapsed())

        // Start pause timeout (30 minutes)
        startPauseTimeout()

        // Save state
        saveSessionState()

        // Announce to VoiceOver
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: "Session paused")
        }
    }

    private func resumeSession() {
        guard isPaused, let pausedAtTime = pausedAt else { return }

        // Cancel pause timeout
        cancelPauseTimeout()

        // Accumulate paused time
        pausedElapsed += Date().timeIntervalSince(pausedAtTime)
        pausedAt = nil
        isPaused = false

        // Resume audio
        audioEngine.resume()

        // Update Now Playing
        nowPlaying.updatePlaybackState(isPlaying: true, elapsedTime: calculateElapsed())

        // Restart breathing animation from current phase
        startBreathingCycle()

        // Save state
        saveSessionState()

        // Announce to VoiceOver
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: "Session resumed")
        }
    }

    // MARK: - Pause Timeout

    private func startPauseTimeout() {
        cancelPauseTimeout()

        // 30-minute timeout for paused sessions
        pauseTimeoutTimer = Timer.scheduledTimer(
            withTimeInterval: MEDITATION_PAUSE_TIMEOUT,
            repeats: false
        ) { [self] _ in
            // Auto-end session after timeout
            DispatchQueue.main.async {
                self.completeSession(fully: false)
            }
        }
    }

    private func cancelPauseTimeout() {
        pauseTimeoutTimer?.invalidate()
        pauseTimeoutTimer = nil
    }

    // MARK: - End Session

    private func endSession() {
        // Show confirmation dialog instead of ending immediately
        showEndConfirmation = true
    }

    private func completeSession(fully: Bool) {
        displayTimer?.invalidate()
        breathingTimer?.invalidate()
        cancelPauseTimeout()

        let actualDuration = Int(calculateElapsed())

        // Stop audio
        audioEngine.stopAll()

        // Clear now playing
        nowPlaying.clear()

        // Clear saved state
        storage.clearMeditationState()

        // Haptic feedback for completion
        if fully {
            notificationGenerator.notificationOccurred(.success)
        } else {
            impactGenerator.impactOccurred()
        }

        // Play bell if fully completed
        if fully {
            Task {
                try? await audioEngine.playBell()
            }
        }

        let session = MeditationSession(
            id: UUID().uuidString,
            completedAt: Date(),
            sessionType: "basic-breathing",
            plannedDurationSeconds: duration.seconds,
            actualDurationSeconds: actualDuration,
            completedFully: fully
        )
        onComplete(session)
    }

    // MARK: - State Persistence

    private func saveSessionState() {
        let state = MeditationSessionPersisted(
            status: isPaused ? .paused : .active,
            sessionType: "basic-breathing",
            durationMinutes: duration.rawValue,
            sessionStartedAt: sessionStartTime,
            pausedAt: pausedAt,
            pausedElapsed: pausedElapsed,
            scheduledCues: scheduledCues,
            currentPhaseIndex: 0
        )
        storage.saveMeditationState(state)
    }

    // MARK: - Scene Phase Handling

    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App came to foreground - recalculate time
            updateDisplayedTime()
            updateNowPlaying()
        case .background:
            // Save state when going to background
            saveSessionState()
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    // MARK: - Audio Interruption Handling

    /// Handle audio session interruptions (phone calls, Siri, etc.)
    private func handleAudioInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            // Phone call or other interruption started - pause the session
            if !isPaused {
                pauseSession()
            }

        case .ended:
            // Interruption ended - check if we should resume
            guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else {
                return
            }

            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                // The system recommends resuming - but we leave it paused
                // The user can manually resume when ready
                // This is better UX for meditation

                // Re-activate audio session
                try? AVAudioSession.sharedInstance().setActive(true)
            }

        @unknown default:
            break
        }
    }

    // MARK: - Now Playing

    private func updateNowPlaying() {
        let elapsed = calculateElapsed()
        nowPlaying.updateMetadata(
            title: "Basic Breathing",
            phase: breathingPhase.rawValue,
            duration: Double(duration.seconds),
            elapsedTime: elapsed,
            isPlaying: !isPaused
        )
    }
}

/// Meditation session completion view
struct MeditationCompleteView: View {
    let session: MeditationSession
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

            Text(session.completedFully
                 ? "You completed your meditation session."
                 : "You meditated for \(session.formattedActualDuration).")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            // Stats
            VStack(spacing: Theme.Spacing.space4) {
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
            } else if let error = saveError {
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

#Preview {
    MeditationView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
