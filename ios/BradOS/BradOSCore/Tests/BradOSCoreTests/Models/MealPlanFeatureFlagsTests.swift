import Foundation
import Testing
@testable import BradOSCore

@Suite("Meal plan feature flags")
struct MealPlanFeatureFlagsTests {
    @Test("Adult breakfast defaults off and preserves all other slots")
    func defaultsOff() {
        let flags = MealPlanFeatureFlags()
        #expect(!flags.adultBreakfastEnabled)
        #expect(flags.visibleEntries(in: MealPlanSession.mockSession.plan).count == 21)
        #expect(MealPlanSession.mockSession.plan.count == 28)
        #expect(flags.includes(track: .family, type: .breakfast))
        #expect(flags.includes(track: .family, type: .lunch))
        #expect(flags.includes(track: .family, type: .dinner))
    }

    @Test("Enabled flag restores both breakfast tracks")
    func enabled() {
        let flags = MealPlanFeatureFlags(adultBreakfastEnabled: true)
        #expect(flags.visibleEntries(in: MealPlanSession.mockSession.plan).count == 28)
        #expect(flags.includes(track: .adult, type: .breakfast))
    }

    @Test("Family breakfast is labeled for kids")
    func breakfastLabel() {
        let entry = MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: nil, mealName: nil)
        #expect(entry.displayLabel == "Kids Breakfast")
    }
}
