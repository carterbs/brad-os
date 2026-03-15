import Testing
@testable import BradOSCore

@Suite("DashboardViewModel")
struct DashboardViewModelTests {

    // MARK: - Loading States

    @Test("initial state has no data")
    @MainActor
    func initialStateHasNoData() {
        let vm = DashboardViewModel(apiClient: MockAPIClient.empty)

        #expect(vm.workout == nil)
        #expect(vm.latestStretchSession == nil)
        #expect(vm.latestMeditationSession == nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadDashboard fetches all data")
    @MainActor
    func loadDashboardFetchesAllData() async {
        let mock = MockAPIClient()
        mock.mockWorkout = Workout.mockTodayWorkout
        mock.mockStretchSession = StretchSession.mockRecentSession
        mock.mockMeditationSession = MeditationSession.mockRecentSession

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        #expect(vm.workout != nil)
        #expect(vm.latestStretchSession != nil)
        #expect(vm.latestMeditationSession != nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadDashboard handles API error")
    @MainActor
    func loadDashboardHandlesError() async {
        let mock = MockAPIClient.failing(with: .network(NSError(domain: "", code: -1)))

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        #expect(vm.workoutError != nil)
        #expect(vm.isLoading == false)
    }

    @Test("individual card errors are independent")
    @MainActor
    func individualCardErrorsIndependent() async {
        let mock = MockAPIClient()
        mock.mockWorkout = nil
        mock.mockStretchSession = StretchSession.mockRecentSession
        mock.mockMeditationSession = MeditationSession.mockRecentSession

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        // Workout is nil but not an error
        #expect(vm.workout == nil)
        #expect(vm.latestStretchSession != nil)
        #expect(vm.latestMeditationSession != nil)
    }

    // MARK: - Computed Properties

    @Test("hasWorkoutScheduled is true when workout exists")
    @MainActor
    func hasWorkoutScheduledTrue() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        vm.workout = Workout.mockTodayWorkout

        #expect(vm.hasWorkoutScheduled == true)
    }

    @Test("hasWorkoutScheduled is false when no workout")
    @MainActor
    func hasWorkoutScheduledFalse() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        #expect(vm.hasWorkoutScheduled == false)
    }

    @Test("canStartWorkout is true when status is pending")
    @MainActor
    func canStartWorkoutPending() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .pending
        vm.workout = workout

        #expect(vm.canStartWorkout == true)
    }

    @Test("canStartWorkout is false when status is in_progress")
    @MainActor
    func canStartWorkoutInProgress() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .inProgress
        vm.workout = workout

        #expect(vm.canStartWorkout == false)
    }

    @Test("canContinueWorkout is true when status is in_progress")
    @MainActor
    func canContinueWorkoutInProgress() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .inProgress
        vm.workout = workout

        #expect(vm.canContinueWorkout == true)
    }

    // MARK: - Actions

    @Test("startWorkout throws when no workout")
    @MainActor
    func startWorkoutThrowsWhenNoWorkout() async {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        await #expect(throws: APIError.self) {
            try await vm.startWorkout()
        }
    }

    @Test("startWorkout updates workout status")
    @MainActor
    func startWorkoutUpdatesStatus() async throws {
        let mock = MockAPIClient()
        var workout = Workout.mockTodayWorkout
        workout.status = .pending
        mock.mockWorkout = workout

        let vm = DashboardViewModel(apiClient: mock)
        vm.workout = workout

        try await vm.startWorkout()

        #expect(vm.workout?.status == .inProgress)
    }

    @Test("skipWorkout throws when no workout")
    @MainActor
    func skipWorkoutThrowsWhenNoWorkout() async {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        await #expect(throws: APIError.self) {
            try await vm.skipWorkout()
        }
    }

    @Test("skipWorkout updates workout status")
    @MainActor
    func skipWorkoutUpdatesStatus() async throws {
        let mock = MockAPIClient()
        var workout = Workout.mockTodayWorkout
        workout.status = .pending
        mock.mockWorkout = workout

        let vm = DashboardViewModel(apiClient: mock)
        vm.workout = workout

        try await vm.skipWorkout()

        #expect(vm.workout?.status == .skipped)
    }

    @Test("force meal plan refresh clears saved session id and reloads latest finalized plan")
    @MainActor
    func forceMealPlanRefreshClearsSavedSessionIdAndReloadsLatestPlan() async {
        let staleSession = MealPlanSession(
            id: "stale-session",
            plan: [
                MealPlanEntry(dayIndex: 6, mealType: .breakfast, mealId: "meal-1", mealName: "Old Breakfast")
            ],
            mealsSnapshot: [
                Meal(
                    id: "meal-1",
                    name: "Old Breakfast",
                    mealType: .breakfast,
                    effort: 1,
                    hasRedMeat: false,
                    prepAhead: false,
                    createdAt: Date(timeIntervalSince1970: 1_700_000_000),
                    updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
                )
            ],
            history: [],
            isFinalized: true,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let latestSession = MealPlanSession(
            id: "latest-session",
            plan: [
                MealPlanEntry(dayIndex: 6, mealType: .dinner, mealId: "meal-2", mealName: "New Dinner")
            ],
            mealsSnapshot: [
                Meal(
                    id: "meal-2",
                    name: "New Dinner",
                    mealType: .dinner,
                    effort: 1,
                    hasRedMeat: false,
                    prepAhead: false,
                    createdAt: Date(timeIntervalSince1970: 1_700_000_000),
                    updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
                )
            ],
            history: [],
            isFinalized: true,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )

        let mock = MockAPIClient()
        mock.mockLatestMealPlanSession = latestSession

        let cacheService = RecordingMealPlanCacheService(cachedSession: staleSession)
        let defaults = MockUserDefaults()
        defaults.set("stale-session", forKey: "mealPlanSessionId")

        let vm = DashboardViewModel(
            apiClient: mock,
            cacheService: cacheService,
            userDefaults: defaults
        )

        await vm.refreshMealPlan(forceRefresh: true)

        #expect(cacheService.invalidateCallCount == 1)
        #expect(cacheService.cachedSession == latestSession)
        #expect(defaults.string(forKey: "mealPlanSessionId") == nil)
        #expect(vm.todayMeals.map(\.mealName) == ["New Dinner"])
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
