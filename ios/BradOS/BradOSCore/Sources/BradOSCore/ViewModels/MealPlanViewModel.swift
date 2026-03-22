import Foundation
import os

private let timingLog = Logger(subsystem: "com.bradcarter.brad-os", category: "timing")
private let shoppingLog = Logger(subsystem: "com.bradcarter.brad-os", category: "shopping")

/// ViewModel for the Meal Plan feature
/// Manages plan generation, critique loop, and finalization
@MainActor
public class MealPlanViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var session: MealPlanSession?
    @Published public var currentPlan: [MealPlanEntry] = []
    @Published public var isLoading = false
    @Published public var isSending = false
    @Published public var error: String?
    @Published public var critiqueText = ""
    @Published public var lastExplanation: String?
    @Published public var changedSlots: Set<String> = []
    @Published public var shoppingList: [ShoppingListSection] = []
    @Published public var isExportingToReminders = false
    @Published public var remindersExportResult: RemindersExportResult?
    @Published public var remindersError: String?
    @Published public var queuedActions = QueuedCritiqueActions()
    @Published public var isCritiqueExpanded = false

    // MARK: - Constants

    private static let sessionIdKey = "mealPlanSessionId"

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol
    private let recipeCache: RecipeCacheService
    private let remindersService: RemindersServiceProtocol
    private let cacheService: MealPlanCacheServiceProtocol
    private let userDefaults: UserDefaultsProtocol

    // MARK: - Initialization

    public init(
        apiClient: APIClientProtocol,
        recipeCache: RecipeCacheService? = nil,
        remindersService: RemindersServiceProtocol = RemindersService(),
        cacheService: MealPlanCacheServiceProtocol? = nil,
        userDefaults: UserDefaultsProtocol = UserDefaults.standard
    ) {
        self.apiClient = apiClient
        self.recipeCache = recipeCache ?? RecipeCacheService.shared
        self.remindersService = remindersService
        self.cacheService = cacheService ?? MealPlanCacheService.shared
        self.userDefaults = userDefaults
    }

    // MARK: - Session Persistence

    private var savedSessionId: String? {
        get { userDefaults.string(forKey: Self.sessionIdKey) }
        set {
            if let newValue {
                userDefaults.set(newValue, forKey: Self.sessionIdKey)
            } else {
                userDefaults.removeObject(forKey: Self.sessionIdKey)
            }
        }
    }

    // MARK: - Generate Plan

    public func generatePlan() async {
        isLoading = true
        error = nil

        do {
            let response = try await apiClient.generateMealPlan()
            savedSessionId = response.sessionId

            let fullSession = try await apiClient.getMealPlanSession(id: response.sessionId)
            session = fullSession
            currentPlan = fullSession.plan
            await updateShoppingList()
        } catch {
            self.error = "Failed to generate meal plan"
            #if DEBUG
            print("[MealPlanViewModel] Generate error: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Load Existing Session

    public func loadExistingSession() async {
        isLoading = true
        error = nil

        // Check disk cache first (instant load for finalized sessions)
        if let cached = cacheService.getCachedSession(), cached.isFinalized {
            session = cached
            currentPlan = cached.plan
            await updateShoppingList()
            isLoading = false
            return
        }

        // Try loading saved session first
        if let sessionId = savedSessionId {
            do {
                let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
                session = fullSession
                currentPlan = fullSession.plan
                await updateShoppingList()
                if fullSession.isFinalized {
                    cacheService.cache(fullSession)
                }
                isLoading = false
                return
            } catch {
                // Session not found or expired, clear the saved ID
                savedSessionId = nil
                #if DEBUG
                print("[MealPlanViewModel] Load saved session error: \(error)")
                #endif
            }
        }

        // No saved session - try loading the latest from backend
        do {
            if let latestSession = try await apiClient.getLatestMealPlanSession() {
                session = latestSession
                currentPlan = latestSession.plan
                await updateShoppingList()
                if latestSession.isFinalized {
                    cacheService.cache(latestSession)
                }
            }
        } catch {
            #if DEBUG
            print("[MealPlanViewModel] Load latest session error: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Send Critique

    public func sendCritique() async {
        let text = critiqueText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let sessionId = session?.id else { return }

        isSending = true
        error = nil

        let totalStart = CFAbsoluteTimeGetCurrent()
        do {
            let critiqueStart = CFAbsoluteTimeGetCurrent()
            let response = try await apiClient.critiqueMealPlan(sessionId: sessionId, critique: text)
            let critiqueMs = Int((CFAbsoluteTimeGetCurrent() - critiqueStart) * 1000)
            timingLog.notice("[TIMING] critiqueMealPlan: \(critiqueMs)ms")

            // Track changed slots from operations
            var changed = Set<String>()
            for operation in response.operations {
                changed.insert("\(operation.dayIndex)-\(operation.mealType.rawValue)")
            }
            changedSlots = changed

            // Update plan and explanation
            currentPlan = response.plan
            lastExplanation = response.explanation
            critiqueText = ""
            queuedActions.clear()

            let shoppingStart = CFAbsoluteTimeGetCurrent()
            await updateShoppingList()
            let shoppingMs = Int((CFAbsoluteTimeGetCurrent() - shoppingStart) * 1000)
            timingLog.notice("[TIMING] updateShoppingList: \(shoppingMs)ms")

            // Refetch full session for updated history
            let refetchStart = CFAbsoluteTimeGetCurrent()
            let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
            let refetchMs = Int((CFAbsoluteTimeGetCurrent() - refetchStart) * 1000)
            timingLog.notice("[TIMING] getMealPlanSession: \(refetchMs)ms")

            session = fullSession

            isSending = false
            let totalMs = Int((CFAbsoluteTimeGetCurrent() - totalStart) * 1000)
            timingLog.notice("[TIMING] sendCritique total: \(totalMs)ms (critique=\(critiqueMs) shopping=\(shoppingMs) refetch=\(refetchMs))")

            // Clear highlight after 2 seconds
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                changedSlots = []
            }
        } catch {
            let totalMs = Int((CFAbsoluteTimeGetCurrent() - totalStart) * 1000)
            timingLog.notice("[TIMING] sendCritique FAILED after \(totalMs)ms: \(error)")
            self.error = "Failed to send critique"
            isSending = false
        }
    }

    // MARK: - Finalize

    public func finalize() async {
        guard let sessionId = session?.id, session?.isFinalized != true else { return }

        error = nil

        do {
            try await apiClient.finalizeMealPlan(sessionId: sessionId)

            // Refetch session to get updated finalized state
            let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
            session = fullSession
            currentPlan = fullSession.plan
            await updateShoppingList()

            // Cache the finalized session
            cacheService.cache(fullSession)

            // Clear saved session ID since it's finalized
            savedSessionId = nil
        } catch {
            self.error = "Failed to finalize meal plan"
            #if DEBUG
            print("[MealPlanViewModel] Finalize error: \(error)")
            #endif
        }
    }

    // MARK: - Queued Actions

    private static let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    /// Get entries filtered and sorted for a specific meal type
    public func entriesForMealType(_ mealType: MealType) -> [MealPlanEntry] {
        currentPlan
            .filter { $0.mealType == mealType }
            .sorted { $0.dayIndex < $1.dayIndex }
    }

    /// Look up the effort level for an entry from the session's meals snapshot
    public func effortForEntry(_ entry: MealPlanEntry) -> Int? {
        guard let mealId = entry.mealId else { return nil }
        return session?.mealsSnapshot.first { $0.id == mealId }?.effort
    }

    /// Check if an entry's meal requires prep the night before
    public func isPrepAheadForEntry(_ entry: MealPlanEntry) -> Bool {
        guard let mealId = entry.mealId else { return false }
        return session?.mealsSnapshot.first { $0.id == mealId }?.prepAhead ?? false
    }

    /// Set of meal IDs that require prep ahead, for passing to child views
    public var prepAheadMealIds: Set<String> {
        guard let snapshot = session?.mealsSnapshot else { return [] }
        return Set(snapshot.filter { $0.prepAhead }.map { $0.id })
    }

    /// Whether a slot supports interaction (false for entries with no mealId, e.g. "Eating out")
    public func isSlotInteractive(_ entry: MealPlanEntry) -> Bool {
        entry.mealId != nil
    }

    /// Toggle swap for an entry's slot
    public func toggleSwap(for entry: MealPlanEntry) {
        guard isSlotInteractive(entry) else { return }
        queuedActions.toggleSwap(slot: MealSlot(entry: entry))
    }

    /// Toggle remove for an entry's slot
    public func toggleRemove(for entry: MealPlanEntry) {
        guard isSlotInteractive(entry) else { return }
        queuedActions.toggleRemove(slot: MealSlot(entry: entry))
    }

    /// Get the queued action for an entry, if any
    public func actionForEntry(_ entry: MealPlanEntry) -> MealPlanAction? {
        queuedActions.action(for: MealSlot(entry: entry))
    }

    /// Submit all queued actions as a natural language critique
    public func submitQueuedActions() async {
        guard !queuedActions.isEmpty else { return }
        critiqueText = queuedActions.generateCritiqueText(plan: currentPlan)
        await sendCritique()
    }

    // MARK: - Start New Plan

    public func startNewPlan() {
        session = nil
        currentPlan = []
        lastExplanation = nil
        critiqueText = ""
        changedSlots = []
        shoppingList = []
        isExportingToReminders = false
        remindersExportResult = nil
        remindersError = nil
        queuedActions = QueuedCritiqueActions()
        isCritiqueExpanded = false
        error = nil
        cacheService.invalidate()
        savedSessionId = nil
    }

    // MARK: - Force Refresh

    public func forceRefresh() async {
        cacheService.invalidate()
        await loadExistingSession()
    }

    // MARK: - Shopping List

    private func updateShoppingList() async {
        let totalEntries = currentPlan.count
        let nilSlots = currentPlan.filter { $0.mealId == nil }
        let mealIds = currentPlan.compactMap { $0.mealId }

        shoppingLog.info("[updateShoppingList] plan has \(totalEntries) entries, \(mealIds.count) with mealId, \(nilSlots.count) nil slots")
        if !nilSlots.isEmpty {
            let nilDesc = nilSlots.map { "day\($0.dayIndex)-\($0.mealType.rawValue)(\($0.mealName ?? "nil"))" }.joined(separator: ", ")
            shoppingLog.info("[updateShoppingList] nil slots: \(nilDesc, privacy: .public)")
        }

        await recipeCache.loadIfNeeded()

        // Check which meals have recipes and which don't
        var missingRecipeMeals: [String] = []
        for entry in currentPlan where entry.mealId != nil {
            let hasRecipe = recipeCache.recipe(forMealId: entry.mealId!) != nil
            let symbol = hasRecipe ? "+" : "MISSING"
            shoppingLog.info("[meal→recipe] \(symbol, privacy: .public) day\(entry.dayIndex)-\(entry.mealType.rawValue, privacy: .public): \(entry.mealName ?? "?", privacy: .public) (id=\(entry.mealId!, privacy: .public))")
            if !hasRecipe {
                missingRecipeMeals.append(entry.mealName ?? entry.mealId!)
            }
        }

        if !missingRecipeMeals.isEmpty {
            let names = missingRecipeMeals.joined(separator: ", ")
            self.error = "Shopping list incomplete — \(missingRecipeMeals.count) meals missing recipes: \(names)"
            shoppingLog.error("[updateShoppingList] \(missingRecipeMeals.count) meals have no recipe: \(names, privacy: .public)")
        }

        shoppingList = ShoppingListBuilder.build(fromMealIds: mealIds, using: recipeCache)

        shoppingLog.info("[updateShoppingList] final shoppingList: \(self.shoppingList.count) sections, \(self.shoppingList.reduce(0) { $0 + $1.items.count }) items")
        if shoppingList.isEmpty && !mealIds.isEmpty {
            shoppingLog.error("[updateShoppingList] EMPTY shopping list despite \(mealIds.count) meal IDs — something is wrong upstream")
        }

        // Full item dump for debugging
        for section in shoppingList {
            let items = section.items.map { $0.displayText }.joined(separator: " | ")
            shoppingLog.info("[shoppingList] \(section.name, privacy: .public) (\(section.items.count)): \(items, privacy: .public)")
        }
    }

    public func exportToReminders() async {
        isExportingToReminders = true
        remindersError = nil
        remindersExportResult = nil

        let itemCount = shoppingList.reduce(0) { $0 + $1.items.count }
        shoppingLog.info("[exportToReminders] starting — \(self.shoppingList.count) sections, \(itemCount) items")
        if shoppingList.isEmpty {
            shoppingLog.warning("[exportToReminders] shopping list is EMPTY, export will save 0 items")
        }

        do {
            let result = try await remindersService.exportToReminders(shoppingList)
            shoppingLog.info("[exportToReminders] success — saved \(result.itemCount) items to '\(result.listName, privacy: .public)'")
            remindersExportResult = result

            // Auto-clear success after 3 seconds
            Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                remindersExportResult = nil
            }
        } catch let error as RemindersError {
            shoppingLog.error("[exportToReminders] RemindersError: \(String(describing: error), privacy: .public)")
            switch error {
            case .accessDenied:
                remindersError = "Reminders access denied. Check Settings > BradOS > Reminders."
            case .listNotFound(let detail):
                remindersError = "Reminders list \"\(detail)\" not found."
            case .exportFailed(let message):
                remindersError = "Export failed: \(message)"
            }
        } catch {
            shoppingLog.error("[exportToReminders] unexpected error: \(error)")
            remindersError = "Export failed: \(error.localizedDescription)"
        }

        isExportingToReminders = false
    }
}

// MARK: - Preview Support

public extension MealPlanViewModel {
    static var preview: MealPlanViewModel {
        let mockClient = MockAPIClient()
        let viewModel = MealPlanViewModel(
            apiClient: mockClient,
            recipeCache: RecipeCacheService(apiClient: mockClient),
            remindersService: MockRemindersService()
        )
        viewModel.session = MealPlanSession.mockSession
        viewModel.currentPlan = MealPlanSession.mockSession.plan
        return viewModel
    }

    static var empty: MealPlanViewModel {
        let emptyClient = MockAPIClient.empty
        return MealPlanViewModel(apiClient: emptyClient, recipeCache: RecipeCacheService(apiClient: emptyClient))
    }
}
