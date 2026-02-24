import Foundation

/// Type of activity tracked in the app
public enum ActivityType: String, Codable, CaseIterable, Sendable {
    case workout
    case stretch
    case meditation
    case cycling

    public var displayName: String {
        switch self {
        case .workout: return "Lifting"
        case .stretch: return "Stretch"
        case .meditation: return "Meditate"
        case .cycling: return "Cycling"
        }
    }

    public var iconName: String {
        switch self {
        case .workout: return "dumbbell.fill"
        case .stretch: return "figure.flexibility"
        case .meditation: return "brain.head.profile"
        case .cycling: return "figure.outdoor.cycle"
        }
    }
}

/// An activity entry in the calendar
public struct CalendarActivity: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let type: ActivityType
    public let date: Date
    public var completedAt: Date?
    public var summary: ActivitySummary

    public init(
        id: String,
        type: ActivityType,
        date: Date,
        completedAt: Date? = nil,
        summary: ActivitySummary
    ) {
        self.id = id
        self.type = type
        self.date = date
        self.completedAt = completedAt
        self.summary = summary
    }
}

/// Summary information for an activity
public struct ActivitySummary: Codable, Hashable, Sendable {
    // Workout fields
    public var dayName: String?
    public var exerciseCount: Int?
    public var setsCompleted: Int?
    public var totalSets: Int?
    public var weekNumber: Int?
    public var isDeload: Bool

    // Stretch fields
    public var totalDurationSeconds: Int?
    public var regionsCompleted: Int?
    public var regionsSkipped: Int?

    // Meditation fields
    public var durationSeconds: Int?
    public var meditationType: String?

    // Cycling fields
    public var durationMinutes: Int?
    public var tss: Int?
    public var cyclingType: String?

    public init(
        dayName: String? = nil,
        exerciseCount: Int? = nil,
        setsCompleted: Int? = nil,
        totalSets: Int? = nil,
        weekNumber: Int? = nil,
        isDeload: Bool = false,
        totalDurationSeconds: Int? = nil,
        regionsCompleted: Int? = nil,
        regionsSkipped: Int? = nil,
        durationSeconds: Int? = nil,
        meditationType: String? = nil,
        durationMinutes: Int? = nil,
        tss: Int? = nil,
        cyclingType: String? = nil
    ) {
        self.dayName = dayName
        self.exerciseCount = exerciseCount
        self.setsCompleted = setsCompleted
        self.totalSets = totalSets
        self.weekNumber = weekNumber
        self.isDeload = isDeload
        self.totalDurationSeconds = totalDurationSeconds
        self.regionsCompleted = regionsCompleted
        self.regionsSkipped = regionsSkipped
        self.durationSeconds = durationSeconds
        self.meditationType = meditationType
        self.durationMinutes = durationMinutes
        self.tss = tss
        self.cyclingType = cyclingType
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        dayName = try container.decodeIfPresent(String.self, forKey: .dayName)
        exerciseCount = try container.decodeIfPresent(Int.self, forKey: .exerciseCount)
        setsCompleted = try container.decodeIfPresent(Int.self, forKey: .setsCompleted)
        totalSets = try container.decodeIfPresent(Int.self, forKey: .totalSets)
        weekNumber = try container.decodeIfPresent(Int.self, forKey: .weekNumber)
        isDeload = try container.decodeIfPresent(Bool.self, forKey: .isDeload) ?? false
        totalDurationSeconds = try container.decodeIfPresent(Int.self, forKey: .totalDurationSeconds)
        regionsCompleted = try container.decodeIfPresent(Int.self, forKey: .regionsCompleted)
        regionsSkipped = try container.decodeIfPresent(Int.self, forKey: .regionsSkipped)
        durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
        meditationType = try container.decodeIfPresent(String.self, forKey: .meditationType)
        durationMinutes = try container.decodeIfPresent(Int.self, forKey: .durationMinutes)
        tss = try container.decodeIfPresent(Int.self, forKey: .tss)
        cyclingType = try container.decodeIfPresent(String.self, forKey: .cyclingType)
    }
}

/// Data for a single calendar day
public struct CalendarDayData: Codable, Hashable, Sendable {
    public let date: Date
    public var activities: [CalendarActivity]

    public init(date: Date, activities: [CalendarActivity]) {
        self.date = date
        self.activities = activities
    }

    public var hasWorkout: Bool {
        activities.contains { $0.type == .workout }
    }

    public var hasStretch: Bool {
        activities.contains { $0.type == .stretch }
    }

    public var hasMeditation: Bool {
        activities.contains { $0.type == .meditation }
    }

    public var hasCycling: Bool {
        activities.contains { $0.type == .cycling }
    }
}

// MARK: - Mock Data
public extension CalendarActivity {
    static let mockActivities: [CalendarActivity] = [
        CalendarActivity(
            id: "workout-1",
            type: .workout,
            date: Date(),
            completedAt: Date(),
            summary: ActivitySummary(
                dayName: "Push Day",
                exerciseCount: 5,
                setsCompleted: 15,
                totalSets: 15,
                weekNumber: 2,
                isDeload: false
            )
        ),
        CalendarActivity(
            id: "stretch-1",
            type: .stretch,
            date: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
            completedAt: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
            summary: ActivitySummary(
                totalDurationSeconds: 480,
                regionsCompleted: 8,
                regionsSkipped: 0
            )
        ),
        CalendarActivity(
            id: "meditation-1",
            type: .meditation,
            date: Calendar.current.date(byAdding: .day, value: -2, to: Date())!,
            completedAt: Calendar.current.date(byAdding: .day, value: -2, to: Date())!,
            summary: ActivitySummary(
                durationSeconds: 600,
                meditationType: "basic-breathing"
            )
        ),
        CalendarActivity(
            id: "cycling-1",
            type: .cycling,
            date: Calendar.current.date(byAdding: .day, value: -3, to: Date())!,
            completedAt: Calendar.current.date(byAdding: .day, value: -3, to: Date())!,
            summary: ActivitySummary(
                durationMinutes: 45,
                tss: 64,
                cyclingType: "threshold"
            )
        )
    ]
}
