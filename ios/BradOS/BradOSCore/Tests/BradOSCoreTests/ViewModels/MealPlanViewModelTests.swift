import Foundation
import Testing
@testable import BradOSCore

@Suite("MealPlanViewModel")
@MainActor
struct MealPlanViewModelTests {

    private func makeMeal(
        id: String,
        name: String,
        mealType: MealType,
        effort: Int = 1,
        hasRedMeat: Bool = false,
        prepAhead: Bool = false
    ) -> Meal {
        Meal(
            id: id,
            name: name,
            mealType: mealType,
            effort: effort,
            hasRedMeat: hasRedMeat,
            prepAhead: prepAhead,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeIngredient(
        id: String,
        name: String,
        storeSection: String = "Produce"
    ) -> Ingredient {
        Ingredient(
            id: id,
            name: name,
            storeSection: storeSection,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeRecipe(mealId: String, ingredients: [RecipeIngredient]) -> Recipe {
        Recipe(
            id: "recipe-\(mealId)",
            mealId: mealId,
            ingredients: ingredients,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makePlanEntry(
        dayIndex: Int,
        mealType: MealType,
        mealId: String,
        mealName: String
    ) -> MealPlanEntry {
        MealPlanEntry(dayIndex: dayIndex, mealType: mealType, mealId: mealId, mealName: mealName)
    }

    private func makeSession(
        id: String,
        isFinalized: Bool,
        plan: [MealPlanEntry],
        mealsSnapshot: [Meal],
        history: [ConversationMessage] = []
    ) -> MealPlanSession {
        MealPlanSession(
            id: id,
            plan: plan,
            mealsSnapshot: mealsSnapshot,
            history: history,
            isFinalized: isFinalized,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func shoppingItemNames(_ sections: [ShoppingListSection]) -> Set<String> {
        Set(sections.flatMap { $0.items }.map(\.name))
    }

    @Test("initial state is empty and idle")
    func initialStateIsEmptyAndIdle() {
        let vm = MealPlanViewModel(
            apiClient: MockAPIClient(),
            recipeCache: RecipeCacheService(apiClient: MockAPIClient()),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )

        #expect(vm.session == nil)
        #expect(vm.currentPlan.isEmpty)
        #expect(vm.shoppingList.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.isSending == false)
        #expect(vm.error == nil)
    }

    @Test("loadExistingSession uses finalized disk cache before API")
    @MainActor
    func loadExistingSessionUsesFinalizedDiskCacheBeforeAPI() async {
        let cachedSession = makeSession(
            id: "cached-session",
            isFinalized: true,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let cacheService = RecordingMealPlanCacheService(cachedSession: cachedSession)
        let mockDefaults = MockUserDefaults()
        let mock = MockAPIClient()
        mock.shouldFail = true

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: cacheService,
            userDefaults: mockDefaults
        )

        await vm.loadExistingSession()

        #expect(vm.session == cachedSession)
        #expect(vm.currentPlan == cachedSession.plan)
        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
    }

    @Test("loadExistingSession uses saved session id when present")
    @MainActor
    func loadExistingSessionUsesSavedSessionIdWhenPresent() async {
        let ingredients = [
            makeIngredient(id: "ingredient-1", name: "Cucumber", storeSection: "Produce"),
            makeIngredient(id: "ingredient-2", name: "Beans", storeSection: "Pasta & Grains")
        ]

        let recipes = [
            makeRecipe(
                mealId: "meal-1",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-1", quantity: 2, unit: "cups")]
            ),
            makeRecipe(
                mealId: "meal-2",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-2", quantity: 1, unit: "cup")]
            )
        ]

        let mock = MockAPIClient()
        mock.mockIngredients = ingredients
        mock.mockRecipes = recipes

        let plan = [
            makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast"),
            makePlanEntry(dayIndex: 1, mealType: .lunch, mealId: "meal-2", mealName: "Lunch")
        ]

        let savedSession = makeSession(
            id: "saved-session-id",
            isFinalized: false,
            plan: plan,
            mealsSnapshot: [
                makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast),
                makeMeal(id: "meal-2", name: "Lunch", mealType: .lunch),
            ]
        )
        mock.mockMealPlanSession = savedSession

        let mockDefaults = MockUserDefaults()
        mockDefaults.set("saved-session-id", forKey: "mealPlanSessionId")

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: mockDefaults
        )

        await vm.loadExistingSession()

        #expect(vm.session == savedSession)
        #expect(vm.currentPlan == savedSession.plan)
        #expect(vm.shoppingList.isEmpty == false)
        #expect(shoppingItemNames(vm.shoppingList) == ["Cucumber", "Beans"])
        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
    }

    @Test("loadExistingSession falls back to latest session when no saved id")
    @MainActor
    func loadExistingSessionFallsBackToLatestSessionWhenNoSavedId() async {
        let cacheService = RecordingMealPlanCacheService()

        let ingredients = [
            makeIngredient(id: "ingredient-1", name: "Eggs", storeSection: "Dairy & Eggs")
        ]
        let recipes = [
            makeRecipe(
                mealId: "meal-1",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-1", quantity: 6, unit: "eggs")]
            )
        ]

        let latestSession = makeSession(
            id: "latest-session",
            isFinalized: true,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient()
        mock.mockIngredients = ingredients
        mock.mockRecipes = recipes
        mock.mockMealPlanSession = latestSession
        let mockDefaults = MockUserDefaults()

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: cacheService,
            userDefaults: mockDefaults
        )

        await vm.loadExistingSession()

        #expect(vm.session == latestSession)
        #expect(vm.currentPlan == latestSession.plan)
        #expect(shoppingItemNames(vm.shoppingList) == ["Eggs"])
        #expect(vm.error == nil)
        #expect(cacheService.cacheCallCount == 1)
        #expect(cacheService.cachedSession == latestSession)
        #expect(cacheService.cachedSession?.isFinalized == true)
    }

    @Test("loadExistingSession latest failure leaves view model stable")
    @MainActor
    func loadExistingSessionLatestFailureLeavesViewModelStable() async {
        let mock = MockAPIClient()
        mock.shouldFail = true

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )

        await vm.loadExistingSession()

        #expect(vm.isLoading == false)
        #expect(vm.session == nil)
        #expect(vm.currentPlan.isEmpty)
        #expect(vm.shoppingList.isEmpty)
        #expect(vm.error == nil)
    }

    @Test("generatePlan success stores session id and refreshes shopping list")
    @MainActor
    func generatePlanSuccessStoresSessionIdAndRefreshesShoppingList() async {
        let ingredients = [
            makeIngredient(id: "ingredient-1", name: "Tomato", storeSection: "Produce"),
            makeIngredient(id: "ingredient-2", name: "Rice", storeSection: "Pasta & Grains")
        ]
        let recipes = [
            makeRecipe(
                mealId: "meal-1",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-1", quantity: 1, unit: "piece")]
            ),
            makeRecipe(
                mealId: "meal-2",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-2", quantity: 1.5, unit: "cups")]
            )
        ]

        let generatedSession = makeSession(
            id: "generated-session",
            isFinalized: false,
            plan: [
                makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Tomato Breakfast"),
                makePlanEntry(dayIndex: 1, mealType: .lunch, mealId: "meal-2", mealName: "Rice Lunch")
            ],
            mealsSnapshot: [
                makeMeal(id: "meal-1", name: "Tomato Breakfast", mealType: .breakfast),
                makeMeal(id: "meal-2", name: "Rice Lunch", mealType: .lunch),
            ]
        )

        let mock = MockAPIClient()
        mock.mockIngredients = ingredients
        mock.mockRecipes = recipes
        mock.mockGenerateResponse = GenerateMealPlanResponse(sessionId: generatedSession.id, plan: generatedSession.plan)
        mock.mockMealPlanSession = generatedSession

        let mockDefaults = MockUserDefaults()
        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: mockDefaults
        )

        await vm.generatePlan()

        #expect(vm.session == generatedSession)
        #expect(vm.currentPlan == generatedSession.plan)
        #expect(shoppingItemNames(vm.shoppingList) == ["Tomato", "Rice"])
        #expect(vm.error == nil)
        #expect(vm.isLoading == false)
        #expect(mockDefaults.string(forKey: "mealPlanSessionId") == generatedSession.id)
    }

    @Test("generatePlan failure sets error and clears loading")
    @MainActor
    func generatePlanFailureSetsErrorAndClearsLoading() async {
        let priorPlan = [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")]
        let priorSession = makeSession(
            id: "prior-session",
            isFinalized: false,
            plan: priorPlan,
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient()
        mock.shouldFail = true

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )
        vm.session = priorSession
        vm.currentPlan = priorPlan

        await vm.generatePlan()

        #expect(vm.error == "Failed to generate meal plan")
        #expect(vm.isLoading == false)
        #expect(vm.session == priorSession)
        #expect(vm.currentPlan == priorPlan)
    }

    @Test("submitQueuedActions sends critique and applies critique response")
    @MainActor
    func submitQueuedActionsSendsCritiqueAndAppliesCritiqueResponse() async {
        let initialSession = makeSession(
            id: "critique-session",
            isFinalized: false,
            plan: [
                makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast"),
                makePlanEntry(dayIndex: 0, mealType: .lunch, mealId: "meal-2", mealName: "Lunch")
            ],
            mealsSnapshot: [
                makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast),
                makeMeal(id: "meal-2", name: "Lunch", mealType: .lunch),
            ]
        )

        let critiqueSession = makeSession(
            id: "critique-session",
            isFinalized: false,
            plan: [
                makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-3", mealName: "Critique Breakfast"),
                makePlanEntry(dayIndex: 0, mealType: .lunch, mealId: "meal-2", mealName: "Lunch")
            ],
            mealsSnapshot: [
                makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast),
                makeMeal(id: "meal-2", name: "Lunch", mealType: .lunch),
                makeMeal(id: "meal-3", name: "Critique Breakfast", mealType: .breakfast),
            ]
        )

        let mock = MockAPIClient()
        mock.mockIngredients = [
            makeIngredient(id: "ingredient-1", name: "Apple", storeSection: "Produce"),
            makeIngredient(id: "ingredient-2", name: "Milk", storeSection: "Dairy & Eggs"),
            makeIngredient(id: "ingredient-3", name: "Spinach", storeSection: "Produce"),
        ]
        mock.mockRecipes = [
            makeRecipe(
                mealId: "meal-1",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-1", quantity: 1, unit: "cup")]
            ),
            makeRecipe(
                mealId: "meal-3",
                ingredients: [RecipeIngredient(ingredientId: "ingredient-3", quantity: 1, unit: "cup")]
            ),
        ]
        mock.mockCritiqueResponse = CritiqueMealPlanResponse(
            plan: critiqueSession.plan,
            explanation: "Applied requested changes.",
            operations: [
                CritiqueOperation(dayIndex: 0, mealType: .breakfast, newMealId: "meal-3"),
                CritiqueOperation(dayIndex: 0, mealType: .lunch, newMealId: nil)
            ],
            errors: []
        )
        mock.mockMealPlanSession = critiqueSession

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )

        vm.session = initialSession
        vm.currentPlan = initialSession.plan

        vm.toggleSwap(for: initialSession.plan[0])
        vm.toggleRemove(for: initialSession.plan[1])

        await vm.submitQueuedActions()

        #expect(vm.queuedActions.isEmpty)
        #expect(vm.currentPlan == critiqueSession.plan)
        #expect(vm.lastExplanation == "Applied requested changes.")
        #expect(vm.changedSlots == ["0-\(MealType.breakfast.rawValue)", "0-\(MealType.lunch.rawValue)"])
        #expect(vm.critiqueText.isEmpty)
        #expect(vm.isSending == false)
        #expect(vm.error == nil)
        #expect(shoppingItemNames(vm.shoppingList) == ["Spinach"])
    }

    @Test("submitQueuedActions with empty queue is no-op")
    @MainActor
    func submitQueuedActionsWithEmptyQueueIsNoOp() async {
        let initialPlan = [
            makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")
        ]
        let vm = MealPlanViewModel(
            apiClient: MockAPIClient(),
            recipeCache: RecipeCacheService(apiClient: MockAPIClient()),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )

        vm.currentPlan = initialPlan

        await vm.submitQueuedActions()

        #expect(vm.queuedActions.isEmpty)
        #expect(vm.currentPlan == initialPlan)
        #expect(vm.isSending == false)
        #expect(vm.error == nil)
    }

    @Test("submitQueuedActions failure sets error and preserves queued actions")
    @MainActor
    func submitQueuedActionsFailureSetsErrorAndPreservesQueuedActions() async {
        let initialPlan = [
            makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")
        ]
        let session = makeSession(
            id: "critique-session",
            isFinalized: false,
            plan: initialPlan,
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient()
        mock.shouldFail = true

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: RecordingMealPlanCacheService(),
            userDefaults: MockUserDefaults()
        )
        vm.session = session
        vm.currentPlan = initialPlan
        vm.toggleSwap(for: initialPlan[0])

        await vm.submitQueuedActions()

        #expect(vm.error == "Failed to send critique")
        #expect(vm.isSending == false)
        #expect(vm.queuedActions.action(for: MealSlot(entry: initialPlan[0])) == .swap)
    }

    @Test("finalize success refetches session caches it and clears saved session id")
    @MainActor
    func finalizeSuccessRefetchesSessionCachesItAndClearsSavedSessionId() async {
        let activeSession = makeSession(
            id: "finalize-session",
            isFinalized: false,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let finalizedSession = makeSession(
            id: "finalize-session",
            isFinalized: true,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient()
        mock.mockMealPlanSession = finalizedSession

        let cacheService = RecordingMealPlanCacheService()
        let mockDefaults = MockUserDefaults()
        mockDefaults.set("finalize-session", forKey: "mealPlanSessionId")

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: cacheService,
            userDefaults: mockDefaults
        )
        vm.session = activeSession
        vm.currentPlan = activeSession.plan

        await vm.finalize()

        #expect(vm.session == finalizedSession)
        #expect(vm.currentPlan == finalizedSession.plan)
        #expect(vm.session?.isFinalized == true)
        #expect(vm.error == nil)
        #expect(cacheService.cacheCallCount == 1)
        #expect(cacheService.cachedSession == finalizedSession)
        #expect(mockDefaults.string(forKey: "mealPlanSessionId") == nil)
    }

    @Test("finalize failure sets error and does not cache")
    @MainActor
    func finalizeFailureSetsErrorAndDoesNotCache() async {
        let activeSession = makeSession(
            id: "finalize-session",
            isFinalized: false,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient()
        mock.shouldFail = true

        let mockDefaults = MockUserDefaults()
        mockDefaults.set("finalize-session", forKey: "mealPlanSessionId")
        let cacheService = RecordingMealPlanCacheService()

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: cacheService,
            userDefaults: mockDefaults
        )
        vm.session = activeSession
        vm.currentPlan = activeSession.plan

        await vm.finalize()

        #expect(vm.error == "Failed to finalize meal plan")
        #expect(vm.currentPlan == activeSession.plan)
        #expect(cacheService.cacheCallCount == 0)
        #expect(mockDefaults.string(forKey: "mealPlanSessionId") == "finalize-session")
    }

    @Test("finalize no-ops when session already finalized")
    @MainActor
    func finalizeNoOpsWhenSessionAlreadyFinalized() async {
        let finalizedSession = makeSession(
            id: "finalized-session",
            isFinalized: true,
            plan: [makePlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "meal-1", mealName: "Breakfast")],
            mealsSnapshot: [makeMeal(id: "meal-1", name: "Breakfast", mealType: .breakfast)]
        )

        let mock = MockAPIClient.failing(with: .internalError("unexpected finalize call"))
        let mockDefaults = MockUserDefaults()
        mockDefaults.set("finalized-session", forKey: "mealPlanSessionId")
        let cacheService = RecordingMealPlanCacheService()

        let vm = MealPlanViewModel(
            apiClient: mock,
            recipeCache: RecipeCacheService(apiClient: mock),
            cacheService: cacheService,
            userDefaults: mockDefaults
        )
        vm.session = finalizedSession
        vm.currentPlan = finalizedSession.plan

        await vm.finalize()

        #expect(vm.session == finalizedSession)
        #expect(vm.currentPlan == finalizedSession.plan)
        #expect(vm.error == nil)
        #expect(cacheService.cacheCallCount == 0)
        #expect(mockDefaults.string(forKey: "mealPlanSessionId") == "finalized-session")
    }
}

private final class RecordingMealPlanCacheService: MealPlanCacheServiceProtocol, @unchecked Sendable {
    private(set) var cachedSession: MealPlanSession?
    private(set) var cacheCallCount = 0
    private(set) var invalidateCallCount = 0

    init(cachedSession: MealPlanSession? = nil) {
        self.cachedSession = cachedSession
    }

    func getCachedSession() -> MealPlanSession? {
        cachedSession
    }

    func cache(_ session: MealPlanSession) {
        cacheCallCount += 1
        cachedSession = session
    }

    func invalidate() {
        invalidateCallCount += 1
        cachedSession = nil
    }

    func isCached(sessionId: String) -> Bool {
        cachedSession?.id == sessionId
    }
}
