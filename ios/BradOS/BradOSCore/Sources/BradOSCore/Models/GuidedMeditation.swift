import Foundation

// MARK: - Script Models

public struct GuidedMeditationSegment: Codable, Identifiable, Sendable {
    public let id: String
    public let startSeconds: Int
    public let text: String
    public let phase: String  // "opening", "teachings", "closing"

    public init(id: String, startSeconds: Int, text: String, phase: String) {
        self.id = id
        self.startSeconds = startSeconds
        self.text = text
        self.phase = phase
    }
}

public struct GuidedMeditationInterjection: Codable, Sendable {
    public let windowStartSeconds: Int
    public let windowEndSeconds: Int
    public let textOptions: [String]

    public init(windowStartSeconds: Int, windowEndSeconds: Int, textOptions: [String]) {
        self.windowStartSeconds = windowStartSeconds
        self.windowEndSeconds = windowEndSeconds
        self.textOptions = textOptions
    }
}

public struct GuidedMeditationScript: Codable, Identifiable, Sendable {
    public let id: String
    public let category: String
    public let title: String
    public let subtitle: String
    public let orderIndex: Int
    public let durationSeconds: Int
    public let segments: [GuidedMeditationSegment]?  // nil when listing, present when fetching by id
    public let interjections: [GuidedMeditationInterjection]?  // same

    public init(
        id: String,
        category: String,
        title: String,
        subtitle: String,
        orderIndex: Int,
        durationSeconds: Int,
        segments: [GuidedMeditationSegment]? = nil,
        interjections: [GuidedMeditationInterjection]? = nil
    ) {
        self.id = id
        self.category = category
        self.title = title
        self.subtitle = subtitle
        self.orderIndex = orderIndex
        self.durationSeconds = durationSeconds
        self.segments = segments
        self.interjections = interjections
    }

    /// Display-friendly duration string
    public var formattedDuration: String {
        let minutes = durationSeconds / 60
        return "\(minutes) min"
    }
}

// MARK: - API Response Models

public struct GuidedMeditationCategoryResponse: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let scriptCount: Int

    public init(id: String, name: String, scriptCount: Int) {
        self.id = id
        self.name = name
        self.scriptCount = scriptCount
    }
}
