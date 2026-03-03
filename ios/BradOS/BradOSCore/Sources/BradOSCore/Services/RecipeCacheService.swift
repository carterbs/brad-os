import Foundation
import os

private let log = Logger(subsystem: "com.bradcarter.brad-os", category: "shopping.cache")

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
        guard !isLoaded else {
            log.info("[cache] already loaded — \(self.ingredientsById.count) ingredients, \(self.recipesByMealId.count) recipes")
            return
        }
        log.info("[cache] loading ingredients + recipes from API…")

        var loadedIngredients: [Ingredient] = []
        var loadedRecipes: [Recipe] = []

        do {
            loadedIngredients = try await apiClient.getIngredients()
            log.info("[cache] fetched \(loadedIngredients.count) ingredients")
        } catch {
            self.error = "Failed to load ingredient data"
            log.error("[cache] FAILED to load ingredients: \(String(describing: error), privacy: .public)")
            return
        }

        do {
            loadedRecipes = try await apiClient.getRecipes()
            log.info("[cache] fetched \(loadedRecipes.count) recipes")
        } catch {
            self.error = "Failed to load recipe data"
            log.error("[cache] FAILED to load recipes: \(String(describing: error), privacy: .public)")
            return
        }

        ingredientsById = Dictionary(uniqueKeysWithValues: loadedIngredients.map { ($0.id, $0) })
        recipesByMealId = Dictionary(uniqueKeysWithValues: loadedRecipes.map { ($0.mealId, $0) })
        isLoaded = true
        error = nil
        log.info("[cache] loaded \(loadedIngredients.count) ingredients, \(loadedRecipes.count) recipes")
        if loadedRecipes.isEmpty {
            log.warning("[cache] recipes collection is EMPTY — no shopping list can be built")
        } else {
            let cachedMealIds = loadedRecipes.map { $0.mealId }.sorted()
            log.info("[cache] recipe mealIds in cache: \(cachedMealIds, privacy: .public)")
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
        log.info("[tuples] building for \(mealIds.count) meal IDs")
        var results: [(ingredient: Ingredient, quantity: Double?, unit: String?)] = []
        var missingRecipeIds: [String] = []
        var missingIngredientIds: [String] = []
        for mealId in mealIds {
            guard let recipe = recipesByMealId[mealId] else {
                missingRecipeIds.append(mealId)
                continue
            }
            for ri in recipe.ingredients {
                guard let ingredient = ingredientsById[ri.ingredientId] else {
                    missingIngredientIds.append(ri.ingredientId)
                    continue
                }
                results.append((ingredient: ingredient, quantity: ri.quantity, unit: ri.unit))
            }
        }
        if !missingRecipeIds.isEmpty {
            log.warning("[tuples] \(missingRecipeIds.count) meal IDs had NO recipe: \(missingRecipeIds, privacy: .public)")
        }
        if !missingIngredientIds.isEmpty {
            log.warning("[tuples] \(missingIngredientIds.count) ingredient IDs missing from cache: \(missingIngredientIds, privacy: .public)")
        }
        log.info("[tuples] produced \(results.count) ingredient tuples from \(mealIds.count) meals")
        return results
    }
}
