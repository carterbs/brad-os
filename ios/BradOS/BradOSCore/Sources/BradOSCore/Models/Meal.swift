import Foundation

/// Type of meal in a day
public enum MealType: String, Codable, Sendable, CaseIterable {
    case breakfast
    case lunch
    case dinner
}

/// Audience a meal is intended for
public enum MealAudience: String, Codable, Sendable, CaseIterable {
    case family
    case adult
}

/// A meal that can be included in a meal plan
public struct Meal: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let mealType: MealType
    public let audience: MealAudience
    public let effort: Int
    public let hasRedMeat: Bool
    public let prepAhead: Bool
    public let url: String?
    public let lastPlanned: Date?
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id, name, effort, url
        case mealType = "meal_type"
        case audience
        case hasRedMeat = "has_red_meat"
        case prepAhead = "prep_ahead"
        case lastPlanned = "last_planned"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        name: String,
        mealType: MealType,
        audience: MealAudience = .family,
        effort: Int,
        hasRedMeat: Bool,
        prepAhead: Bool = false,
        url: String? = nil,
        lastPlanned: Date? = nil,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.name = name
        self.mealType = mealType
        self.audience = audience
        self.effort = effort
        self.hasRedMeat = hasRedMeat
        self.prepAhead = prepAhead
        self.url = url
        self.lastPlanned = lastPlanned
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        mealType = try container.decode(MealType.self, forKey: .mealType)
        audience = try container.decodeIfPresent(MealAudience.self, forKey: .audience) ?? .family
        effort = try container.decode(Int.self, forKey: .effort)
        hasRedMeat = try container.decode(Bool.self, forKey: .hasRedMeat)
        prepAhead = try container.decodeIfPresent(Bool.self, forKey: .prepAhead) ?? false
        url = try container.decodeIfPresent(String.self, forKey: .url)
        lastPlanned = try container.decodeIfPresent(Date.self, forKey: .lastPlanned)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
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
        Meal(
            id: "mock-meal-5",
            name: "Protein Oats",
            mealType: .breakfast,
            audience: .adult,
            effort: 1,
            hasRedMeat: false,
            prepAhead: true,
            url: nil,
            lastPlanned: nil,
            createdAt: Date(),
            updatedAt: Date()
        ),
    ]
}
