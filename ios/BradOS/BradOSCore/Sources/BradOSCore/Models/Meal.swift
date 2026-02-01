import Foundation

/// Type of meal in a day
public enum MealType: String, Codable, Sendable {
    case breakfast
    case lunch
    case dinner
}

/// A meal that can be included in a meal plan
public struct Meal: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let mealType: MealType
    public let effort: Int
    public let hasRedMeat: Bool
    public let url: String?
    public let lastPlanned: Date?
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id, name, effort, url
        case mealType = "meal_type"
        case hasRedMeat = "has_red_meat"
        case lastPlanned = "last_planned"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        name: String,
        mealType: MealType,
        effort: Int,
        hasRedMeat: Bool,
        url: String? = nil,
        lastPlanned: Date? = nil,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.name = name
        self.mealType = mealType
        self.effort = effort
        self.hasRedMeat = hasRedMeat
        self.url = url
        self.lastPlanned = lastPlanned
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Mock Data

public extension Meal {
    static let mockMeals: [Meal] = [
        Meal(
            id: "mock-meal-1",
            name: "Scrambled Eggs",
            mealType: .breakfast,
            effort: 2,
            hasRedMeat: false,
            url: nil,
            lastPlanned: nil,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Meal(
            id: "mock-meal-2",
            name: "Chicken Caesar Salad",
            mealType: .lunch,
            effort: 3,
            hasRedMeat: false,
            url: "https://example.com/chicken-caesar",
            lastPlanned: Date(),
            createdAt: Date(),
            updatedAt: Date()
        ),
        Meal(
            id: "mock-meal-3",
            name: "Salmon with Rice",
            mealType: .dinner,
            effort: 4,
            hasRedMeat: false,
            url: "https://example.com/salmon-rice",
            lastPlanned: Date(),
            createdAt: Date(),
            updatedAt: Date()
        ),
        Meal(
            id: "mock-meal-4",
            name: "Steak and Potatoes",
            mealType: .dinner,
            effort: 5,
            hasRedMeat: true,
            url: nil,
            lastPlanned: nil,
            createdAt: Date(),
            updatedAt: Date()
        ),
    ]
}
