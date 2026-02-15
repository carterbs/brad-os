import Foundation
import AVFoundation
import Combine
import MediaPlayer

/// Audio pipeline for guided meditation using AVQueuePlayer
/// Builds a complete timeline of TTS clips + silence gaps, fully background-safe
@MainActor
final class GuidedMeditationPipeline: ObservableObject {

    // MARK: - Published State

    @Published var isPlaying: Bool = false
    @Published var currentPhase: String = ""
    @Published var elapsedSeconds: TimeInterval = 0

    // MARK: - Private State

    private var queuePlayer: AVQueuePlayer?
    private var keepalivePlayer: AVAudioPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var cancellables = Set<AnyCancellable>()

    // Timeline tracking
    private struct TimelineEntry {
        let startTime: TimeInterval  // Absolute start time in the full timeline
        let duration: TimeInterval
        let phase: String
        let isAudio: Bool  // true for TTS, false for silence
    }
    private var timelineEntries: [TimelineEntry] = []
    private var totalDuration: TimeInterval = 0

    // Audio session
    private let audioSession = AudioSessionManager.shared
    private let nowPlaying = NowPlayingManager.shared

    // MARK: - Build Timeline

    /// Audio event used during timeline building
    private struct AudioEvent {
        let startSeconds: Int
        let fileURL: URL
        let audioDuration: TimeInterval
        let phase: String
    }

    /// Build the complete audio timeline from prepared segments and interjections
    /// - Parameters:
    ///   - segments: Prepared TTS segments with measured durations
    ///   - interjections: Resolved interjections with scheduled times
    ///   - totalDuration: Total meditation duration in seconds (e.g. 600 for 10 min)
    func buildTimeline(
        from segments: [PreparedAudioSegment],
        interjections: [ResolvedInterjection],
        totalDuration: TimeInterval
    ) throws {
        self.totalDuration = totalDuration

        let events = mergeAndSortEvents(segments: segments, interjections: interjections)
        let playerItems = try buildPlayerItems(from: events, totalDuration: totalDuration)

        // Create queue player
        queuePlayer = AVQueuePlayer(items: playerItems)
        queuePlayer?.actionAtItemEnd = .advance

        // Setup keepalive (safety net for background)
        setupKeepalive()

        // Setup time observer
        setupTimeObserver()

        // Observe final item completion
        if let lastItem = playerItems.last {
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: lastItem,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.handlePlaybackComplete()
                }
            }
        }
    }

    /// Merge segments and interjections into a single sorted event list
    private func mergeAndSortEvents(
        segments: [PreparedAudioSegment],
        interjections: [ResolvedInterjection]
    ) -> [AudioEvent] {
        var events: [AudioEvent] = []

        for segment in segments {
            events.append(AudioEvent(
                startSeconds: segment.startSeconds,
                fileURL: segment.audioFileURL,
                audioDuration: segment.audioDuration,
                phase: segment.phase
            ))
        }

        for interjection in interjections {
            events.append(AudioEvent(
                startSeconds: interjection.scheduledSeconds,
                fileURL: interjection.audioFileURL,
                audioDuration: interjection.audioDuration,
                phase: "interjection"
            ))
        }

        return events.sorted { $0.startSeconds < $1.startSeconds }
    }

    /// Build AVPlayerItems with silence gaps, trailing silence, and bell
    private func buildPlayerItems(from events: [AudioEvent], totalDuration: TimeInterval) throws -> [AVPlayerItem] {
        var playerItems: [AVPlayerItem] = []
        timelineEntries = []
        var currentEndTime: TimeInterval = 0

        for event in events {
            let eventStart = TimeInterval(event.startSeconds)

            // Add silence gap if needed
            let silenceGap = eventStart - currentEndTime
            if silenceGap > 0.5 {
                let silenceURL = try SilenceGenerator.generateSilence(duration: silenceGap)
                playerItems.append(AVPlayerItem(url: silenceURL))

                timelineEntries.append(TimelineEntry(
                    startTime: currentEndTime, duration: silenceGap, phase: "silence", isAudio: false
                ))
                currentEndTime += silenceGap
            }

            // Add the audio event
            playerItems.append(AVPlayerItem(url: event.fileURL))

            timelineEntries.append(TimelineEntry(
                startTime: currentEndTime, duration: event.audioDuration, phase: event.phase, isAudio: true
            ))
            currentEndTime += event.audioDuration
        }

        // Add trailing silence + bell to reach total duration
        let remainingSilence = totalDuration - currentEndTime - 3  // 3 seconds for bell
        if remainingSilence > 0 {
            let silenceURL = try SilenceGenerator.generateSilence(duration: remainingSilence)
            playerItems.append(AVPlayerItem(url: silenceURL))

            timelineEntries.append(TimelineEntry(
                startTime: currentEndTime, duration: remainingSilence, phase: "silence", isAudio: false
            ))
            currentEndTime += remainingSilence
        }

        // Add bell at the end
        if let bellURL = Bundle.main.url(forResource: "bell", withExtension: "wav", subdirectory: "Audio/meditation/shared") {
            playerItems.append(AVPlayerItem(url: bellURL))

            timelineEntries.append(TimelineEntry(
                startTime: currentEndTime, duration: 3, phase: "complete", isAudio: true
            ))
        }

        return playerItems
    }

    // MARK: - Playback Controls

    func play() {
        try? audioSession.activateForMixing()
        queuePlayer?.play()
        keepalivePlayer?.play()
        isPlaying = true
    }

    func pause() {
        queuePlayer?.pause()
        keepalivePlayer?.pause()
        isPlaying = false
    }

    func resume() {
        queuePlayer?.play()
        keepalivePlayer?.play()
        isPlaying = true
    }

    func stop() {
        queuePlayer?.pause()
        queuePlayer?.removeAllItems()
        keepalivePlayer?.stop()
        isPlaying = false
        cleanup()
    }

    // MARK: - Phase Tracking

    /// Determine current phase based on elapsed time
    private func updateCurrentPhase() {
        for entry in timelineEntries.reversed() {
            if elapsedSeconds >= entry.startTime {
                if entry.phase != "silence" && entry.phase != "interjection" {
                    currentPhase = entry.phase
                }
                return
            }
        }
    }

    // MARK: - Time Observer

    private func setupTimeObserver() {
        guard let player = queuePlayer else { return }

        // Update elapsed time every 0.5 seconds
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            Task { @MainActor in
                self.calculateElapsedTime()
                self.updateCurrentPhase()
            }
        }
    }

    /// Calculate total elapsed time by summing completed items + current item progress
    private func calculateElapsedTime() {
        guard let player = queuePlayer else { return }

        // Sum up durations of all completed items (items no longer in the queue)
        let totalItemCount = timelineEntries.count
        let remainingItemCount = player.items().count
        let completedCount = totalItemCount - remainingItemCount

        var elapsed: TimeInterval = 0
        for i in 0..<completedCount {
            if i < timelineEntries.count {
                elapsed += timelineEntries[i].duration
            }
        }

        // Add current item's elapsed time
        if let currentItem = player.currentItem {
            let currentTime = currentItem.currentTime()
            if currentTime.isValid && !currentTime.isIndefinite {
                elapsed += CMTimeGetSeconds(currentTime)
            }
        }

        elapsedSeconds = elapsed
    }

    // MARK: - Keepalive

    private func setupKeepalive() {
        // Use the existing silence file or generate a short one for looping
        if let silenceURL = Bundle.main.url(forResource: "silence", withExtension: "wav", subdirectory: "Audio/meditation/shared") {
            keepalivePlayer = try? AVAudioPlayer(contentsOf: silenceURL)
        } else {
            // Generate a 1-second silence for keepalive
            if let url = try? SilenceGenerator.generateSilence(duration: 1.0) {
                keepalivePlayer = try? AVAudioPlayer(contentsOf: url)
            }
        }
        keepalivePlayer?.numberOfLoops = -1
        keepalivePlayer?.volume = 0.01
        keepalivePlayer?.prepareToPlay()
    }

    // MARK: - Completion

    /// Callback when playback finishes
    var onComplete: (() -> Void)?

    private func handlePlaybackComplete() {
        isPlaying = false
        elapsedSeconds = totalDuration
        currentPhase = "complete"
        keepalivePlayer?.stop()
        onComplete?()
    }

    // MARK: - Cleanup

    private func cleanup() {
        if let observer = timeObserver {
            queuePlayer?.removeTimeObserver(observer)
            timeObserver = nil
        }
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        queuePlayer = nil
        keepalivePlayer = nil
        cancellables.removeAll()
    }

    deinit {
        // Clean up on main actor
        let observer = timeObserver
        let player = queuePlayer
        let endObs = endObserver

        if let observer = observer {
            player?.removeTimeObserver(observer)
        }
        if let endObs = endObs {
            NotificationCenter.default.removeObserver(endObs)
        }
    }
}
