import Testing
import Foundation
@testable import BradOSCore

@Suite("ShoppingListBuilder")
struct ShoppingListBuilderTests {

    // MARK: - Helpers

    /// Create a RecipeCacheService pre-loaded with test data
    @MainActor
    private func makeCache(
        ingredients: [Ingredient],
        recipes: [Recipe]
    ) -> RecipeCacheService {
        let mock = MockAPIClient()
        mock.mockIngredients = ingredients
        mock.mockRecipes = recipes
        let cache = RecipeCacheService(apiClient: mock)
        return cache
    }

    private func makeIngredient(
        id: String,
        name: String,
        storeSection: String
    ) -> Ingredient {
        Ingredient(
            id: id,
            name: name,
            storeSection: storeSection,
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    private func makeRecipe(
        mealId: String,
        ingredients: [RecipeIngredient]
    ) -> Recipe {
        Recipe(
            id: "recipe-\(mealId)",
            mealId: mealId,
            ingredients: ingredients,
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    // MARK: - Tests

    @Test("Same ingredient, same unit sums quantities")
    @MainActor
    func sameIngredientSameUnitSumsQuantities() async {
        let chickenBroth = makeIngredient(id: "ing-broth", name: "Chicken Broth", storeSection: "Canned & Jarred")

        let recipe1 = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-broth", quantity: 2, unit: "cups"),
        ])
        let recipe2 = makeRecipe(mealId: "meal-2", ingredients: [
            RecipeIngredient(ingredientId: "ing-broth", quantity: 3, unit: "cups"),
        ])

        let cache = makeCache(ingredients: [chickenBroth], recipes: [recipe1, recipe2])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1", "meal-2"], using: cache)

        let allItems = sections.flatMap { $0.items }
        let brothItem = allItems.first { $0.id == "ing-broth" }

        #expect(brothItem != nil)
        #expect(brothItem?.totalQuantity == 5.0)
        #expect(brothItem?.unit == "cups")
        #expect(brothItem?.mealCount == 2)
    }

    @Test("Same ingredient, different units returns nil quantity")
    @MainActor
    func sameIngredientDifferentUnitsReturnsNilQuantity() async {
        let milk = makeIngredient(id: "ing-milk", name: "Milk", storeSection: "Dairy & Eggs")

        let recipe1 = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-milk", quantity: 1, unit: "cups"),
        ])
        let recipe2 = makeRecipe(mealId: "meal-2", ingredients: [
            RecipeIngredient(ingredientId: "ing-milk", quantity: 2, unit: "tbsp"),
        ])

        let cache = makeCache(ingredients: [milk], recipes: [recipe1, recipe2])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1", "meal-2"], using: cache)

        let allItems = sections.flatMap { $0.items }
        let milkItem = allItems.first { $0.id == "ing-milk" }

        #expect(milkItem != nil)
        #expect(milkItem?.totalQuantity == nil)
        #expect(milkItem?.unit == nil)
        #expect(milkItem?.displayText == "Milk")
    }

    @Test("Same ingredient, all null quantities shows name only with meal count")
    @MainActor
    func sameIngredientNullQuantitiesShowsNameOnly() async {
        let salt = makeIngredient(id: "ing-salt", name: "Salt", storeSection: "Pantry Staples")

        let recipe1 = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-salt", quantity: nil, unit: nil),
        ])
        let recipe2 = makeRecipe(mealId: "meal-2", ingredients: [
            RecipeIngredient(ingredientId: "ing-salt", quantity: nil, unit: nil),
        ])

        let cache = makeCache(ingredients: [salt], recipes: [recipe1, recipe2])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1", "meal-2"], using: cache)

        let allItems = sections.flatMap { $0.items }
        let saltItem = allItems.first { $0.id == "ing-salt" }

        #expect(saltItem != nil)
        #expect(saltItem?.totalQuantity == nil)
        #expect(saltItem?.unit == nil)
        #expect(saltItem?.mealCount == 2)
        #expect(saltItem?.displayText == "Salt")
    }

    @Test("Items grouped by storeSection")
    @MainActor
    func itemsGroupedByStoreSection() async {
        let chicken = makeIngredient(id: "ing-chicken", name: "Chicken", storeSection: "Meat & Seafood")
        let broccoli = makeIngredient(id: "ing-broccoli", name: "Broccoli", storeSection: "Produce")

        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-chicken", quantity: 1, unit: "lb"),
            RecipeIngredient(ingredientId: "ing-broccoli", quantity: 2, unit: "cups"),
        ])

        let cache = makeCache(ingredients: [chicken, broccoli], recipes: [recipe])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1"], using: cache)

        let sectionNames = sections.map { $0.name }
        #expect(sectionNames.contains("Produce"))
        #expect(sectionNames.contains("Meat & Seafood"))

        let produceSection = sections.first { $0.name == "Produce" }
        #expect(produceSection?.items.contains { $0.name == "Broccoli" } == true)

        let meatSection = sections.first { $0.name == "Meat & Seafood" }
        #expect(meatSection?.items.contains { $0.name == "Chicken" } == true)
    }

    @Test("Sections sorted by predefined order with Pantry Staples last")
    @MainActor
    func sectionsSortedByPredefinedOrder() async {
        let salt = makeIngredient(id: "ing-salt", name: "Salt", storeSection: "Pantry Staples")
        let chicken = makeIngredient(id: "ing-chicken", name: "Chicken", storeSection: "Meat & Seafood")
        let lettuce = makeIngredient(id: "ing-lettuce", name: "Lettuce", storeSection: "Produce")
        let milk = makeIngredient(id: "ing-milk", name: "Milk", storeSection: "Dairy & Eggs")

        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-salt", quantity: nil, unit: nil),
            RecipeIngredient(ingredientId: "ing-chicken", quantity: 1, unit: "lb"),
            RecipeIngredient(ingredientId: "ing-lettuce", quantity: 1, unit: "head"),
            RecipeIngredient(ingredientId: "ing-milk", quantity: 1, unit: "cups"),
        ])

        let cache = makeCache(ingredients: [salt, chicken, lettuce, milk], recipes: [recipe])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1"], using: cache)

        let sectionNames = sections.map { $0.name }
        #expect(sectionNames.first == "Produce")

        // Pantry Staples should be last
        #expect(sectionNames.last == "Pantry Staples")

        // Dairy & Eggs (2) before Meat & Seafood (3)
        if let dairyIndex = sectionNames.firstIndex(of: "Dairy & Eggs"),
           let meatIndex = sectionNames.firstIndex(of: "Meat & Seafood") {
            #expect(dairyIndex < meatIndex)
        }
    }

    @Test("Items sorted alphabetically within section")
    @MainActor
    func itemsSortedAlphabeticallyWithinSection() async {
        let tomato = makeIngredient(id: "ing-tomato", name: "Tomato", storeSection: "Produce")
        let avocado = makeIngredient(id: "ing-avocado", name: "Avocado", storeSection: "Produce")
        let lettuce = makeIngredient(id: "ing-lettuce", name: "Lettuce", storeSection: "Produce")

        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-tomato", quantity: 2, unit: "whole"),
            RecipeIngredient(ingredientId: "ing-avocado", quantity: 1, unit: "whole"),
            RecipeIngredient(ingredientId: "ing-lettuce", quantity: 1, unit: "head"),
        ])

        let cache = makeCache(ingredients: [tomato, avocado, lettuce], recipes: [recipe])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1"], using: cache)

        let produceSection = sections.first { $0.name == "Produce" }
        let itemNames = produceSection?.items.map { $0.name } ?? []

        #expect(itemNames == ["Avocado", "Lettuce", "Tomato"])
    }

    @Test("Empty meal IDs returns empty list")
    @MainActor
    func emptyMealIdsReturnsEmptyList() async {
        let cache = makeCache(ingredients: [], recipes: [])
        await cache.loadIfNeeded()

        let sections = ShoppingListBuilder.build(fromMealIds: [], using: cache)

        #expect(sections.isEmpty)
    }

    @Test("Meal with no recipe is skipped")
    @MainActor
    func mealWithNoRecipeIsSkipped() async {
        let chicken = makeIngredient(id: "ing-chicken", name: "Chicken", storeSection: "Meat & Seafood")
        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-chicken", quantity: 1, unit: "lb"),
        ])

        let cache = makeCache(ingredients: [chicken], recipes: [recipe])
        await cache.loadIfNeeded()

        // "meal-unknown" has no recipe -- should not crash
        let sections = ShoppingListBuilder.build(fromMealIds: ["meal-1", "meal-unknown"], using: cache)

        let allItems = sections.flatMap { $0.items }
        #expect(allItems.count == 1)
        #expect(allItems.first?.name == "Chicken")
    }
}
