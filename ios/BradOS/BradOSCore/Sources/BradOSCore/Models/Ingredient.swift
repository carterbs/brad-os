import Foundation

/// An ingredient that can be used in recipes
public struct Ingredient: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let storeSection: String
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id, name
        case storeSection = "store_section"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        name: String,
        storeSection: String,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.name = name
        self.storeSection = storeSection
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Mock Data

public extension Ingredient {
    static let mockIngredients: [Ingredient] = [
        Ingredient(
            id: "mock-ingredient-1",
            name: "Chicken Breast",
            storeSection: "Meat & Seafood",
            createdAt: Date(),
            updatedAt: Date()
        ),
        Ingredient(
            id: "mock-ingredient-2",
            name: "Brown Rice",
            storeSection: "Pasta & Grains",
            createdAt: Date(),
            updatedAt: Date()
        ),
        Ingredient(
            id: "mock-ingredient-3",
            name: "Broccoli",
            storeSection: "Produce",
            createdAt: Date(),
            updatedAt: Date()
        ),
    ]
}
