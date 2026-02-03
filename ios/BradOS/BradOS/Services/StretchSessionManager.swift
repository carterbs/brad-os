import Foundation
import Combine
import MediaPlayer
import UIKit
import BradOSCore

/// Session status states
enum StretchSessionStatus: String, Codable {
    case idle
    case active
    case paused
    case complete
}

/// Observable session manager for stretch sessions
/// Handles segment-based timing, narration triggers, and state persistence
///
/// Timer behavior matches PWA:
/// - Timer starts immediately when a segment begins
/// - Narration plays asynchronously (timer runs during narration)
/// - Keepalive audio maintains background playback
@MainActor
class StretchSessionManager: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var status: StretchSessionStatus = .idle
    @Published private(set) var currentStretchIndex: Int = 0
    @Published private(set) var currentSegment: Int = 1  // 1 or 2
    @Published private(set) var segmentRemaining: TimeInterval = 0
    @Published private(set) var selectedStretches: [SelectedStretch] = []
    @Published private(set) var completedStretches: [CompletedStretch] = []

    /// Whether we're waiting for the user to return from Spotify
    @Published private(set) var isWaitingForSpotifyReturn: Bool = false

    /// Set to true when Spotify wait ends, signaling the view to start audio prep
    @Published private(set) var isReadyForAudioPrep: Bool = false

    // MARK: - Computed Properties

    var currentSelectedStretch: SelectedStretch? {
        guard currentStretchIndex < selectedStretches.count else { return nil }
        return selectedStretches[currentStretchIndex]
    }

    var currentStretch: StretchDefinition? {
        currentSelectedStretch?.definition
    }

    var currentRegion: BodyRegion? {
        currentSelectedStretch?.region
    }

    var totalStretches: Int {
        selectedStretches.count
    }

    var segmentDuration: TimeInterval {
        guard let selected = currentSelectedStretch else { return 30 }
        return TimeInterval(selected.segmentDuration)
    }

    var segmentElapsed: TimeInterval {
        segmentDuration - segmentRemaining
    }

    var sessionStartTime: Date? {
        _sessionStartTime
    }

    var isFirstSegment: Bool {
        currentSegment == 1
    }

    var isLastStretch: Bool {
        currentStretchIndex == selectedStretches.count - 1
    }

    var progressFraction: Double {
        guard totalStretches > 0 else { return 0 }
        let completedSegments = currentStretchIndex * 2 + (currentSegment - 1)
        let totalSegments = totalStretches * 2
        return Double(completedSegments) / Double(totalSegments)
    }

    // MARK: - Private Properties

    private var _sessionStartTime: Date?
    private var segmentEndTime: Date?  // Target end time for current segment (background-safe)
    private var pausedAt: Date?
    private var timer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "com.bradcarter.brad-os.stretch-timer", qos: .userInteractive)
    private var skippedSegments: [String: Int] = [:]  // stretchId -> skipped count

    private let audioManager: StretchAudioManager
    private var nowPlayingUpdateTimer: AnyCancellable?
    private var pauseTimeoutTimer: AnyCancellable?

    /// Pause timeout in seconds (matches PWA's PAUSE_TIMEOUT_MS = 30 minutes)
    private let pauseTimeoutSeconds: TimeInterval = 30 * 60

    /// Spotify state machine (matching PWA pattern)
    private enum SpotifyState {
        case idle
        case waitingForHide  // Waiting for app to lose focus (Spotify opening)
        case waitingForVisible  // Waiting for app to regain focus (user returning)
    }
    private var spotifyState: SpotifyState = .idle
    private var pendingConfig: StretchSessionConfig?
    private var appStateObserver: AnyCancellable?

    // MARK: - Initialization

    init(audioManager: StretchAudioManager? = nil) {
        self.audioManager = audioManager ?? StretchAudioManager()
        setupRemoteCommandCenter()
        setupAppStateObserver()
    }

    // MARK: - App State Observer (for Spotify return detection)

    private func setupAppStateObserver() {
        // Observe app lifecycle for Spotify return detection
        appStateObserver = NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.handleAppBecameActive()
                }
            }
    }

    private func handleAppBecameActive() {
        // Ensure keepalive audio is still running for active/paused sessions.
        // iOS may have suspended audio playback while the app was backgrounded
        // or the screen was locked, so we re-verify here.
        if status == .active || status == .paused {
            audioManager.ensureKeepaliveActive()
        }

        switch spotifyState {
        case .waitingForVisible:
            // User returned from Spotify — signal the view to start audio prep
            spotifyState = .idle
            isWaitingForSpotifyReturn = false
            pendingConfig = nil
            isReadyForAudioPrep = true
        case .waitingForHide:
            // App became active before losing focus - Spotify may have failed to open
            // Give a short delay then fall through
            Task {
                try? await Task.sleep(nanoseconds: 500_000_000)  // 0.5 seconds
                if self.spotifyState == .waitingForHide {
                    // Still waiting, Spotify didn't open, proceed anyway
                    self.spotifyState = .idle
                    self.isWaitingForSpotifyReturn = false
                    self.pendingConfig = nil
                    self.isReadyForAudioPrep = true
                }
            }
        case .idle:
            break
        }
    }

    // MARK: - Session Control

    /// Start a new stretch session: opens Spotify, waits for user to return.
    /// After return, sets `isReadyForAudioPrep = true` so the view can prep TTS audio,
    /// then call `beginSession(audio:)` to kick off the timer.
    func start(with config: StretchSessionConfig, stretches: [SelectedStretch]) async {
        selectedStretches = stretches
        isReadyForAudioPrep = false

        guard !selectedStretches.isEmpty else {
            print("No stretches selected")
            return
        }

        // Store config for when user returns
        pendingConfig = config

        // Open Spotify if configured
        if let spotifyUrl = config.spotifyPlaylistUrl, !spotifyUrl.isEmpty {
            _ = audioManager.openSpotifyPlaylist(spotifyUrl)
        }

        // Always wait for app to be backgrounded and return (like PWA visibility detection)
        // This gives user time to start music in any app before stretching begins
        spotifyState = .waitingForHide
        isWaitingForSpotifyReturn = true

        // Monitor for app going to background
        let backgroundObserver = NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .first()
            .sink { [weak self] _ in
                Task { @MainActor in
                    if self?.spotifyState == .waitingForHide {
                        self?.spotifyState = .waitingForVisible
                    }
                }
            }

        // Store observer to keep it alive
        var observers: [AnyCancellable] = []
        observers.append(backgroundObserver)

        // Note: No timeout - user must explicitly come back or tap "Start Now"
        // This matches the expected behavior where timer only starts after refocus
    }

    /// Called by the view after audio prep completes. Sets audio sources and starts the session.
    func beginSession(audio: PreparedStretchAudio) async {
        audioManager.setAudioSources(audio)
        isReadyForAudioPrep = false
        await startSessionInternal()
    }

    /// Internal method to actually start the session (called after Spotify return or immediately)
    private func startSessionInternal() async {
        // Reset state
        currentStretchIndex = 0
        currentSegment = 1
        completedStretches = []
        skippedSegments = [:]
        pausedAt = nil
        _sessionStartTime = Date()

        // Activate audio session and start keepalive
        try? audioManager.activateSession()
        audioManager.startKeepalive()

        // Start timer FIRST (matches PWA - timer runs during narration)
        // Use target end time for background-safe timing
        segmentEndTime = Date().addingTimeInterval(segmentDuration)
        segmentRemaining = segmentDuration
        status = .active
        startTimer()

        // Setup Now Playing
        updateNowPlayingInfo()
        startNowPlayingUpdates()

        // Play first stretch narration ASYNCHRONOUSLY (timer continues during playback)
        let firstStretch = selectedStretches[0]
        audioManager.playNarrationAsync(audioManager.audioURL(for: firstStretch.definition.id))
    }

    /// Restore a session from saved state
    func restore(from state: StretchSessionPersistableState) {
        selectedStretches = state.selectedStretches
        currentStretchIndex = state.currentStretchIndex
        currentSegment = state.currentSegment
        completedStretches = state.completedStretches
        skippedSegments = state.skippedSegments
        _sessionStartTime = state.sessionStartTime

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

    // MARK: - Pause Timeout (matches PWA's 30 minute auto-end)

    private func startPauseTimeout() {
        pauseTimeoutTimer?.cancel()
        pauseTimeoutTimer = Timer.publish(every: 60, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.checkPauseTimeout()
            }
    }

    private func cancelPauseTimeout() {
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
        // Reset directly to idle without going through complete state
        // This ensures no session is saved when ending early
        status = .idle
        currentStretchIndex = 0
        currentSegment = 1
        segmentRemaining = 0
        selectedStretches = []
        completedStretches = []
        skippedSegments = [:]
        _sessionStartTime = nil
        segmentEndTime = nil
        pausedAt = nil
        spotifyState = .idle
        isWaitingForSpotifyReturn = false
        isReadyForAudioPrep = false
        pendingConfig = nil
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

        status = .idle
        currentStretchIndex = 0
        currentSegment = 1
        segmentRemaining = 0
        selectedStretches = []
        completedStretches = []
        skippedSegments = [:]
        _sessionStartTime = nil
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
            sessionStartTime: _sessionStartTime,
            pausedAt: status == .paused ? Date() : nil
        )
    }

    // MARK: - Private Methods

    private func startTimer() {
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

    private func updateTimer() {
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

    private func handleSegmentComplete() async {
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

    private func advanceToNextStretch() async {
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

            // Play next stretch narration ASYNCHRONOUSLY (timer continues during playback)
            if let nextStretch = currentStretch {
                audioManager.playNarrationAsync(audioManager.audioURL(for: nextStretch.id))
            }
        }
    }

    private func finalizeSession() {
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

    /// Cancel any pending Spotify wait (user tapped "Start Now")
    func cancelSpotifyWait() {
        spotifyState = .idle
        isWaitingForSpotifyReturn = false
        pendingConfig = nil
        isReadyForAudioPrep = true
    }
}

// MARK: - Now Playing / Lock Screen Controls

extension StretchSessionManager {
    /// Setup remote command center for lock screen controls
    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()

        // Play command
        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.resume()
            }
            return .success
        }

        // Pause command
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.pause()
            }
            return .success
        }

        // Toggle play/pause command
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                if self.status == .paused {
                    self.resume()
                } else if self.status == .active {
                    self.pause()
                }
            }
            return .success
        }

        // Next track command (skip segment)
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.skipSegment()
            }
            return .success
        }

        // Disable unused commands
        commandCenter.previousTrackCommand.isEnabled = false
        commandCenter.skipForwardCommand.isEnabled = false
        commandCenter.skipBackwardCommand.isEnabled = false
        commandCenter.seekForwardCommand.isEnabled = false
        commandCenter.seekBackwardCommand.isEnabled = false
    }

    /// Start periodic updates of Now Playing info for elapsed time
    private func startNowPlayingUpdates() {
        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = Timer.publish(every: 1.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.updateNowPlayingInfo()
            }
    }

    /// Update the Now Playing info center with current stretch info
    func updateNowPlayingInfo() {
        guard let selected = currentSelectedStretch else {
            clearNowPlayingInfo()
            return
        }

        var info = [String: Any]()

        // Title: stretch name
        info[MPMediaItemPropertyTitle] = selected.definition.name

        // Artist: region and segment info
        let segmentLabel = selected.definition.bilateral
            ? (currentSegment == 1 ? "Left Side" : "Right Side")
            : (currentSegment == 1 ? "First Half" : "Second Half")
        info[MPMediaItemPropertyArtist] = "\(selected.region.displayName) - \(segmentLabel)"

        // Album: session context
        info[MPMediaItemPropertyAlbumTitle] = "Stretching Session"

        // Timing info
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = segmentElapsed
        info[MPMediaItemPropertyPlaybackDuration] = segmentDuration
        info[MPNowPlayingInfoPropertyPlaybackRate] = status == .active ? 1.0 : 0.0

        // Default playback rate when playing
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /// Clear the Now Playing info
    func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

// MARK: - Persistable State

/// State that can be persisted for crash recovery
struct StretchSessionPersistableState: Codable {
    let selectedStretches: [SelectedStretch]
    let currentStretchIndex: Int
    let currentSegment: Int
    let segmentRemaining: TimeInterval
    let completedStretches: [CompletedStretch]
    let skippedSegments: [String: Int]
    let sessionStartTime: Date?
    let pausedAt: Date?
}
