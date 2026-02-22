import Testing
import Foundation
@testable import BradOSCore

@Suite("Meal")
struct MealTests {

    @Test("decodes from server JSON with snake_case keys")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": "meal_1",
            "name": "Scrambled Eggs",
            "meal_type": "breakfast",
            "effort": 2,
            "has_red_meat": false,
            "url": "https://example.com/recipe",
            "last_planned": "2026-01-20T12:00:00Z",
            "created_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-01-15T10:00:00Z"
        }
        """.data(using: .utf8)!

        let meal = try makeDecoder().decode(Meal.self, from: json)

        #expect(meal.id == "meal_1")
        #expect(meal.name == "Scrambled Eggs")
        #expect(meal.mealType == .breakfast)
        #expect(meal.effort == 2)
        #expect(meal.hasRedMeat == false)
        #expect(meal.url == "https://example.com/recipe")
        #expect(meal.lastPlanned != nil)
    }

    @Test("decodes meal with prep_ahead field")
    func decodesWithPrepAhead() throws {
        let json = """
        {
            "id": "meal_pa",
            "name": "Overnight Oats",
            "meal_type": "breakfast",
            "effort": 1,
            "has_red_meat": false,
            "prep_ahead": true,
            "url": null,
            "last_planned": null,
            "created_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-01-15T10:00:00Z"
        }
        """.data(using: .utf8)!

        let meal = try makeDecoder().decode(Meal.self, from: json)

        #expect(meal.prepAhead == true)
    }

    @Test("defaults prep_ahead to false when missing from JSON")
    func defaultsPrepAheadToFalse() throws {
        let json = """
        {
            "id": "meal_old",
            "name": "Legacy Meal",
            "meal_type": "lunch",
            "effort": 2,
            "has_red_meat": false,
            "url": null,
            "last_planned": null,
            "created_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-01-15T10:00:00Z"
        }
        """.data(using: .utf8)!

        let meal = try makeDecoder().decode(Meal.self, from: json)

        #expect(meal.prepAhead == false)
    }

    @Test("decodes meal with nil last_planned")
    func decodesWithNilLastPlanned() throws {
        let json = """
        {
            "id": "meal_2",
            "name": "Grilled Chicken",
            "meal_type": "lunch",
            "effort": 3,
            "has_red_meat": false,
            "url": null,
            "last_planned": null,
            "created_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-01-15T10:00:00Z"
        }
        """.data(using: .utf8)!

        let meal = try makeDecoder().decode(Meal.self, from: json)

        #expect(meal.id == "meal_2")
        #expect(meal.lastPlanned == nil)
        #expect(meal.url == nil)
    }

    @Test("decodes all meal types")
    func decodesAllMealTypes() throws {
        for mealType in ["breakfast", "lunch", "dinner"] {
            let json = """
            {
                "id": "meal_\(mealType)",
                "name": "Test \(mealType)",
                "meal_type": "\(mealType)",
                "effort": 1,
                "has_red_meat": false,
                "last_planned": null,
                "created_at": "2026-01-15T10:00:00Z",
                "updated_at": "2026-01-15T10:00:00Z"
            }
            """.data(using: .utf8)!

            let meal = try makeDecoder().decode(Meal.self, from: json)
            #expect(meal.mealType.rawValue == mealType)
        }
    }

    @Test("encodes and decodes roundtrip")
    func encodesDecodesRoundtrip() throws {
        let original = Meal(
            id: "meal-rt",
            name: "Roundtrip Meal",
            mealType: .dinner,
            effort: 4,
            hasRedMeat: true,
            url: "https://example.com",
            lastPlanned: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(Meal.self, from: data)

        #expect(decoded.id == original.id)
        #expect(decoded.name == original.name)
        #expect(decoded.mealType == original.mealType)
        #expect(decoded.effort == original.effort)
        #expect(decoded.hasRedMeat == original.hasRedMeat)
    }

    @Test("mockMeals contains expected data")
    func mockMealsHasData() {
        let meals = Meal.mockMeals
        #expect(!meals.isEmpty)
        #expect(meals.contains { $0.name == "Scrambled Eggs" })
        #expect(meals.contains { $0.mealType == .breakfast })
        #expect(meals.contains { $0.mealType == .dinner })
    }
}

@Suite("MealPlanEntry")
struct MealPlanEntryTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "day_index": 0,
            "meal_type": "breakfast",
            "meal_id": "meal_1",
            "meal_name": "Oatmeal"
        }
        """.data(using: .utf8)!

        let entry = try makeDecoder().decode(MealPlanEntry.self, from: json)

        #expect(entry.dayIndex == 0)
        #expect(entry.mealType == .breakfast)
        #expect(entry.mealId == "meal_1")
        #expect(entry.mealName == "Oatmeal")
    }

    @Test("decodes entry with nil meal_id and meal_name (empty slot)")
    func decodesEmptySlot() throws {
        let json = """
        {
            "day_index": 3,
            "meal_type": "dinner",
            "meal_id": null,
            "meal_name": null
        }
        """.data(using: .utf8)!

        let entry = try makeDecoder().decode(MealPlanEntry.self, from: json)

        #expect(entry.dayIndex == 3)
        #expect(entry.mealType == .dinner)
        #expect(entry.mealId == nil)
        #expect(entry.mealName == nil)
    }

    @Test("computed id combines dayIndex and mealType")
    func computedId() throws {
        let entry = MealPlanEntry(dayIndex: 2, mealType: .lunch, mealId: "meal_5", mealName: "Salad")
        #expect(entry.id == "2-lunch")
    }
}

@Suite("CritiqueOperation")
struct CritiqueOperationTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "day_index": 0,
            "meal_type": "dinner",
            "new_meal_id": "meal_45"
        }
        """.data(using: .utf8)!

        let op = try makeDecoder().decode(CritiqueOperation.self, from: json)

        #expect(op.dayIndex == 0)
        #expect(op.mealType == .dinner)
        #expect(op.newMealId == "meal_45")
    }

    @Test("decodes with nil new_meal_id")
    func decodesWithNilMealId() throws {
        let json = """
        {
            "day_index": 1,
            "meal_type": "breakfast",
            "new_meal_id": null
        }
        """.data(using: .utf8)!

        let op = try makeDecoder().decode(CritiqueOperation.self, from: json)
        #expect(op.newMealId == nil)
    }
}

@Suite("ConversationMessage")
struct ConversationMessageTests {

    @Test("decodes user message without operations")
    func decodesUserMessage() throws {
        let json = """
        {
            "role": "user",
            "content": "Swap Monday dinner"
        }
        """.data(using: .utf8)!

        let message = try makeDecoder().decode(ConversationMessage.self, from: json)

        #expect(message.role == .user)
        #expect(message.content == "Swap Monday dinner")
        #expect(message.operations == nil)
    }

    @Test("decodes assistant message with operations")
    func decodesAssistantMessage() throws {
        let json = """
        {
            "role": "assistant",
            "content": "Done, swapped Monday dinner.",
            "operations": [
                {
                    "day_index": 0,
                    "meal_type": "dinner",
                    "new_meal_id": "meal_45"
                }
            ]
        }
        """.data(using: .utf8)!

        let message = try makeDecoder().decode(ConversationMessage.self, from: json)

        #expect(message.role == .assistant)
        #expect(message.content == "Done, swapped Monday dinner.")
        #expect(message.operations?.count == 1)
        #expect(message.operations?.first?.dayIndex == 0)
        #expect(message.operations?.first?.mealType == .dinner)
        #expect(message.operations?.first?.newMealId == "meal_45")
    }

    @Test("computed id differs by role and content")
    func computedIdDiffers() {
        let user = ConversationMessage(role: .user, content: "Hello")
        let assistant = ConversationMessage(role: .assistant, content: "Hello")
        let userDifferent = ConversationMessage(role: .user, content: "Goodbye")

        #expect(user.id != assistant.id)
        #expect(user.id != userDifferent.id)
    }
}

@Suite("GenerateMealPlanResponse")
struct GenerateMealPlanResponseTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "session_id": "session_abc123",
            "plan": [
                {"day_index": 0, "meal_type": "breakfast", "meal_id": "meal_1", "meal_name": "Oatmeal"},
                {"day_index": 0, "meal_type": "lunch", "meal_id": "meal_2", "meal_name": "Chicken Wrap"},
                {"day_index": 0, "meal_type": "dinner", "meal_id": "meal_3", "meal_name": "Salmon"}
            ]
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(GenerateMealPlanResponse.self, from: json)

        #expect(response.sessionId == "session_abc123")
        #expect(response.plan.count == 3)
        #expect(response.plan[0].dayIndex == 0)
        #expect(response.plan[0].mealType == .breakfast)
        #expect(response.plan[0].mealId == "meal_1")
    }
}

@Suite("MealPlanSession")
struct MealPlanSessionTests {

    @Test("decodes full session from server JSON")
    func decodesFullSession() throws {
        let json = """
        {
            "id": "session_abc",
            "plan": [
                {"day_index": 0, "meal_type": "breakfast", "meal_id": "meal_1", "meal_name": "Oatmeal"},
                {"day_index": 0, "meal_type": "lunch", "meal_id": "meal_2", "meal_name": "Wrap"},
                {"day_index": 0, "meal_type": "dinner", "meal_id": "meal_3", "meal_name": "Salmon"}
            ],
            "meals_snapshot": [
                {
                    "id": "meal_1",
                    "name": "Oatmeal",
                    "meal_type": "breakfast",
                    "effort": 1,
                    "has_red_meat": false,
                    "last_planned": null,
                    "created_at": "2026-01-15T10:00:00Z",
                    "updated_at": "2026-01-15T10:00:00Z"
                }
            ],
            "history": [
                {"role": "user", "content": "Swap Monday dinner"},
                {"role": "assistant", "content": "Done", "operations": [{"day_index": 0, "meal_type": "dinner", "new_meal_id": "meal_45"}]}
            ],
            "is_finalized": false,
            "created_at": "2026-01-31T12:00:00Z",
            "updated_at": "2026-01-31T12:05:00Z"
        }
        """.data(using: .utf8)!

        let session = try makeDecoder().decode(MealPlanSession.self, from: json)

        #expect(session.id == "session_abc")
        #expect(session.plan.count == 3)
        #expect(session.mealsSnapshot.count == 1)
        #expect(session.mealsSnapshot[0].name == "Oatmeal")
        #expect(session.history.count == 2)
        #expect(session.history[0].role == .user)
        #expect(session.history[1].role == .assistant)
        #expect(session.history[1].operations?.count == 1)
        #expect(session.isFinalized == false)
    }

    @Test("mockSession contains expected data")
    func mockSessionHasData() {
        let session = MealPlanSession.mockSession
        #expect(session.plan.count == 21) // 7 days x 3 meals
        #expect(!session.mealsSnapshot.isEmpty)
        #expect(!session.history.isEmpty)
        #expect(session.isFinalized == false)
    }
}

@Suite("CritiqueMealPlanResponse")
struct CritiqueMealPlanResponseTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "plan": [
                {"day_index": 0, "meal_type": "breakfast", "meal_id": "meal_1", "meal_name": "Oatmeal"},
                {"day_index": 0, "meal_type": "lunch", "meal_id": "meal_2", "meal_name": "Wrap"},
                {"day_index": 0, "meal_type": "dinner", "meal_id": "meal_99", "meal_name": "Steak"}
            ],
            "explanation": "Swapped Monday dinner from Salmon to Steak as requested.",
            "operations": [
                {"day_index": 0, "meal_type": "dinner", "new_meal_id": "meal_99"}
            ],
            "errors": []
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(CritiqueMealPlanResponse.self, from: json)

        #expect(response.plan.count == 3)
        #expect(response.explanation == "Swapped Monday dinner from Salmon to Steak as requested.")
        #expect(response.operations.count == 1)
        #expect(response.operations[0].newMealId == "meal_99")
        #expect(response.errors.isEmpty)
    }

    @Test("decodes response with errors")
    func decodesWithErrors() throws {
        let json = """
        {
            "plan": [],
            "explanation": "Could not fulfill all requests.",
            "operations": [],
            "errors": ["No vegetarian dinner options available", "Cannot remove all meals from Monday"]
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(CritiqueMealPlanResponse.self, from: json)

        #expect(response.errors.count == 2)
        #expect(response.errors[0] == "No vegetarian dinner options available")
    }
}

@Suite("FinalizeMealPlanResponse")
struct FinalizeMealPlanResponseTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "finalized": true
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(FinalizeMealPlanResponse.self, from: json)
        #expect(response.finalized == true)
    }
}

@Suite("MealPlan Full Response Decoding")
struct MealPlanFullResponseTests {

    @Test("decodes generate response with 21 plan entries")
    func decodesFullGenerateResponse() throws {
        var planEntries: [String] = []
        let mealTypes = ["breakfast", "lunch", "dinner"]
        let mealNames = ["Oatmeal", "Turkey Sandwich", "Grilled Chicken"]
        for day in 0..<7 {
            for (index, mealType) in mealTypes.enumerated() {
                planEntries.append("""
                    {"day_index": \(day), "meal_type": "\(mealType)", "meal_id": "meal_\(day * 3 + index + 1)", "meal_name": "\(mealNames[index])"}
                """)
            }
        }
        let planJSON = planEntries.joined(separator: ",\n")

        let json = """
        {
            "session_id": "session_full",
            "plan": [
                \(planJSON)
            ]
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(GenerateMealPlanResponse.self, from: json)

        #expect(response.sessionId == "session_full")
        #expect(response.plan.count == 21)

        // Verify first day entries
        let mondayBreakfast = response.plan.first { $0.dayIndex == 0 && $0.mealType == .breakfast }
        #expect(mondayBreakfast?.mealName == "Oatmeal")

        // Verify last day entries
        let sundayDinner = response.plan.first { $0.dayIndex == 6 && $0.mealType == .dinner }
        #expect(sundayDinner?.mealName == "Grilled Chicken")
    }

    @Test("decodes full session with meals_snapshot and history")
    func decodesFullSessionResponse() throws {
        var planEntries: [String] = []
        let mealTypes = ["breakfast", "lunch", "dinner"]
        for day in 0..<7 {
            for (index, mealType) in mealTypes.enumerated() {
                planEntries.append("""
                    {"day_index": \(day), "meal_type": "\(mealType)", "meal_id": "meal_\(day * 3 + index + 1)", "meal_name": "Meal \(day * 3 + index + 1)"}
                """)
            }
        }
        let planJSON = planEntries.joined(separator: ",\n")

        let json = """
        {
            "id": "session_full_test",
            "plan": [
                \(planJSON)
            ],
            "meals_snapshot": [
                {
                    "id": "meal_1",
                    "name": "Oatmeal",
                    "meal_type": "breakfast",
                    "effort": 1,
                    "has_red_meat": false,
                    "last_planned": "2026-01-20T12:00:00Z",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z"
                },
                {
                    "id": "meal_2",
                    "name": "Turkey Sandwich",
                    "meal_type": "lunch",
                    "effort": 2,
                    "has_red_meat": false,
                    "last_planned": null,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z"
                },
                {
                    "id": "meal_3",
                    "name": "Grilled Chicken",
                    "meal_type": "dinner",
                    "effort": 3,
                    "has_red_meat": false,
                    "last_planned": "2026-01-25T12:00:00Z",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z"
                }
            ],
            "history": [
                {"role": "user", "content": "Swap Monday dinner for steak"},
                {"role": "assistant", "content": "Done, I swapped Monday dinner to Steak and Potatoes.", "operations": [{"day_index": 0, "meal_type": "dinner", "new_meal_id": "meal_99"}]},
                {"role": "user", "content": "Looks good, thanks!"}
            ],
            "is_finalized": false,
            "created_at": "2026-01-31T12:00:00Z",
            "updated_at": "2026-01-31T12:05:00Z"
        }
        """.data(using: .utf8)!

        let session = try makeDecoder().decode(MealPlanSession.self, from: json)

        #expect(session.id == "session_full_test")
        #expect(session.plan.count == 21)
        #expect(session.mealsSnapshot.count == 3)
        #expect(session.mealsSnapshot[0].lastPlanned != nil)
        #expect(session.mealsSnapshot[1].lastPlanned == nil)
        #expect(session.history.count == 3)
        #expect(session.history[0].operations == nil)
        #expect(session.history[1].operations?.count == 1)
        #expect(session.history[2].operations == nil)
        #expect(session.isFinalized == false)
    }
}
