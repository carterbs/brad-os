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
    @Published public var isRefreshing = false
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
    private var shoppingListTask: Task<Void, Never>?

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
            cacheService.cacheForScreen(fullSession)
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
        let loadStart = CFAbsoluteTimeGetCurrent()
        isLoading = true
        error = nil

        // Screen cache restores both draft and finalized sessions.
        if let cached = cacheService.getCachedScreenSession() {
            publishSession(cached)
            finishInitialLoad(source: "screen-cache", startedAt: loadStart)
            return
        }

        // Migrate the existing finalized/widget cache into the screen cache.
        if let cached = cacheService.getCachedSession(), cached.isFinalized {
            publishSession(cached)
            finishInitialLoad(source: "finalized-cache", startedAt: loadStart)
            return
        }

        // Try loading saved session first
        if let sessionId = savedSessionId {
            do {
                let fullSession = try await apiClient.getMealPlanSession(id: sessionId)
                publishSession(fullSession)
                finishInitialLoad(source: "saved-session", startedAt: loadStart)
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
                publishSession(latestSession)
                finishInitialLoad(source: "latest-session", startedAt: loadStart)
                return
            }
        } catch {
            #if DEBUG
            print("[MealPlanViewModel] Load latest session error: \(error)")
            #endif
        }

        isLoading = false
        logLoadTiming(source: "empty", startedAt: loadStart)
    }

    private func publishSession(_ loadedSession: MealPlanSession) {
        session = loadedSession
        currentPlan = loadedSession.plan
        cacheService.cacheForScreen(loadedSession)
        if loadedSession.isFinalized {
            cacheService.cache(loadedSession)
            savedSessionId = nil
        } else {
            savedSessionId = loadedSession.id
        }
    }

    private func finishInitialLoad(source: String, startedAt: CFAbsoluteTime) {
        isLoading = false
        scheduleShoppingListUpdate()
        logLoadTiming(source: source, startedAt: startedAt)
    }

    private func logLoadTiming(source: String, startedAt: CFAbsoluteTime) {
        let elapsedMs = Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1000)
        timingLog.notice("[TIMING] mealPlan visible source=\(source, privacy: .public) elapsed=\(elapsedMs)ms")
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
                changed.insert("\(operation.dayIndex)-\(operation.mealTrack.rawValue)-\(operation.mealType.rawValue)")
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
            cacheService.cacheForScreen(fullSession)

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
            cacheService.cacheForScreen(fullSession)

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
            .sorted {
                if $0.dayIndex != $1.dayIndex {
                    return $0.dayIndex < $1.dayIndex
                }
                return $0.slotSortOrder < $1.slotSortOrder
            }
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
        shoppingListTask?.cancel()
        shoppingListTask = nil
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
        cacheService.invalidateScreenCache()
        savedSessionId = nil
    }

    // MARK: - Force Refresh

    public func forceRefresh() async {
        guard !isRefreshing else { return }
        let refreshStart = CFAbsoluteTimeGetCurrent()
        isRefreshing = true
        error = nil
        defer {
            isRefreshing = false
            let elapsedMs = Int((CFAbsoluteTimeGetCurrent() - refreshStart) * 1000)
            timingLog.notice("[TIMING] mealPlan refresh elapsed=\(elapsedMs)ms")
        }

        do {
            guard let latestSession = try await apiClient.getLatestMealPlanSession() else {
                error = "No meal plan found"
                return
            }
            publishSession(latestSession)
            scheduleShoppingListUpdate()
        } catch {
            self.error = "Failed to refresh meal plan"
            #if DEBUG
            print("[MealPlanViewModel] Refresh error: \(error)")
            #endif
        }
    }

    // MARK: - Shopping List

    private func scheduleShoppingListUpdate() {
        shoppingListTask?.cancel()
        shoppingListTask = Task { [weak self] in
            guard let self else { return }
            await self.updateShoppingList()
        }
    }

    public func prepareShoppingList() async {
        if shoppingListTask == nil {
            scheduleShoppingListUpdate()
        }
        await shoppingListTask?.value
    }

    private func updateShoppingList() async {
        let totalEntries = currentPlan.count
        let nilSlots = currentPlan.filter { $0.mealId == nil }
        let mealIds = currentPlan.compactMap { $0.mealId }

        shoppingLog.info("[updateShoppingList] plan has \(totalEntries) entries, \(mealIds.count) with mealId, \(nilSlots.count) nil slots")
        if !nilSlots.isEmpty {
            let nilDesc = nilSlots.map { "\($0.slotKey)(\($0.mealName ?? "nil"))" }.joined(separator: ", ")
            shoppingLog.info("[updateShoppingList] nil slots: \(nilDesc, privacy: .public)")
        }

        await recipeCache.loadIfNeeded()
        guard !Task.isCancelled else { return }

        // Check which meals have recipes and which don't
        var missingRecipeMeals: [String] = []
        for entry in currentPlan where entry.mealId != nil {
            let hasRecipe = recipeCache.recipe(forMealId: entry.mealId!) != nil
            let symbol = hasRecipe ? "+" : "MISSING"
            shoppingLog.info("[meal→recipe] \(symbol, privacy: .public) \(entry.slotKey, privacy: .public): \(entry.mealName ?? "?", privacy: .public) (id=\(entry.mealId!, privacy: .public))")
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
        await prepareShoppingList()

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
