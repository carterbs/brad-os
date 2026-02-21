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
        preparationProgress = 0

        guard let segments = script.segments, let interjections = script.interjections else {
            throw GuidedMeditationError.scriptMissingContent
        }

        let totalItems = Double(segments.count + interjections.count)
        var completedItems: Double = 0

        let preparedSegments = try await prepareSegments(
            segments, totalItems: totalItems, completedItems: &completedItems
        )
        let resolvedInterjections = try await prepareInterjections(
            interjections, totalItems: totalItems, completedItems: &completedItems
        )

        preparationProgress = 1.0
        return (preparedSegments, resolvedInterjections)
    }

    private func prepareSegments(
        _ segments: [GuidedMeditationSegment],
        totalItems: Double,
        completedItems: inout Double
    ) async throws -> [PreparedAudioSegment] {
        var prepared: [PreparedAudioSegment] = []
        for segment in segments {
            let fileURL = try await cache.getOrFetch(text: segment.text) { text in
                try await self.apiClient.synthesizeSpeech(text: text)
            }
            let asset = AVURLAsset(url: fileURL)
            let duration = try await asset.load(.duration)
            prepared.append(PreparedAudioSegment(
                segmentId: segment.id,
                phase: segment.phase,
                startSeconds: segment.startSeconds,
                audioFileURL: fileURL,
                audioDuration: CMTimeGetSeconds(duration)
            ))
            completedItems += 1
            preparationProgress = completedItems / totalItems
        }
        return prepared
    }

    private func prepareInterjections(
        _ interjections: [GuidedMeditationInterjection],
        totalItems: Double,
        completedItems: inout Double
    ) async throws -> [ResolvedInterjection] {
        var resolved: [ResolvedInterjection] = []
        for interjection in interjections {
            let scheduledSeconds = Int.random(
                in: interjection.windowStartSeconds...interjection.windowEndSeconds
            )
            guard let text = interjection.textOptions.randomElement() else { continue }
            let fileURL = try await cache.getOrFetch(text: text) { text in
                try await self.apiClient.synthesizeSpeech(text: text)
            }
            let asset = AVURLAsset(url: fileURL)
            let duration = try await asset.load(.duration)
            resolved.append(ResolvedInterjection(
                scheduledSeconds: scheduledSeconds,
                audioFileURL: fileURL,
                audioDuration: CMTimeGetSeconds(duration)
            ))
            completedItems += 1
            preparationProgress = completedItems / totalItems
        }
        return resolved
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
