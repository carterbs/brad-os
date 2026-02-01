import Testing
import Foundation
@testable import BradOSCore

@Suite("MealSlot")
struct MealSlotTests {

    @Test("creates from dayIndex and mealType")
    func createsFromComponents() {
        let slot = MealSlot(dayIndex: 0, mealType: .breakfast)
        #expect(slot.dayIndex == 0)
        #expect(slot.mealType == .breakfast)
    }

    @Test("creates from MealPlanEntry")
    func createsFromEntry() {
        let entry = MealPlanEntry(dayIndex: 2, mealType: .dinner, mealId: "m1", mealName: "Steak")
        let slot = MealSlot(entry: entry)
        #expect(slot.dayIndex == 2)
        #expect(slot.mealType == .dinner)
    }

    @Test("equal slots are equal")
    func equalityWorks() {
        let a = MealSlot(dayIndex: 1, mealType: .lunch)
        let b = MealSlot(dayIndex: 1, mealType: .lunch)
        #expect(a == b)
    }

    @Test("different slots are not equal")
    func inequalityWorks() {
        let a = MealSlot(dayIndex: 0, mealType: .breakfast)
        let b = MealSlot(dayIndex: 0, mealType: .lunch)
        let c = MealSlot(dayIndex: 1, mealType: .breakfast)
        #expect(a != b)
        #expect(a != c)
    }
}

@Suite("QueuedCritiqueActions")
struct QueuedCritiqueActionsTests {

    // MARK: - Toggle Swap

    @Test("toggleSwap adds swap action")
    func toggleSwapAdds() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 0, mealType: .breakfast)
        actions.toggleSwap(slot: slot)
        #expect(actions.action(for: slot) == .swap)
        #expect(actions.swapCount == 1)
        #expect(actions.removeCount == 0)
    }

    @Test("toggleSwap twice removes action")
    func toggleSwapTwiceRemoves() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 0, mealType: .breakfast)
        actions.toggleSwap(slot: slot)
        actions.toggleSwap(slot: slot)
        #expect(actions.action(for: slot) == nil)
        #expect(actions.isEmpty)
    }

    @Test("toggleSwap replaces existing remove")
    func toggleSwapReplacesRemove() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 0, mealType: .breakfast)
        actions.toggleRemove(slot: slot)
        #expect(actions.action(for: slot) == .remove)
        actions.toggleSwap(slot: slot)
        #expect(actions.action(for: slot) == .swap)
        #expect(actions.swapCount == 1)
        #expect(actions.removeCount == 0)
    }

    // MARK: - Toggle Remove

    @Test("toggleRemove adds remove action")
    func toggleRemoveAdds() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 1, mealType: .dinner)
        actions.toggleRemove(slot: slot)
        #expect(actions.action(for: slot) == .remove)
        #expect(actions.removeCount == 1)
        #expect(actions.swapCount == 0)
    }

    @Test("toggleRemove twice removes action")
    func toggleRemoveTwiceRemoves() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 1, mealType: .dinner)
        actions.toggleRemove(slot: slot)
        actions.toggleRemove(slot: slot)
        #expect(actions.action(for: slot) == nil)
        #expect(actions.isEmpty)
    }

    @Test("toggleRemove replaces existing swap")
    func toggleRemoveReplacesSwap() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 1, mealType: .dinner)
        actions.toggleSwap(slot: slot)
        #expect(actions.action(for: slot) == .swap)
        actions.toggleRemove(slot: slot)
        #expect(actions.action(for: slot) == .remove)
        #expect(actions.removeCount == 1)
        #expect(actions.swapCount == 0)
    }

    // MARK: - Counts and State

    @Test("isEmpty returns true when no actions")
    func isEmptyWhenNoActions() {
        let actions = QueuedCritiqueActions()
        #expect(actions.isEmpty)
        #expect(actions.count == 0)
    }

    @Test("counts reflect mixed actions")
    func mixedCounts() {
        var actions = QueuedCritiqueActions()
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .breakfast))
        actions.toggleSwap(slot: MealSlot(dayIndex: 1, mealType: .breakfast))
        actions.toggleRemove(slot: MealSlot(dayIndex: 2, mealType: .dinner))
        #expect(actions.swapCount == 2)
        #expect(actions.removeCount == 1)
        #expect(actions.count == 3)
        #expect(!actions.isEmpty)
    }

    @Test("clear removes all actions")
    func clearRemovesAll() {
        var actions = QueuedCritiqueActions()
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .breakfast))
        actions.toggleRemove(slot: MealSlot(dayIndex: 1, mealType: .dinner))
        actions.clear()
        #expect(actions.isEmpty)
        #expect(actions.count == 0)
    }

    // MARK: - Generate Critique Text

    @Test("generates empty string when no actions")
    func generateEmptyText() {
        let actions = QueuedCritiqueActions()
        let text = actions.generateCritiqueText(plan: makePlan())
        #expect(text == "")
    }

    @Test("generates swap-only text")
    func generateSwapOnlyText() {
        var actions = QueuedCritiqueActions()
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .breakfast))
        let text = actions.generateCritiqueText(plan: makePlan())
        #expect(text == "Swap Monday breakfast (Scrambled Eggs) for something different.")
    }

    @Test("generates remove-only text")
    func generateRemoveOnlyText() {
        var actions = QueuedCritiqueActions()
        actions.toggleRemove(slot: MealSlot(dayIndex: 3, mealType: .dinner))
        let text = actions.generateCritiqueText(plan: makePlan())
        #expect(text == "Remove Thursday dinner (Salmon with Rice) from the plan.")
    }

    @Test("generates mixed swap and remove text")
    func generateMixedText() {
        var actions = QueuedCritiqueActions()
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .breakfast))
        actions.toggleSwap(slot: MealSlot(dayIndex: 2, mealType: .breakfast))
        actions.toggleRemove(slot: MealSlot(dayIndex: 3, mealType: .breakfast))
        let text = actions.generateCritiqueText(plan: makePlan())
        #expect(text == "Swap Monday breakfast (Scrambled Eggs) and Wednesday breakfast (Scrambled Eggs) for something different. Remove Thursday breakfast (Scrambled Eggs) from the plan.")
    }

    @Test("sorts by day index then meal type")
    func sortsByDayAndMealType() {
        var actions = QueuedCritiqueActions()
        // Add in reverse order
        actions.toggleSwap(slot: MealSlot(dayIndex: 6, mealType: .dinner))
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .lunch))
        actions.toggleSwap(slot: MealSlot(dayIndex: 0, mealType: .breakfast))
        let text = actions.generateCritiqueText(plan: makePlan())
        // Should be sorted: Monday breakfast, Monday lunch, Sunday dinner
        #expect(text.contains("Monday breakfast"))
        #expect(text.contains("Monday lunch"))
        #expect(text.contains("Sunday dinner"))
        // Verify order: Monday breakfast comes before Monday lunch
        let breakfastRange = text.range(of: "Monday breakfast")!
        let lunchRange = text.range(of: "Monday lunch")!
        #expect(breakfastRange.lowerBound < lunchRange.lowerBound)
    }

    @Test("handles entry with nil mealName")
    func handlesNilMealName() {
        var actions = QueuedCritiqueActions()
        let slot = MealSlot(dayIndex: 4, mealType: .dinner)
        actions.toggleSwap(slot: slot)
        // Create plan with nil mealName for Friday dinner
        var plan = makePlan()
        plan = plan.map { entry in
            if entry.dayIndex == 4 && entry.mealType == .dinner {
                return MealPlanEntry(dayIndex: 4, mealType: .dinner, mealId: nil, mealName: nil)
            }
            return entry
        }
        let text = actions.generateCritiqueText(plan: plan)
        #expect(text == "Swap Friday dinner (Unknown) for something different.")
    }

    // MARK: - Helpers

    /// Create a standard 21-entry mock plan
    private func makePlan() -> [MealPlanEntry] {
        var plan: [MealPlanEntry] = []
        let meals: [(MealType, String, String)] = [
            (.breakfast, "mock-1", "Scrambled Eggs"),
            (.lunch, "mock-2", "Chicken Caesar Salad"),
            (.dinner, "mock-3", "Salmon with Rice"),
        ]
        for dayIndex in 0..<7 {
            for (mealType, mealId, mealName) in meals {
                plan.append(MealPlanEntry(
                    dayIndex: dayIndex,
                    mealType: mealType,
                    mealId: mealId,
                    mealName: mealName
                ))
            }
        }
        return plan
    }
}
