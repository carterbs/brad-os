import Foundation
import AVFoundation
import BradOSCore

/// Service for loading guided meditation scripts and preparing audio
@MainActor
final class GuidedMeditationService: ObservableObject {
    static let shared = GuidedMeditationService()

    // MARK: - Published State

    @Published var scripts: [GuidedMeditationScript] = []
    @Published var preparationProgress: Double = 0
    @Published var isPreparing: Bool = false

    // MARK: - Dependencies

    private let apiClient = APIClient.shared
    private let cache = TTSAudioCache.shared

    // MARK: - Load Scripts

    func loadScripts(category: String) async throws {
        scripts = try await apiClient.getGuidedMeditationScripts(category: category)
    }

    /// Load full script with segments
    func loadFullScript(id: String) async throws -> GuidedMeditationScript {
        try await apiClient.getGuidedMeditationScript(id: id)
    }

    // MARK: - Prepare Audio

    /// Pre-fetch all audio for a script. Returns prepared segments and resolved interjections.
    func prepareAudio(
        for script: GuidedMeditationScript
    ) async throws -> (segments: [PreparedAudioSegment], interjections: [ResolvedInterjection]) {
        isPreparing = true
        preparationProgress = 0

        defer {
            isPreparing = false
        }

        guard let segments = script.segments, let interjections = script.interjections else {
            throw GuidedMeditationError.scriptMissingContent
        }

        // Count total items to fetch (segments + interjections)
        let totalItems = Double(segments.count + interjections.count)
        var completedItems: Double = 0

        // Prepare segments
        var preparedSegments: [PreparedAudioSegment] = []
        for segment in segments {
            let fileURL = try await cache.getOrFetch(text: segment.text) { text in
                try await self.apiClient.synthesizeSpeech(text: text)
            }

            // Measure actual audio duration
            let asset = AVURLAsset(url: fileURL)
            let duration = try await asset.load(.duration)
            let durationSeconds = CMTimeGetSeconds(duration)

            preparedSegments.append(PreparedAudioSegment(
                segmentId: segment.id,
                phase: segment.phase,
                startSeconds: segment.startSeconds,
                audioFileURL: fileURL,
                audioDuration: durationSeconds
            ))

            completedItems += 1
            preparationProgress = completedItems / totalItems
        }

        // Resolve and prepare interjections
        var resolvedInterjections: [ResolvedInterjection] = []
        for interjection in interjections {
            // Pick random time within window
            let scheduledSeconds = Int.random(in: interjection.windowStartSeconds...interjection.windowEndSeconds)

            // Pick random text option
            guard let text = interjection.textOptions.randomElement() else { continue }

            let fileURL = try await cache.getOrFetch(text: text) { text in
                try await self.apiClient.synthesizeSpeech(text: text)
            }

            // Measure duration
            let asset = AVURLAsset(url: fileURL)
            let duration = try await asset.load(.duration)
            let durationSeconds = CMTimeGetSeconds(duration)

            resolvedInterjections.append(ResolvedInterjection(
                scheduledSeconds: scheduledSeconds,
                audioFileURL: fileURL,
                audioDuration: durationSeconds
            ))

            completedItems += 1
            preparationProgress = completedItems / totalItems
        }

        preparationProgress = 1.0
        return (preparedSegments, resolvedInterjections)
    }
}

// MARK: - Errors

enum GuidedMeditationError: LocalizedError {
    case scriptMissingContent
    case audioPreparationFailed(String)

    var errorDescription: String? {
        switch self {
        case .scriptMissingContent:
            return "Script is missing segments or interjections"
        case .audioPreparationFailed(let reason):
            return "Failed to prepare audio: \(reason)"
        }
    }
}
