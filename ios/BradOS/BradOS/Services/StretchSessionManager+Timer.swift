import BradOSCore
import Combine
import Foundation

// MARK: - Timer & Segment Handling

extension StretchSessionManager {

    // MARK: - Pause Timeout (matches PWA's 30 minute auto-end)

    func startPauseTimeout() {
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = Timer.publish(every: 60, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.checkPauseTimeout()
            }
    }

    func cancelPauseTimeout() {
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = nil
    }

    private func checkPauseTimeout() {
        guard status == .paused, let pausedAt = pausedAt else { return }
        let pauseDuration = Date().timeIntervalSince(pausedAt)
        if pauseDuration >= pauseTimeoutSeconds {
            #if DEBUG
            print("[StretchSessionManager] Auto-ending session due to 30 minute pause timeout")
            #endif
            endSession()
        }
    }

    // MARK: - Timer Management

    func startTimer() {
        timer?.cancel()
        timer = nil

        let newTimer = DispatchSource.makeTimerSource(queue: timerQueue)
        newTimer.schedule(deadline: .now(), repeating: .milliseconds(100))
        newTimer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.updateTimer()
            }
        }
        newTimer.resume()
        timer = newTimer
    }

    func updateTimer() {
        guard status == .active, let endTime = segmentEndTime else { return }

        // Calculate remaining time based on target end time (background-safe)
        let remaining = endTime.timeIntervalSince(Date())

        if remaining <= 0 {
            segmentRemaining = 0
            Task {
                await handleSegmentComplete()
            }
        } else {
            segmentRemaining = remaining
        }
    }

    // MARK: - Segment Completion

    func handleSegmentComplete() async {
        timer?.cancel()
        timer = nil

        if currentSegment == 1 {
            // Advance to segment 2 FIRST (matches PWA - timer starts immediately)
            currentSegment = 2
            segmentEndTime = Date().addingTimeInterval(segmentDuration)
            segmentRemaining = segmentDuration

            // Start timer BEFORE playing narration (timer runs during narration)
            if status == .active {
                startTimer()
            }

            updateNowPlayingInfo()

            // Play transition narration ASYNCHRONOUSLY (timer continues during playback)
            if let stretch = currentStretch {
                let cue: SharedStretchCue = stretch.bilateral ? .switchSides : .halfway
                audioManager.playNarrationAsync(audioManager.sharedAudioURL(for: cue))
            }
        } else {
            // Segment 2 complete - record and advance
            await advanceToNextStretch()
        }
    }

    func advanceToNextStretch() async {
        timer?.cancel()
        timer = nil

        // Record completed stretch
        if let selected = currentSelectedStretch {
            let skipped = skippedSegments[selected.id] ?? 0
            let completed = CompletedStretch(
                region: selected.region,
                stretchId: selected.definition.id,
                stretchName: selected.definition.name,
                durationSeconds: selected.durationSeconds,
                skippedSegments: skipped
            )
            completedStretches.append(completed)
        }

        if isLastStretch {
            // Stop keepalive but keep audio session active for completion narration
            audioManager.stopKeepalive()

            // Session complete - play completion narration
            if let url = audioManager.sharedAudioURL(for: .sessionComplete) {
                try? await audioManager.playNarration(url)
            }

            // Now deactivate audio session
            audioManager.deactivateSession()
            finalizeSession()
        } else {
            // Advance to next stretch FIRST (matches PWA - timer starts immediately)
            currentStretchIndex += 1
            currentSegment = 1
            segmentEndTime = Date().addingTimeInterval(segmentDuration)
            segmentRemaining = segmentDuration

            // Start timer BEFORE playing narration (timer runs during narration)
            if status == .active {
                startTimer()
            }

            updateNowPlayingInfo()

            // Play just the stretch name ASYNCHRONOUSLY (timer continues during playback)
            if let nextStretch = currentStretch {
                audioManager.playNarrationAsync(audioManager.nameAudioURL(for: nextStretch.id))
            }
        }
    }

    func finalizeSession() {
        // Record any remaining stretch as completed
        if currentStretchIndex < selectedStretches.count,
           completedStretches.count < selectedStretches.count {
            let selected = selectedStretches[currentStretchIndex]
            let skipped = skippedSegments[selected.id] ?? 0
            let completed = CompletedStretch(
                region: selected.region,
                stretchId: selected.definition.id,
                stretchName: selected.definition.name,
                durationSeconds: selected.durationSeconds,
                skippedSegments: max(skipped, currentSegment == 1 ? 2 : 1)
            )
            completedStretches.append(completed)
        }

        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = nil
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = nil
        clearNowPlayingInfo()
        status = .complete
    }

    // MARK: - Session Control

    /// Restore a session from saved state
    func restore(from state: StretchSessionPersistableState) {
        selectedStretches = state.selectedStretches
        currentStretchIndex = state.currentStretchIndex
        currentSegment = state.currentSegment
        completedStretches = state.completedStretches
        skippedSegments = state.skippedSegments
        storedSessionStartTime = state.sessionStartTime

        // Restore remaining time and pause state
        segmentRemaining = state.segmentRemaining
        pausedAt = state.pausedAt
        segmentEndTime = nil  // Will be set when resumed
        status = .paused

        // Re-activate audio session and keepalive
        try? audioManager.activateSession()
        audioManager.startKeepalive()
    }

    /// Resume from paused state
    func resume() {
        guard status == .paused else { return }

        // Set new end time based on remaining time
        segmentEndTime = Date().addingTimeInterval(segmentRemaining)
        pausedAt = nil
        status = .active

        startTimer()
        startNowPlayingUpdates()
        updateNowPlayingInfo()
        cancelPauseTimeout()
    }

    /// Pause the session
    func pause() {
        guard status == .active, let endTime = segmentEndTime else { return }

        // Store remaining time when paused
        segmentRemaining = max(0, endTime.timeIntervalSince(Date()))
        pausedAt = Date()
        segmentEndTime = nil  // Clear end time while paused

        timer?.cancel()
        timer = nil
        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = nil
        status = .paused
        updateNowPlayingInfo()
        startPauseTimeout()
    }

    /// Skip the current segment
    func skipSegment() {
        guard status == .active || status == .paused else { return }

        // Stop any playing narration (matches PWA)
        audioManager.stopNarration()

        // Record skip for current stretch
        if let selected = currentSelectedStretch {
            skippedSegments[selected.id, default: 0] += 1
        }

        // Move to next segment
        Task {
            await handleSegmentComplete()
        }
    }

    /// Skip the entire current stretch (both segments)
    func skipStretch() {
        guard status == .active || status == .paused else { return }

        // Stop any playing narration (matches PWA)
        audioManager.stopNarration()

        // Record both segments as skipped
        if let selected = currentSelectedStretch {
            skippedSegments[selected.id, default: 0] = 2
        }

        Task {
            await advanceToNextStretch()
        }
    }

    /// Play the full narration for the current stretch on demand
    func playFullNarration() {
        guard status == .active || status == .paused,
              let stretch = currentStretch else { return }
        audioManager.playNarrationAsync(audioManager.audioURL(for: stretch.id))
    }

    /// End the session early (without saving) - resets directly to idle
    func endSession() {
        timer?.cancel()
        timer = nil
        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = nil
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = nil
        audioManager.stopAllAudio()
        audioManager.deactivateSession()
        clearNowPlayingInfo()
        resetState()
    }

    /// Reset to idle state
    func reset() {
        timer?.cancel()
        timer = nil
        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = nil
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = nil
        audioManager.stopAllAudio()
        audioManager.deactivateSession()
        clearNowPlayingInfo()
        resetState()
    }

    private func resetState() {
        status = .idle
        currentStretchIndex = 0
        currentSegment = 1
        segmentRemaining = 0
        selectedStretches = []
        completedStretches = []
        skippedSegments = [:]
        storedSessionStartTime = nil
        segmentEndTime = nil
        pausedAt = nil
        spotifyState = .idle
        isWaitingForSpotifyReturn = false
        isReadyForAudioPrep = false
        pendingConfig = nil
    }

    // MARK: - State Export for Persistence

    func exportState() -> StretchSessionPersistableState {
        StretchSessionPersistableState(
            selectedStretches: selectedStretches,
            currentStretchIndex: currentStretchIndex,
            currentSegment: currentSegment,
            segmentRemaining: segmentRemaining,
            completedStretches: completedStretches,
            skippedSegments: skippedSegments,
            sessionStartTime: storedSessionStartTime,
            pausedAt: status == .paused ? Date() : nil
        )
    }
}
