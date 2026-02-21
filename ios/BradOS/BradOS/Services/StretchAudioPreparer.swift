import Foundation
import BradOSCore

/// Shared cue identifiers for stretch sessions
enum SharedStretchCue: String, CaseIterable {
    case switchSides
    case halfway
    case sessionComplete

    var text: String {
        switch self {
        case .switchSides: return "Now switch to the other side."
        case .halfway: return "You're halfway through this stretch."
        case .sessionComplete: return "Great work! Your stretching session is complete."
        }
    }
}

/// Pre-fetched audio URLs for a stretch session
struct PreparedStretchAudio {
    let stretchAudio: [String: URL] // stretchId -> cached MP3 URL (full instructions)
    let stretchNameAudio: [String: URL] // stretchId -> cached MP3 URL (name only)
    let switchSidesURL: URL
    let halfwayURL: URL
    let sessionCompleteURL: URL
}

/// Prepares all TTS audio for a stretch session before it starts.
/// Fetches from cache or synthesizes via API, with progress tracking.
@MainActor
final class StretchAudioPreparer: ObservableObject {
    @Published var progress: Double = 0
    @Published var error: APIError?

    private let apiClient: APIClientProtocol
    private let cache: StretchAudioCache

    init(apiClient: APIClientProtocol = APIClient.shared, cache: StretchAudioCache = .shared) {
        self.apiClient = apiClient
        self.cache = cache
    }

    /// Prepare all audio for the given stretches and shared cues.
    /// Returns PreparedStretchAudio with cached URLs for all clips.
    func prepareAudio(for stretches: [SelectedStretch]) async throws -> PreparedStretchAudio {
        progress = 0
        error = nil

        let totalItems = (stretches.count * 2) + SharedStretchCue.allCases.count
        var completedItems = 0

        let (stretchAudio, stretchNameAudio) = await prepareStretchClips(
            stretches, totalItems: totalItems, completedItems: &completedItems
        )
        let sharedURLs = await prepareSharedCues(
            totalItems: totalItems, completedItems: &completedItems
        )

        return buildResult(stretchAudio: stretchAudio, stretchNameAudio: stretchNameAudio, sharedURLs: sharedURLs)
    }

    private func prepareStretchClips(
        _ stretches: [SelectedStretch],
        totalItems: Int,
        completedItems: inout Int
    ) async -> ([String: URL], [String: URL]) {
        var stretchAudio: [String: URL] = [:]
        var stretchNameAudio: [String: URL] = [:]

        for stretch in stretches {
            if let url = try? await cache.getOrFetch(
                text: "\(stretch.definition.name). \(stretch.region.displayName). \(stretch.definition.description)",
                using: apiClient
            ) {
                stretchAudio[stretch.definition.id] = url
            }
            completedItems += 1
            progress = Double(completedItems) / Double(totalItems)

            if let url = try? await cache.getOrFetch(text: stretch.definition.name, using: apiClient) {
                stretchNameAudio[stretch.definition.id] = url
            }
            completedItems += 1
            progress = Double(completedItems) / Double(totalItems)
        }
        return (stretchAudio, stretchNameAudio)
    }

    private func prepareSharedCues(
        totalItems: Int,
        completedItems: inout Int
    ) async -> [SharedStretchCue: URL] {
        var sharedURLs: [SharedStretchCue: URL] = [:]
        for cue in SharedStretchCue.allCases {
            if let url = try? await cache.getOrFetch(text: cue.text, using: apiClient) {
                sharedURLs[cue] = url
            }
            completedItems += 1
            progress = Double(completedItems) / Double(totalItems)
        }
        return sharedURLs
    }

    private func buildResult(
        stretchAudio: [String: URL],
        stretchNameAudio: [String: URL],
        sharedURLs: [SharedStretchCue: URL]
    ) -> PreparedStretchAudio {
        guard let switchSidesURL = sharedURLs[.switchSides],
              let halfwayURL = sharedURLs[.halfway],
              let sessionCompleteURL = sharedURLs[.sessionComplete] else {
            self.error = .unknown("Some audio cues could not be prepared")
            return PreparedStretchAudio(
                stretchAudio: stretchAudio,
                stretchNameAudio: stretchNameAudio,
                switchSidesURL: sharedURLs[.switchSides] ?? URL(fileURLWithPath: ""),
                halfwayURL: sharedURLs[.halfway] ?? URL(fileURLWithPath: ""),
                sessionCompleteURL: sharedURLs[.sessionComplete] ?? URL(fileURLWithPath: "")
            )
        }
        return PreparedStretchAudio(
            stretchAudio: stretchAudio,
            stretchNameAudio: stretchNameAudio,
            switchSidesURL: switchSidesURL,
            halfwayURL: halfwayURL,
            sessionCompleteURL: sessionCompleteURL
        )
    }
}
