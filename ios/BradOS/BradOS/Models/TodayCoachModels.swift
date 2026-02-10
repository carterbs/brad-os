import Foundation

// MARK: - Today Coach Response Models

/// AI coach daily briefing with section-specific insights
struct TodayCoachRecommendation: Codable, Equatable {
    let dailyBriefing: String
    let sections: CoachSections
    let warnings: [CoachWarning]

    struct CoachSections: Codable, Equatable {
        let recovery: RecoverySection
        let lifting: LiftingSection?
        let cycling: CyclingSection?
        let stretching: StretchingSection
        let meditation: MeditationSection
        let weight: WeightSection?
    }

    struct RecoverySection: Codable, Equatable {
        let insight: String
        let status: String // great, good, caution, warning

        var statusColor: RecoveryStatus {
            RecoveryStatus(rawValue: status) ?? .good
        }
    }

    struct LiftingSection: Codable, Equatable {
        let insight: String
        let priority: String // high, normal, rest

        var liftingPriority: CoachPriority {
            CoachPriority(rawValue: priority) ?? .normal
        }
    }

    struct CyclingSection: Codable, Equatable {
        let insight: String
        let session: CyclingCoachRecommendation.SessionRecommendation?
        let priority: String // high, normal, skip
    }

    struct StretchingSection: Codable, Equatable {
        let insight: String
        let suggestedRegions: [String]
        let priority: String // high, normal, low

        var stretchPriority: CoachPriority {
            CoachPriority(rawValue: priority) ?? .normal
        }
    }

    struct MeditationSection: Codable, Equatable {
        let insight: String
        let suggestedDurationMinutes: Int
        let priority: String // high, normal, low

        var meditationPriority: CoachPriority {
            CoachPriority(rawValue: priority) ?? .normal
        }
    }

    struct WeightSection: Codable, Equatable {
        let insight: String
    }

    struct CoachWarning: Codable, Equatable {
        let type: String
        let message: String
    }
}

// MARK: - Supporting Enums

enum RecoveryStatus: String, Codable {
    case great
    case good
    case caution
    case warning
}

enum CoachPriority: String, Codable {
    case high
    case normal
    case low
    case rest
    case skip
}
