import Foundation

/// A single ingredient reference within a recipe, with optional quantity and unit
public struct RecipeIngredient: Codable, Hashable, Sendable {
    public let ingredientId: String
    public let quantity: Double?
    public let unit: String?

    public enum CodingKeys: String, CodingKey {
        case ingredientId = "ingredient_id"
        case quantity, unit
    }

    public init(ingredientId: String, quantity: Double?, unit: String?) {
        self.ingredientId = ingredientId
        self.quantity = quantity
        self.unit = unit
    }
}

/// A recipe linking a meal to its required ingredients
public struct Recipe: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let mealId: String
    public let ingredients: [RecipeIngredient]
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id
        case mealId = "meal_id"
        case ingredients
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        mealId: String,
        ingredients: [RecipeIngredient],
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.mealId = mealId
        self.ingredients = ingredients
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Mock Data

public extension Recipe {
    static let mockRecipes: [Recipe] = [
        Recipe(
            id: "mock-recipe-1",
            mealId: "mock-meal-1",
            ingredients: [
                RecipeIngredient(ingredientId: "mock-ingredient-1", quantity: 8, unit: "oz"),
                RecipeIngredient(ingredientId: "mock-ingredient-2", quantity: 1, unit: "cups"),
                RecipeIngredient(ingredientId: "mock-ingredient-3", quantity: 2, unit: "cups"),
            ],
            createdAt: Date(),
            updatedAt: Date()
        ),
    ]
}
