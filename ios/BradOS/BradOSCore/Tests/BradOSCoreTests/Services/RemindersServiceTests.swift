import Testing
import Foundation
@testable import BradOSCore

@Suite("RemindersService")
struct RemindersServiceTests {

    // MARK: - Helpers

    private func makeSections() -> [ShoppingListSection] {
        [
            ShoppingListSection(
                id: "Produce",
                name: "Produce",
                sortOrder: 1,
                items: [
                    ShoppingListItem(id: "1", name: "Tomato", storeSection: "Produce", totalQuantity: 2, unit: "whole", mealCount: 1),
                    ShoppingListItem(id: "2", name: "Lettuce", storeSection: "Produce", totalQuantity: 1, unit: "head", mealCount: 1),
                ],
                isPantryStaples: false
            ),
            ShoppingListSection(
                id: "Dairy & Eggs",
                name: "Dairy & Eggs",
                sortOrder: 2,
                items: [
                    ShoppingListItem(id: "3", name: "Milk", storeSection: "Dairy & Eggs", totalQuantity: 1, unit: "gallon", mealCount: 2),
                ],
                isPantryStaples: false
            ),
        ]
    }

    // MARK: - Mock Tests

    @Test("Mock returns configured success result")
    func mockReturnsSuccessResult() async throws {
        let expectedResult = RemindersExportResult(itemCount: 12, listName: "Test-List")
        let mock = MockRemindersService(result: .success(expectedResult))

        let result = try await mock.exportToReminders(makeSections())

        #expect(result.itemCount == 12)
        #expect(result.listName == "Test-List")
    }

    @Test("Mock throws configured access denied error")
    func mockThrowsAccessDenied() async {
        let mock = MockRemindersService(result: .failure(.accessDenied))

        await #expect(throws: RemindersError.accessDenied) {
            try await mock.exportToReminders(makeSections())
        }
    }

    @Test("Mock throws configured list not found error")
    func mockThrowsListNotFound() async {
        let mock = MockRemindersService(result: .failure(.listNotFound("Missing")))

        await #expect(throws: RemindersError.listNotFound("Missing")) {
            try await mock.exportToReminders(makeSections())
        }
    }

    @Test("Mock throws configured export failed error")
    func mockThrowsExportFailed() async {
        let mock = MockRemindersService(result: .failure(.exportFailed("Something broke")))

        await #expect(throws: RemindersError.exportFailed("Something broke")) {
            try await mock.exportToReminders(makeSections())
        }
    }

    // MARK: - List Name

    @Test("List name matches compile-time configuration")
    func listNameMatchesConfiguration() {
        #if DEBUG && targetEnvironment(simulator)
        #expect(RemindersService.listName == "Groceries-2")
        #else
        #expect(RemindersService.listName == "Groceries")
        #endif
    }

    // MARK: - ViewModel Integration

    @Test("ViewModel export success sets result and clears error")
    @MainActor
    func viewModelExportSuccess() async {
        let expectedResult = RemindersExportResult(itemCount: 3, listName: "Groceries-2")
        let mock = MockRemindersService(result: .success(expectedResult))
        let mockAPI = MockAPIClient()
        let vm = MealPlanViewModel(
            apiClient: mockAPI,
            recipeCache: RecipeCacheService(apiClient: mockAPI),
            remindersService: mock
        )

        // Give it some shopping list data
        vm.shoppingList = makeSections()

        await vm.exportToReminders()

        #expect(vm.remindersExportResult?.itemCount == 3)
        #expect(vm.remindersExportResult?.listName == "Groceries-2")
        #expect(vm.remindersError == nil)
        #expect(vm.isExportingToReminders == false)
    }

    @Test("ViewModel export access denied sets error message")
    @MainActor
    func viewModelExportAccessDenied() async {
        let mock = MockRemindersService(result: .failure(.accessDenied))
        let mockAPI = MockAPIClient()
        let vm = MealPlanViewModel(
            apiClient: mockAPI,
            recipeCache: RecipeCacheService(apiClient: mockAPI),
            remindersService: mock
        )
        vm.shoppingList = makeSections()

        await vm.exportToReminders()

        #expect(vm.remindersError?.contains("access denied") == true)
        #expect(vm.remindersExportResult == nil)
        #expect(vm.isExportingToReminders == false)
    }

    @Test("ViewModel export list not found sets error message")
    @MainActor
    func viewModelExportListNotFound() async {
        let mock = MockRemindersService(result: .failure(.listNotFound("Groceries-2")))
        let mockAPI = MockAPIClient()
        let vm = MealPlanViewModel(
            apiClient: mockAPI,
            recipeCache: RecipeCacheService(apiClient: mockAPI),
            remindersService: mock
        )
        vm.shoppingList = makeSections()

        await vm.exportToReminders()

        #expect(vm.remindersError?.contains("Groceries-2") == true)
        #expect(vm.remindersError?.contains("not found") == true)
        #expect(vm.remindersExportResult == nil)
    }

    @Test("ViewModel export with empty shopping list succeeds with zero items")
    @MainActor
    func viewModelExportEmptyList() async {
        let mock = MockRemindersService(result: .success(RemindersExportResult(itemCount: 0, listName: "Groceries-2")))
        let mockAPI = MockAPIClient()
        let vm = MealPlanViewModel(
            apiClient: mockAPI,
            recipeCache: RecipeCacheService(apiClient: mockAPI),
            remindersService: mock
        )
        vm.shoppingList = []

        await vm.exportToReminders()

        #expect(vm.remindersExportResult?.itemCount == 0)
        #expect(vm.remindersError == nil)
    }

    @Test("ViewModel startNewPlan clears reminders state")
    @MainActor
    func startNewPlanClearsRemindersState() async {
        let mock = MockRemindersService(result: .success(RemindersExportResult(itemCount: 3, listName: "Groceries-2")))
        let mockAPI = MockAPIClient()
        let vm = MealPlanViewModel(
            apiClient: mockAPI,
            recipeCache: RecipeCacheService(apiClient: mockAPI),
            remindersService: mock
        )
        vm.shoppingList = makeSections()
        await vm.exportToReminders()

        // Verify state is set
        #expect(vm.remindersExportResult != nil)

        // Reset
        vm.startNewPlan()

        #expect(vm.remindersExportResult == nil)
        #expect(vm.remindersError == nil)
        #expect(vm.isExportingToReminders == false)
    }
}
