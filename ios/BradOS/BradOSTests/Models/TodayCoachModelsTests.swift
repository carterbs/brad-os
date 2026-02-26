import Foundation
import Testing
@testable import Brad_OS

@Suite("TodayCoachModels")
struct TodayCoachModelsTests {
    private func decode(_ json: String) throws -> TodayCoachRecommendation {
        let data = try #require(json.data(using: .utf8))
        return try JSONDecoder().decode(TodayCoachRecommendation.self, from: data)
    }

    @Test("decodes full recommendation payload with all sections")
    func decodesFullPayload() throws {
        let json = """
        {
          "dailyBriefing": "High readiness day.",
          "sections": {
            "recovery": {"insight": "Ready", "status": "great"},
            "lifting": {
              "insight": "Push day",
              "priority": "high",
              "workout": {
                "planDayName": "Push",
                "weekNumber": 3,
                "isDeload": false,
                "exerciseCount": 6,
                "status": "pending"
              }
            },
            "cycling": {
              "insight": "Threshold ride",
              "session": {
                "type": "interval",
                "durationMin": 45,
                "tss": 72,
                "pelotonTip": "Do a PZ class"
              }
            },
            "stretching": {
              "insight": "Stretch hips",
              "suggestedRegions": ["hips", "lower-back"],
              "priority": "normal"
            },
            "meditation": {
              "insight": "Short breath session",
              "suggestedDurationMinutes": 10,
              "priority": "low"
            },
            "weight": {
              "insight": "Weight trend is stable"
            }
          },
          "warnings": [
            {"type": "fallback", "message": "Model fallback used"}
          ]
        }
        """

        let result = try decode(json)

        #expect(result.dailyBriefing == "High readiness day.")
        #expect(result.sections.recovery.statusColor == .great)
        #expect(result.sections.lifting?.liftingPriority == .high)
        #expect(result.sections.stretching.stretchPriority == .normal)
        #expect(result.sections.meditation.meditationPriority == .low)
        #expect(result.sections.weight?.insight == "Weight trend is stable")
        #expect(result.warnings.count == 1)
    }

    @Test("decodes partial payload when optional sections are null")
    func decodesPartialPayload() throws {
        let json = """
        {
          "dailyBriefing": "No lifting today.",
          "sections": {
            "recovery": {"insight": "Moderate", "status": "good"},
            "lifting": null,
            "cycling": null,
            "stretching": {
              "insight": "Mobility focus",
              "suggestedRegions": ["ankles"],
              "priority": "normal"
            },
            "meditation": {
              "insight": "Wind down",
              "suggestedDurationMinutes": 8,
              "priority": "normal"
            },
            "weight": null
          },
          "warnings": []
        }
        """

        let result = try decode(json)

        #expect(result.sections.lifting == nil)
        #expect(result.sections.cycling == nil)
        #expect(result.sections.weight == nil)
        #expect(result.sections.recovery.statusColor == .good)
    }

    @Test("unknown recovery status defaults to good")
    func unknownRecoveryStatusFallsBack() {
        let section = TodayCoachRecommendation.RecoverySection(insight: "Custom", status: "mystery")
        #expect(section.statusColor == .good)
    }

    @Test("unknown lifting priority defaults to normal")
    func unknownLiftingPriorityFallsBack() {
        let section = TodayCoachRecommendation.LiftingSection(
            insight: "Custom",
            workout: nil,
            priority: "wildcard"
        )
        #expect(section.liftingPriority == .normal)
    }

    @Test("unknown stretching and meditation priorities default to normal")
    func unknownOtherPrioritiesFallBack() {
        let stretching = TodayCoachRecommendation.StretchingSection(
            insight: "Custom",
            suggestedRegions: ["neck"],
            priority: "surprise"
        )
        let meditation = TodayCoachRecommendation.MeditationSection(
            insight: "Custom",
            suggestedDurationMinutes: 12,
            priority: "unexpected"
        )

        #expect(stretching.stretchPriority == .normal)
        #expect(meditation.meditationPriority == .normal)
    }

    @Test("coach warning preserves type and message for UI surfacing")
    func coachWarningFieldsStable() {
        let warning = TodayCoachRecommendation.CoachWarning(type: "data_gap", message: "No HRV samples")
        #expect(warning.type == "data_gap")
        #expect(warning.message == "No HRV samples")
    }
}
