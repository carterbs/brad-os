import Foundation

/// Caches ingredient and recipe data from the API for shopping list generation.
/// Call `loadIfNeeded()` once before using ingredient/recipe lookups.
@MainActor
public class RecipeCacheService: ObservableObject {
    public static let shared = RecipeCacheService()

    @Published public private(set) var isLoaded = false
    @Published public private(set) var error: String?

    /// All ingredients keyed by ID
    private var ingredientsById: [String: Ingredient] = [:]

    /// All recipes keyed by mealId
    private var recipesByMealId: [String: Recipe] = [:]

    private let apiClient: APIClientProtocol

    public init(apiClient: APIClientProtocol = MockAPIClient()) {
        self.apiClient = apiClient
    }

    /// Load all ingredients and recipes. Call once on app launch or first use.
    public func loadIfNeeded() async {
        guard !isLoaded else { return }
        do {
            async let ingredientsTask = apiClient.getIngredients()
            async let recipesTask = apiClient.getRecipes()

            let (ingredients, recipes) = try await (ingredientsTask, recipesTask)

            ingredientsById = Dictionary(uniqueKeysWithValues: ingredients.map { ($0.id, $0) })
            recipesByMealId = Dictionary(uniqueKeysWithValues: recipes.map { ($0.mealId, $0) })
            isLoaded = true
            error = nil
        } catch {
            self.error = "Failed to load recipe data"
        }
    }

    /// Get ingredient by ID
    public func ingredient(byId id: String) -> Ingredient? {
        ingredientsById[id]
    }

    /// Get recipe for a meal
    public func recipe(forMealId mealId: String) -> Recipe? {
        recipesByMealId[mealId]
    }

    /// Get all ingredient tuples for a set of meal IDs (for shopping list)
    public func ingredientTuples(forMealIds mealIds: [String]) -> [(ingredient: Ingredient, quantity: Double?, unit: String?)] {
        var results: [(ingredient: Ingredient, quantity: Double?, unit: String?)] = []
        for mealId in mealIds {
            guard let recipe = recipesByMealId[mealId] else { continue }
            for ri in recipe.ingredients {
                guard let ingredient = ingredientsById[ri.ingredientId] else { continue }
                results.append((ingredient: ingredient, quantity: ri.quantity, unit: ri.unit))
            }
        }
        return results
    }
}
