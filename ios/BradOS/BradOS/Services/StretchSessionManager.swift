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

    @Published var status: StretchSessionStatus = .idle
    @Published var currentStretchIndex: Int = 0
    @Published var currentSegment: Int = 1  // 1 or 2
    @Published var segmentRemaining: TimeInterval = 0
    @Published var selectedStretches: [SelectedStretch] = []
    @Published var completedStretches: [CompletedStretch] = []

    /// Whether we're waiting for the user to return from Spotify
    @Published var isWaitingForSpotifyReturn: Bool = false

    /// Set to true when Spotify wait ends, signaling the view to start audio prep
    @Published var isReadyForAudioPrep: Bool = false

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
        storedSessionStartTime
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

    // MARK: - Internal Properties (accessed by extensions)

    var storedSessionStartTime: Date?
    var segmentEndTime: Date?  // Target end time for current segment (background-safe)
    var pausedAt: Date?
    var timer: DispatchSourceTimer?
    let timerQueue = DispatchQueue(label: "com.bradcarter.brad-os.stretch-timer", qos: .userInteractive)
    var skippedSegments: [String: Int] = [:]  // stretchId -> skipped count

    let audioManager: StretchAudioManager
    var nowPlayingUpdateTimer: AnyCancellable?
    var pauseTimeoutTimer: AnyCancellable?

    /// Pause timeout in seconds (matches PWA's PAUSE_TIMEOUT_MS = 30 minutes)
    let pauseTimeoutSeconds: TimeInterval = 30 * 60

    /// Spotify state machine (matching PWA pattern)
    enum SpotifyState {
        case idle
        case waitingForHide  // Waiting for app to lose focus (Spotify opening)
        case waitingForVisible  // Waiting for app to regain focus (user returning)
    }
    var spotifyState: SpotifyState = .idle
    var pendingConfig: StretchSessionConfig?
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
        storedSessionStartTime = Date()

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

        // Play just the stretch name (timer continues during playback)
        let firstStretch = selectedStretches[0]
        audioManager.playNarrationAsync(audioManager.nameAudioURL(for: firstStretch.definition.id))
    }

    /// Cancel any pending Spotify wait (user tapped "Start Now")
    func cancelSpotifyWait() {
        spotifyState = .idle
        isWaitingForSpotifyReturn = false
        pendingConfig = nil
        isReadyForAudioPrep = true
    }
}
