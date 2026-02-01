import Foundation

/// A single entry in a meal plan (one meal slot for one day)
public struct MealPlanEntry: Identifiable, Codable, Hashable, Sendable {
    public var id: String { "\(dayIndex)-\(mealType.rawValue)" }
    public let dayIndex: Int
    public let mealType: MealType
    public let mealId: String?
    public let mealName: String?

    public enum CodingKeys: String, CodingKey {
        case dayIndex = "day_index"
        case mealType = "meal_type"
        case mealId = "meal_id"
        case mealName = "meal_name"
    }

    public init(
        dayIndex: Int,
        mealType: MealType,
        mealId: String?,
        mealName: String?
    ) {
        self.dayIndex = dayIndex
        self.mealType = mealType
        self.mealId = mealId
        self.mealName = mealName
    }
}

/// An operation to swap a meal in the plan during critique
public struct CritiqueOperation: Codable, Hashable, Sendable {
    public let dayIndex: Int
    public let mealType: MealType
    public let newMealId: String?

    public enum CodingKeys: String, CodingKey {
        case dayIndex = "day_index"
        case mealType = "meal_type"
        case newMealId = "new_meal_id"
    }

    public init(
        dayIndex: Int,
        mealType: MealType,
        newMealId: String?
    ) {
        self.dayIndex = dayIndex
        self.mealType = mealType
        self.newMealId = newMealId
    }
}

/// Role of a message in the conversation history
public enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
}

/// A message in the critique conversation history
public struct ConversationMessage: Identifiable, Codable, Hashable, Sendable {
    public var id: String { "\(role.rawValue)-\(content.hashValue)" }
    public let role: MessageRole
    public let content: String
    public let operations: [CritiqueOperation]?

    public enum CodingKeys: String, CodingKey {
        case role, content, operations
    }

    public init(
        role: MessageRole,
        content: String,
        operations: [CritiqueOperation]? = nil
    ) {
        self.role = role
        self.content = content
        self.operations = operations
    }
}

/// A full meal plan session with plan, meals snapshot, and conversation history
public struct MealPlanSession: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let plan: [MealPlanEntry]
    public let mealsSnapshot: [Meal]
    public let history: [ConversationMessage]
    public let isFinalized: Bool
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id, plan, history
        case mealsSnapshot = "meals_snapshot"
        case isFinalized = "is_finalized"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        plan: [MealPlanEntry],
        mealsSnapshot: [Meal],
        history: [ConversationMessage],
        isFinalized: Bool,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.plan = plan
        self.mealsSnapshot = mealsSnapshot
        self.history = history
        self.isFinalized = isFinalized
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// Response from POST /mealplans/generate
public struct GenerateMealPlanResponse: Codable, Sendable {
    public let sessionId: String
    public let plan: [MealPlanEntry]

    public enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case plan
    }

    public init(sessionId: String, plan: [MealPlanEntry]) {
        self.sessionId = sessionId
        self.plan = plan
    }
}

/// Response from POST /mealplans/:id/critique
public struct CritiqueMealPlanResponse: Codable, Sendable {
    public let plan: [MealPlanEntry]
    public let explanation: String
    public let operations: [CritiqueOperation]
    public let errors: [String]

    public init(
        plan: [MealPlanEntry],
        explanation: String,
        operations: [CritiqueOperation],
        errors: [String]
    ) {
        self.plan = plan
        self.explanation = explanation
        self.operations = operations
        self.errors = errors
    }
}

/// Response from POST /mealplans/:id/finalize
public struct FinalizeMealPlanResponse: Codable, Sendable {
    public let finalized: Bool

    public init(finalized: Bool) {
        self.finalized = finalized
    }
}

// MARK: - Mock Data

public extension MealPlanSession {
    static let mockSession: MealPlanSession = {
        let meals = Meal.mockMeals
        let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        var plan: [MealPlanEntry] = []

        for dayIndex in 0..<7 {
            plan.append(MealPlanEntry(dayIndex: dayIndex, mealType: .breakfast, mealId: "mock-meal-1", mealName: "Scrambled Eggs"))
            plan.append(MealPlanEntry(dayIndex: dayIndex, mealType: .lunch, mealId: "mock-meal-2", mealName: "Chicken Caesar Salad"))
            plan.append(MealPlanEntry(dayIndex: dayIndex, mealType: .dinner, mealId: "mock-meal-3", mealName: "Salmon with Rice"))
        }

        return MealPlanSession(
            id: "mock-session-1",
            plan: plan,
            mealsSnapshot: meals,
            history: [
                ConversationMessage(role: .user, content: "Swap Monday dinner for something with red meat"),
                ConversationMessage(
                    role: .assistant,
                    content: "I've swapped Monday dinner to Steak and Potatoes.",
                    operations: [
                        CritiqueOperation(dayIndex: 0, mealType: .dinner, newMealId: "mock-meal-4")
                    ]
                ),
            ],
            isFinalized: false,
            createdAt: Date(),
            updatedAt: Date()
        )
    }()
}
