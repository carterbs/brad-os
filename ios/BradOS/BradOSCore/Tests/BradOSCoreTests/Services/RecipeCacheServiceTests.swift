import Testing
import Foundation
@testable import BradOSCore

@Suite("RecipeCacheService")
struct RecipeCacheServiceTests {

    // MARK: - Helpers

    private func makeIngredient(
        id: String,
        name: String,
        storeSection: String = "Produce"
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

    @Test("loadIfNeeded only fetches once")
    @MainActor
    func loadIfNeededOnlyFetchesOnce() async {
        let spy = SpyAPIClient(
            ingredients: [makeIngredient(id: "ing-1", name: "Tomato")],
            recipes: [makeRecipe(mealId: "meal-1", ingredients: [
                RecipeIngredient(ingredientId: "ing-1", quantity: 1, unit: "whole"),
            ])]
        )

        let cache = RecipeCacheService(apiClient: spy)

        // First call should fetch
        await cache.loadIfNeeded()
        #expect(cache.isLoaded == true)
        #expect(spy.getIngredientsCallCount == 1)
        #expect(spy.getRecipesCallCount == 1)

        // Second call should not fetch again
        await cache.loadIfNeeded()
        #expect(spy.getIngredientsCallCount == 1)
        #expect(spy.getRecipesCallCount == 1)
    }

    @Test("ingredientTuples returns correct data")
    @MainActor
    func ingredientTuplesReturnsCorrectData() async {
        let tomato = makeIngredient(id: "ing-tomato", name: "Tomato", storeSection: "Produce")
        let chicken = makeIngredient(id: "ing-chicken", name: "Chicken", storeSection: "Meat & Seafood")

        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-tomato", quantity: 2, unit: "whole"),
            RecipeIngredient(ingredientId: "ing-chicken", quantity: 1, unit: "lb"),
        ])

        let mock = MockAPIClient()
        mock.mockIngredients = [tomato, chicken]
        mock.mockRecipes = [recipe]

        let cache = RecipeCacheService(apiClient: mock)
        await cache.loadIfNeeded()

        let tuples = cache.ingredientTuples(forMealIds: ["meal-1"])

        #expect(tuples.count == 2)

        let tomatoTuple = tuples.first { $0.ingredient.id == "ing-tomato" }
        #expect(tomatoTuple?.quantity == 2)
        #expect(tomatoTuple?.unit == "whole")

        let chickenTuple = tuples.first { $0.ingredient.id == "ing-chicken" }
        #expect(chickenTuple?.quantity == 1)
        #expect(chickenTuple?.unit == "lb")
    }

    @Test("Unknown meal ID returns empty tuples")
    @MainActor
    func unknownMealIdReturnsEmptyTuples() async {
        let mock = MockAPIClient()
        mock.mockIngredients = [
            makeIngredient(id: "ing-1", name: "Tomato"),
        ]
        mock.mockRecipes = [
            makeRecipe(mealId: "meal-1", ingredients: [
                RecipeIngredient(ingredientId: "ing-1", quantity: 1, unit: "whole"),
            ]),
        ]

        let cache = RecipeCacheService(apiClient: mock)
        await cache.loadIfNeeded()

        let tuples = cache.ingredientTuples(forMealIds: ["meal-unknown"])

        #expect(tuples.isEmpty)
    }

    @Test("ingredient byId returns correct ingredient")
    @MainActor
    func ingredientByIdReturnsCorrectIngredient() async {
        let tomato = makeIngredient(id: "ing-tomato", name: "Tomato")

        let mock = MockAPIClient()
        mock.mockIngredients = [tomato]
        mock.mockRecipes = []

        let cache = RecipeCacheService(apiClient: mock)
        await cache.loadIfNeeded()

        let result = cache.ingredient(byId: "ing-tomato")
        #expect(result?.name == "Tomato")

        let missing = cache.ingredient(byId: "nonexistent")
        #expect(missing == nil)
    }

    @Test("recipe forMealId returns correct recipe")
    @MainActor
    func recipeForMealIdReturnsCorrectRecipe() async {
        let recipe = makeRecipe(mealId: "meal-1", ingredients: [
            RecipeIngredient(ingredientId: "ing-1", quantity: 1, unit: "cups"),
        ])

        let mock = MockAPIClient()
        mock.mockIngredients = []
        mock.mockRecipes = [recipe]

        let cache = RecipeCacheService(apiClient: mock)
        await cache.loadIfNeeded()

        let result = cache.recipe(forMealId: "meal-1")
        #expect(result?.id == "recipe-meal-1")

        let missing = cache.recipe(forMealId: "nonexistent")
        #expect(missing == nil)
    }

    @Test("error set when API call fails")
    @MainActor
    func errorSetWhenAPICallFails() async {
        let mock = MockAPIClient.failing()

        let cache = RecipeCacheService(apiClient: mock)
        await cache.loadIfNeeded()

        #expect(cache.isLoaded == false)
        #expect(cache.error == "Failed to load recipe data")
    }
}

// MARK: - SpyAPIClient

/// A minimal API client that counts calls to getIngredients and getRecipes.
/// Only the ingredient/recipe methods are functional; all others throw.
private final class SpyAPIClient: APIClientProtocol, @unchecked Sendable {
    var getIngredientsCallCount = 0
    var getRecipesCallCount = 0

    private let ingredients: [Ingredient]
    private let recipes: [Recipe]

    init(ingredients: [Ingredient], recipes: [Recipe]) {
        self.ingredients = ingredients
        self.recipes = recipes
    }

    func getIngredients() async throws -> [Ingredient] {
        getIngredientsCallCount += 1
        return ingredients
    }

    func getRecipes() async throws -> [Recipe] {
        getRecipesCallCount += 1
        return recipes
    }

    // MARK: - Unused protocol stubs

    private func notImplemented() -> Error {
        APIError.internalError("Not implemented in SpyAPIClient")
    }

    func getTodaysWorkout() async throws -> Workout? { throw notImplemented() }
    func getWorkout(id: String) async throws -> Workout { throw notImplemented() }
    func startWorkout(id: String) async throws -> Workout { throw notImplemented() }
    func completeWorkout(id: String) async throws -> Workout { throw notImplemented() }
    func skipWorkout(id: String) async throws -> Workout { throw notImplemented() }
    func logSet(id: String, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet { throw notImplemented() }
    func skipSet(id: String) async throws -> WorkoutSet { throw notImplemented() }
    func unlogSet(id: String) async throws -> WorkoutSet { throw notImplemented() }
    func addSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult { throw notImplemented() }
    func removeSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult { throw notImplemented() }
    func getExercises() async throws -> [Exercise] { throw notImplemented() }
    func getExercise(id: String) async throws -> Exercise { throw notImplemented() }
    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise { throw notImplemented() }
    func updateExercise(id: String, name: String?, weightIncrement: Double?) async throws -> Exercise { throw notImplemented() }
    func deleteExercise(id: String) async throws { throw notImplemented() }
    func getExerciseHistory(id: String) async throws -> ExerciseHistory { throw notImplemented() }
    func getPlans() async throws -> [Plan] { throw notImplemented() }
    func getPlan(id: String) async throws -> Plan { throw notImplemented() }
    func createPlan(name: String, durationWeeks: Int) async throws -> Plan { throw notImplemented() }
    func updatePlan(id: String, name: String?, durationWeeks: Int?) async throws -> Plan { throw notImplemented() }
    func deletePlan(id: String) async throws { throw notImplemented() }
    func getPlanDays(planId: String) async throws -> [PlanDay] { throw notImplemented() }
    func getMesocycles() async throws -> [Mesocycle] { throw notImplemented() }
    func getActiveMesocycle() async throws -> Mesocycle? { throw notImplemented() }
    func getMesocycle(id: String) async throws -> Mesocycle { throw notImplemented() }
    func createMesocycle(planId: String, startDate: Date) async throws -> Mesocycle { throw notImplemented() }
    func startMesocycle(id: String) async throws -> Mesocycle { throw notImplemented() }
    func completeMesocycle(id: String) async throws -> Mesocycle { throw notImplemented() }
    func cancelMesocycle(id: String) async throws -> Mesocycle { throw notImplemented() }
    func getStretchSessions() async throws -> [StretchSession] { throw notImplemented() }
    func getStretchSession(id: String) async throws -> StretchSession { throw notImplemented() }
    func getLatestStretchSession() async throws -> StretchSession? { throw notImplemented() }
    func createStretchSession(_ session: StretchSession) async throws -> StretchSession { throw notImplemented() }
    func getMeditationSessions() async throws -> [MeditationSession] { throw notImplemented() }
    func getLatestMeditationSession() async throws -> MeditationSession? { throw notImplemented() }
    func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession { throw notImplemented() }
    func getMeditationStats() async throws -> MeditationStats { throw notImplemented() }
    func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData { throw notImplemented() }
    func getBarcodes() async throws -> [Barcode] { throw notImplemented() }
    func getBarcode(id: String) async throws -> Barcode { throw notImplemented() }
    func createBarcode(_ dto: CreateBarcodeDTO) async throws -> Barcode { throw notImplemented() }
    func updateBarcode(id: String, dto: UpdateBarcodeDTO) async throws -> Barcode { throw notImplemented() }
    func deleteBarcode(id: String) async throws { throw notImplemented() }
    func generateMealPlan() async throws -> GenerateMealPlanResponse { throw notImplemented() }
    func getMealPlanSession(id: String) async throws -> MealPlanSession { throw notImplemented() }
    func getLatestMealPlanSession() async throws -> MealPlanSession? { throw notImplemented() }
    func critiqueMealPlan(sessionId: String, critique: String) async throws -> CritiqueMealPlanResponse { throw notImplemented() }
    func finalizeMealPlan(sessionId: String) async throws { throw notImplemented() }
    func getGuidedMeditationCategories() async throws -> [GuidedMeditationCategoryResponse] { throw notImplemented() }
    func getGuidedMeditationScripts(category: String) async throws -> [GuidedMeditationScript] { throw notImplemented() }
    func getGuidedMeditationScript(id: String) async throws -> GuidedMeditationScript { throw notImplemented() }
    func getStretches() async throws -> [StretchRegionData] { throw notImplemented() }
    func synthesizeSpeech(text: String) async throws -> Data { throw notImplemented() }
    func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry] { throw notImplemented() }
    func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry] { throw notImplemented() }
    func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry] { throw notImplemented() }
}
