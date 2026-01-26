import Foundation
import Combine

/// Session status states
enum StretchSessionStatus: String, Codable {
    case idle
    case active
    case paused
    case complete
}

/// Observable session manager for stretch sessions
/// Handles segment-based timing, narration triggers, and state persistence
@MainActor
class StretchSessionManager: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var status: StretchSessionStatus = .idle
    @Published private(set) var currentStretchIndex: Int = 0
    @Published private(set) var currentSegment: Int = 1  // 1 or 2
    @Published private(set) var segmentRemaining: TimeInterval = 0
    @Published private(set) var selectedStretches: [SelectedStretch] = []
    @Published private(set) var completedStretches: [CompletedStretch] = []

    // MARK: - Computed Properties

    var currentSelectedStretch: SelectedStretch? {
        guard currentStretchIndex < selectedStretches.count else { return nil }
        return selectedStretches[currentStretchIndex]
    }

    var currentStretch: Stretch? {
        currentSelectedStretch?.stretch
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
    private var segmentStartedAt: Date?
    private var pausedElapsed: TimeInterval = 0
    private var timer: AnyCancellable?
    private var skippedSegments: [String: Int] = [:]  // stretchId -> skipped count

    private let audioManager: StretchAudioManager
    private let manifestLoader: StretchManifestLoader

    // MARK: - Initialization

    init(
        audioManager: StretchAudioManager = StretchAudioManager(),
        manifestLoader: StretchManifestLoader = .shared
    ) {
        self.audioManager = audioManager
        self.manifestLoader = manifestLoader
    }

    // MARK: - Session Control

    /// Start a new stretch session with the given configuration
    func start(with config: StretchSessionConfig) async {
        // Select random stretches for each enabled region
        do {
            selectedStretches = try manifestLoader.selectStretches(for: config)
        } catch {
            print("Failed to select stretches: \(error)")
            return
        }

        guard !selectedStretches.isEmpty else {
            print("No stretches selected")
            return
        }

        // Open Spotify if configured
        if let spotifyUrl = config.spotifyPlaylistUrl, !spotifyUrl.isEmpty {
            audioManager.openSpotifyPlaylist(spotifyUrl)
            // Small delay to let Spotify open before playing narration
            try? await Task.sleep(nanoseconds: 1_000_000_000)  // 1 second
        }

        // Reset state
        currentStretchIndex = 0
        currentSegment = 1
        completedStretches = []
        skippedSegments = [:]
        _sessionStartTime = Date()

        // Play first stretch narration
        let firstStretch = selectedStretches[0]
        try? await audioManager.playNarration(firstStretch.stretch.audioFiles.begin)

        // Start timer
        segmentStartedAt = Date()
        pausedElapsed = 0
        segmentRemaining = segmentDuration
        status = .active
        startTimer()
    }

    /// Restore a session from saved state
    func restore(from state: StretchSessionPersistableState) {
        selectedStretches = state.selectedStretches
        currentStretchIndex = state.currentStretchIndex
        currentSegment = state.currentSegment
        completedStretches = state.completedStretches
        skippedSegments = state.skippedSegments
        _sessionStartTime = state.sessionStartTime

        // Calculate remaining time
        segmentRemaining = state.segmentRemaining
        pausedElapsed = 0
        status = .paused
    }

    /// Resume from paused state
    func resume() {
        guard status == .paused else { return }
        segmentStartedAt = Date()
        status = .active
        startTimer()
    }

    /// Pause the session
    func pause() {
        guard status == .active else { return }
        pausedElapsed = segmentElapsed
        timer?.cancel()
        timer = nil
        status = .paused
    }

    /// Skip the current segment
    func skipSegment() {
        guard status == .active || status == .paused else { return }

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

        // Record both segments as skipped
        if let selected = currentSelectedStretch {
            skippedSegments[selected.id, default: 0] = 2
        }

        Task {
            await advanceToNextStretch()
        }
    }

    /// End the session early
    func endSession() {
        timer?.cancel()
        timer = nil
        audioManager.stopAudio()
        finalizeSession()
    }

    /// Reset to idle state
    func reset() {
        timer?.cancel()
        timer = nil
        audioManager.stopAudio()

        status = .idle
        currentStretchIndex = 0
        currentSegment = 1
        segmentRemaining = 0
        selectedStretches = []
        completedStretches = []
        skippedSegments = [:]
        _sessionStartTime = nil
        segmentStartedAt = nil
        pausedElapsed = 0
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

        timer = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self else { return }
                self.updateTimer()
            }
    }

    private func updateTimer() {
        guard status == .active, let startedAt = segmentStartedAt else { return }

        let elapsed = Date().timeIntervalSince(startedAt) + pausedElapsed
        let remaining = segmentDuration - elapsed

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
            // Advance to segment 2
            currentSegment = 2
            segmentStartedAt = Date()
            pausedElapsed = 0
            segmentRemaining = segmentDuration

            // Play transition narration
            if let stretch = currentStretch {
                let sharedAudio = try? manifestLoader.getSharedAudio()
                let clipPath = stretch.bilateral
                    ? (sharedAudio?.switchSides ?? "shared/switch-sides.wav")
                    : (sharedAudio?.halfway ?? "shared/halfway.wav")

                // Play narration without blocking timer
                audioManager.playNarrationAsync(clipPath)
            }

            if status == .active {
                startTimer()
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
                stretchId: selected.stretch.id,
                stretchName: selected.stretch.name,
                durationSeconds: selected.durationSeconds,
                skippedSegments: skipped
            )
            completedStretches.append(completed)
        }

        if isLastStretch {
            // Session complete
            let sharedAudio = try? manifestLoader.getSharedAudio()
            try? await audioManager.playNarration(
                sharedAudio?.sessionComplete ?? "shared/session-complete.wav"
            )
            finalizeSession()
        } else {
            // Advance to next stretch
            currentStretchIndex += 1
            currentSegment = 1
            segmentStartedAt = Date()
            pausedElapsed = 0
            segmentRemaining = segmentDuration

            // Play next stretch narration
            if let nextStretch = currentStretch {
                audioManager.playNarrationAsync(nextStretch.audioFiles.begin)
            }

            if status == .active {
                startTimer()
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
                stretchId: selected.stretch.id,
                stretchName: selected.stretch.name,
                durationSeconds: selected.durationSeconds,
                skippedSegments: max(skipped, currentSegment == 1 ? 2 : 1)
            )
            completedStretches.append(completed)
        }

        status = .complete
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
