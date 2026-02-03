import Foundation
import BradOSCore

// MARK: - Session models

/// A stretch selected for a session with timing info
struct SelectedStretch: Identifiable, Codable, Hashable {
    var id: String { "\(region.rawValue)-\(definition.id)" }
    let region: BodyRegion
    let definition: StretchDefinition
    let durationSeconds: Int

    /// Duration of each segment (half of total duration)
    var segmentDuration: Int {
        durationSeconds / 2
    }

    /// Number of segments (always 2)
    var totalSegments: Int {
        2
    }

    // MARK: - Backward compatibility for persisted sessions
    // Old sessions stored `stretch` key; new code uses `definition`.
    // CodingKeys maps the JSON key "stretch" to the Swift property `definition`,
    // so both old and new persisted sessions decode correctly.

    private enum CodingKeys: String, CodingKey {
        case region
        case definition = "stretch"
        case durationSeconds
    }
}
