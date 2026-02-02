import Foundation

// MARK: - Category

enum MeditationCategory: String, CaseIterable, Identifiable, Codable {
    case breathing
    case reactivity

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .breathing: return "Breathing"
        case .reactivity: return "Reactivity"
        }
    }

    var subtitle: String {
        switch self {
        case .breathing: return "Focus on your breath"
        case .reactivity: return "Guided meditation series"
        }
    }

    var icon: String {
        switch self {
        case .breathing: return "wind"
        case .reactivity: return "brain.head.profile"
        }
    }
}

// MARK: - Prepared Audio

struct PreparedAudioSegment {
    let segmentId: String
    let phase: String
    let startSeconds: Int
    let audioFileURL: URL
    let audioDuration: TimeInterval  // Measured via AVURLAsset
}

struct ResolvedInterjection {
    let scheduledSeconds: Int       // Random time within window
    let audioFileURL: URL           // Already cached TTS file
    let audioDuration: TimeInterval // Measured
}
