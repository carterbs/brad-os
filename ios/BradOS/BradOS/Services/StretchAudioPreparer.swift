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
    let stretchAudio: [String: URL] // stretchId -> cached MP3 URL
    let switchSidesURL: URL
    let halfwayURL: URL
    let sessionCompleteURL: URL
}

/// Prepares all TTS audio for a stretch session before it starts.
/// Fetches from cache or synthesizes via API, with progress tracking.
@MainActor
final class StretchAudioPreparer: ObservableObject {
    @Published var progress: Double = 0
    @Published var isPreparing: Bool = false
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
        isPreparing = true
        progress = 0
        error = nil

        let totalItems = stretches.count + SharedStretchCue.allCases.count
        var completedItems = 0

        // Prepare stretch narration audio
        var stretchAudio: [String: URL] = [:]

        for stretch in stretches {
            do {
                let url = try await cache.getOrFetch(
                    text: stretch.definition.description,
                    using: apiClient
                )
                stretchAudio[stretch.definition.id] = url
            } catch {
                // Skip this stretch's narration on failure — session can still run
                print("StretchAudioPreparer: Failed to prepare audio for \(stretch.definition.id): \(error)")
            }

            completedItems += 1
            progress = Double(completedItems) / Double(totalItems)
        }

        // Prepare shared cue audio
        var sharedURLs: [SharedStretchCue: URL] = [:]

        for cue in SharedStretchCue.allCases {
            do {
                let url = try await cache.getOrFetch(text: cue.text, using: apiClient)
                sharedURLs[cue] = url
            } catch {
                print("StretchAudioPreparer: Failed to prepare shared cue \(cue.rawValue): \(error)")
            }

            completedItems += 1
            progress = Double(completedItems) / Double(totalItems)
        }

        isPreparing = false

        // If all shared cues failed, surface an error but don't throw
        // The session can still run without audio
        guard let switchSidesURL = sharedURLs[.switchSides],
              let halfwayURL = sharedURLs[.halfway],
              let sessionCompleteURL = sharedURLs[.sessionComplete] else {
            let prepared = PreparedStretchAudio(
                stretchAudio: stretchAudio,
                switchSidesURL: sharedURLs[.switchSides] ?? URL(fileURLWithPath: ""),
                halfwayURL: sharedURLs[.halfway] ?? URL(fileURLWithPath: ""),
                sessionCompleteURL: sharedURLs[.sessionComplete] ?? URL(fileURLWithPath: "")
            )
            self.error = .unknown("Some audio cues could not be prepared")
            return prepared
        }

        return PreparedStretchAudio(
            stretchAudio: stretchAudio,
            switchSidesURL: switchSidesURL,
            halfwayURL: halfwayURL,
            sessionCompleteURL: sessionCompleteURL
        )
    }
}
