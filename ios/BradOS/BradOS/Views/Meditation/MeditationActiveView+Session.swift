import SwiftUI
import AVFoundation
import BradOSCore

// MARK: - Session Lifecycle

extension MeditationActiveView {

    func initializeSession() {
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

    func cleanup() {
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

    func retryAudioInitialization() {
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

    func startDisplayTimer() {
        displayTimer?.invalidate()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            updateDisplayedTime()
        }
    }

    func updateDisplayedTime() {
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

    func checkPendingCues(elapsedSeconds: Int) {
        guard !isPlayingCue else { return }

        // Find the next unplayed cue that should have played by now
        if let index = scheduledCues.firstIndex(where: { !$0.played && $0.atSeconds <= elapsedSeconds }) {
            playCue(at: index)
        }
    }

    func playCue(at index: Int) {
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

    func calculateElapsed() -> TimeInterval {
        if let pausedAt = pausedAt {
            // Currently paused - elapsed is time until pause
            return pausedAt.timeIntervalSince(sessionStartTime) - pausedElapsed
        } else {
            // Running - elapsed is time since start minus paused time
            return Date().timeIntervalSince(sessionStartTime) - pausedElapsed
        }
    }

    // MARK: - Breathing Animation

    func startBreathingCycle() {
        breathingTimer?.invalidate()

        // Start at correct initial values
        circleScale = breathingPhase.startScale
        circleOpacity = breathingPhase.startOpacity

        runBreathingPhase()
    }

    func runBreathingPhase() {
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
    func togglePauseWithHaptic() {
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

    func togglePause() {
        if isPaused {
            resumeSession()
        } else {
            pauseSession()
        }
    }

    func pauseSession() {
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

    func resumeSession() {
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

    func startPauseTimeout() {
        cancelPauseTimeout()

        // 30-minute timeout for paused sessions
        pauseTimeoutTimer = Timer.scheduledTimer(
            withTimeInterval: meditationPauseTimeout,
            repeats: false
        ) { [self] _ in
            // Auto-end session after timeout
            DispatchQueue.main.async {
                self.completeSession(fully: false)
            }
        }
    }

    func cancelPauseTimeout() {
        pauseTimeoutTimer?.invalidate()
        pauseTimeoutTimer = nil
    }

    // MARK: - End Session

    func endSession() {
        // Show confirmation dialog instead of ending immediately
        showEndConfirmation = true
    }

    func completeSession(fully: Bool) {
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

    func saveSessionState() {
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

    func handleScenePhaseChange(_ newPhase: ScenePhase) {
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
    func handleAudioInterruption(_ notification: Notification) {
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

                // Re-activate audio session via centralized manager
                try? AudioSessionManager.shared.activate()
            }

        @unknown default:
            break
        }
    }

    // MARK: - Now Playing

    func updateNowPlaying() {
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
