import Foundation

/// Body regions that can be stretched
public enum BodyRegion: String, Codable, CaseIterable, Identifiable, Sendable {
    case neck
    case shoulders
    case back
    case hipFlexors = "hip_flexors"
    case glutes
    case hamstrings
    case quads
    case calves

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .neck: return "Neck"
        case .shoulders: return "Shoulders"
        case .back: return "Back"
        case .hipFlexors: return "Hip Flexors"
        case .glutes: return "Glutes"
        case .hamstrings: return "Hamstrings"
        case .quads: return "Quads"
        case .calves: return "Calves"
        }
    }

    public var iconName: String {
        switch self {
        case .neck: return "person.crop.circle"
        case .shoulders: return "figure.arms.open"
        case .back: return "figure.stand"
        case .hipFlexors: return "figure.walk"
        case .glutes: return "figure.cooldown"
        case .hamstrings: return "figure.flexibility"
        case .quads: return "figure.run"
        case .calves: return "shoe"
        }
    }
}

// MARK: - Server-backed stretch models

/// Individual stretch definition from Firestore
public struct StretchDefinition: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let description: String
    public let bilateral: Bool

    public init(id: String, name: String, description: String, bilateral: Bool) {
        self.id = id
        self.name = name
        self.description = description
        self.bilateral = bilateral
    }
}

/// Region with embedded stretch definitions from Firestore
public struct StretchRegionData: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let region: BodyRegion
    public let displayName: String
    public let iconName: String
    public let stretches: [StretchDefinition]

    public init(id: String, region: BodyRegion, displayName: String, iconName: String, stretches: [StretchDefinition]) {
        self.id = id
        self.region = region
        self.displayName = displayName
        self.iconName = iconName
        self.stretches = stretches
    }
}

/// Configuration for a stretch region
public struct StretchRegionConfig: Codable, Hashable, Identifiable, Sendable {
    public var id: String { region.rawValue }
    public let region: BodyRegion
    public var durationSeconds: Int // 60 or 120
    public var enabled: Bool

    public init(region: BodyRegion, durationSeconds: Int, enabled: Bool) {
        self.region = region
        self.durationSeconds = durationSeconds
        self.enabled = enabled
    }
}

/// Configuration for a stretch session
public struct StretchSessionConfig: Codable, Sendable {
    public var regions: [StretchRegionConfig]
    public var spotifyPlaylistUrl: String?

    public init(regions: [StretchRegionConfig], spotifyPlaylistUrl: String? = nil) {
        self.regions = regions
        self.spotifyPlaylistUrl = spotifyPlaylistUrl
    }

    public static var defaultConfig: StretchSessionConfig {
        StretchSessionConfig(
            regions: BodyRegion.allCases.map { region in
                StretchRegionConfig(region: region, durationSeconds: 60, enabled: true)
            },
            spotifyPlaylistUrl: nil
        )
    }
}

/// A completed stretch within a session
public struct CompletedStretch: Identifiable, Codable, Hashable, Sendable {
    public var id: String { "\(region.rawValue)-\(stretchId)" }
    public let region: BodyRegion
    public let stretchId: String
    public let stretchName: String
    public let durationSeconds: Int
    public var skippedSegments: Int // 0, 1, or 2

    public init(
        region: BodyRegion,
        stretchId: String,
        stretchName: String,
        durationSeconds: Int,
        skippedSegments: Int
    ) {
        self.region = region
        self.stretchId = stretchId
        self.stretchName = stretchName
        self.durationSeconds = durationSeconds
        self.skippedSegments = skippedSegments
    }
}

/// A completed stretch session
public struct StretchSession: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let completedAt: Date
    public var totalDurationSeconds: Int
    public var regionsCompleted: Int
    public var regionsSkipped: Int
    public var stretches: [CompletedStretch]?

    public init(
        id: String,
        completedAt: Date,
        totalDurationSeconds: Int,
        regionsCompleted: Int,
        regionsSkipped: Int,
        stretches: [CompletedStretch]? = nil
    ) {
        self.id = id
        self.completedAt = completedAt
        self.totalDurationSeconds = totalDurationSeconds
        self.regionsCompleted = regionsCompleted
        self.regionsSkipped = regionsSkipped
        self.stretches = stretches
    }

    public var formattedDuration: String {
        let minutes = totalDurationSeconds / 60
        let seconds = totalDurationSeconds % 60
        if seconds == 0 {
            return "\(minutes) min"
        }
        return "\(minutes)m \(seconds)s"
    }
}

// MARK: - Mock Data
public extension StretchSession {
    static let mockRecentSession: StretchSession = StretchSession(
        id: UUID().uuidString,
        completedAt: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
        totalDurationSeconds: 480,
        regionsCompleted: 8,
        regionsSkipped: 0,
        stretches: nil
    )
}
