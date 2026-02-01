import Foundation

/// ViewModel for the Today Dashboard
/// Manages independent loading states for each card and parallel data fetching
@MainActor
public class DashboardViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var workout: Workout?
    @Published public var latestStretchSession: StretchSession?
    @Published public var latestMeditationSession: MeditationSession?
    @Published public var todayMeals: [MealPlanEntry] = []

    // Independent loading states for each card
    @Published public var isLoadingWorkout = false
    @Published public var isLoadingStretch = false
    @Published public var isLoadingMeditation = false
    @Published public var isLoadingMealPlan = false

    // Combined loading state for pull-to-refresh
    @Published public var isLoading = false

    // Individual errors for each card
    @Published public var workoutError: APIError?
    @Published public var stretchError: APIError?
    @Published public var meditationError: APIError?

    // Legacy error property for backwards compatibility
    @Published public var error: APIError?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all dashboard data in parallel
    /// Each card shows its own loading state independently
    public func loadDashboard() async {
        isLoading = true
        error = nil
        workoutError = nil
        stretchError = nil
        meditationError = nil

        // Load all data concurrently - each method manages its own loading state
        async let workoutTask = loadTodaysWorkout()
        async let stretchTask = loadLatestStretch()
        async let meditationTask = loadLatestMeditation()
        async let mealPlanTask = loadMealPlan()

        // Await all tasks - errors are handled individually
        await workoutTask
        await stretchTask
        await meditationTask
        await mealPlanTask

        isLoading = false
    }

    /// Refresh just the workout data
    public func refreshWorkout() async {
        await loadTodaysWorkout()
    }

    /// Refresh just the stretch data
    public func refreshStretch() async {
        await loadLatestStretch()
    }

    /// Refresh just the meditation data
    public func refreshMeditation() async {
        await loadLatestMeditation()
    }

    // MARK: - Private Loading Methods

    private func loadTodaysWorkout() async {
        isLoadingWorkout = true
        defer { isLoadingWorkout = false }

        do {
            workout = try await apiClient.getTodaysWorkout()
            workoutError = nil
        } catch let apiError as APIError {
            workoutError = apiError
            error = apiError
        } catch {
            let apiError = APIError.network(error)
            workoutError = apiError
            self.error = apiError
        }
    }

    private func loadLatestStretch() async {
        isLoadingStretch = true
        defer { isLoadingStretch = false }

        do {
            latestStretchSession = try await apiClient.getLatestStretchSession()
            stretchError = nil
        } catch let apiError as APIError {
            stretchError = apiError
        } catch {
            stretchError = APIError.network(error)
        }
    }

    private func loadLatestMeditation() async {
        isLoadingMeditation = true
        defer { isLoadingMeditation = false }

        do {
            latestMeditationSession = try await apiClient.getLatestMeditationSession()
            meditationError = nil
        } catch let apiError as APIError {
            meditationError = apiError
        } catch {
            meditationError = APIError.network(error)
        }
    }

    private func loadMealPlan() async {
        isLoadingMealPlan = true
        defer { isLoadingMealPlan = false }

        do {
            if let session = try await apiClient.getLatestMealPlanSession(), session.isFinalized {
                let todayDayIndex = Self.calendarWeekdayToDayIndex()
                todayMeals = session.plan.filter { $0.dayIndex == todayDayIndex }
            } else {
                todayMeals = []
            }
        } catch {
            // Meal plan loading is best-effort; don't set an error
            todayMeals = []
            #if DEBUG
            print("[DashboardViewModel] Load meal plan error: \(error)")
            #endif
        }
    }

    /// Convert Calendar weekday (1=Sun..7=Sat) to plan dayIndex (0=Mon..6=Sun)
    static func calendarWeekdayToDayIndex(date: Date = Date()) -> Int {
        let weekday = Calendar.current.component(.weekday, from: date)
        // Calendar: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        // DayIndex: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
        return weekday == 1 ? 6 : weekday - 2
    }

    // MARK: - Workout Actions

    /// Start today's workout
    public func startWorkout() async throws {
        guard let workoutId = workout?.id else {
            throw APIError.validation("No workout to start")
        }

        do {
            workout = try await apiClient.startWorkout(id: workoutId)
        } catch let apiError as APIError {
            error = apiError
            throw apiError
        } catch {
            let apiError = APIError.network(error)
            self.error = apiError
            throw apiError
        }
    }

    /// Skip today's workout
    public func skipWorkout() async throws {
        guard let workoutId = workout?.id else {
            throw APIError.validation("No workout to skip")
        }

        do {
            workout = try await apiClient.skipWorkout(id: workoutId)
        } catch let apiError as APIError {
            error = apiError
            throw apiError
        } catch {
            let apiError = APIError.network(error)
            self.error = apiError
            throw apiError
        }
    }

    // MARK: - Computed Properties

    public var hasWorkoutScheduled: Bool {
        workout != nil
    }

    public var canStartWorkout: Bool {
        workout?.status == .pending
    }

    public var canContinueWorkout: Bool {
        workout?.status == .inProgress
    }

    public var formattedLastStretchDate: String? {
        guard let date = latestStretchSession?.completedAt else { return nil }
        return formatRelativeDate(date)
    }

    public var formattedLastMeditationDate: String? {
        guard let date = latestMeditationSession?.completedAt else { return nil }
        return formatRelativeDate(date)
    }

    // MARK: - Helpers

    private func formatRelativeDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .short
            return formatter.localizedString(for: date, relativeTo: Date())
        }
    }
}

// MARK: - Preview Support

public extension DashboardViewModel {
    /// Create a view model with mock data for previews
    static var preview: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient())
        viewModel.workout = Workout.mockTodayWorkout
        viewModel.latestStretchSession = StretchSession.mockRecentSession
        viewModel.latestMeditationSession = MeditationSession.mockRecentSession
        viewModel.todayMeals = [
            MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "m1", mealName: "Scrambled Eggs"),
            MealPlanEntry(dayIndex: 0, mealType: .lunch, mealId: "m2", mealName: "Chicken Caesar Salad"),
            MealPlanEntry(dayIndex: 0, mealType: .dinner, mealId: "m3", mealName: "Salmon with Rice"),
        ]
        return viewModel
    }

    /// Create a view model simulating loading state for all cards
    static var loading: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient.withDelay(2.0))
        viewModel.isLoading = true
        viewModel.isLoadingWorkout = true
        viewModel.isLoadingStretch = true
        viewModel.isLoadingMeditation = true
        return viewModel
    }

    /// Create a view model simulating error state
    static var error: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient.failing())
        let networkError = APIError.network(NSError(domain: "", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Unable to connect to server"
        ]))
        viewModel.error = networkError
        viewModel.workoutError = networkError
        viewModel.stretchError = networkError
        viewModel.meditationError = networkError
        return viewModel
    }

    /// Create a view model with no data (rest day)
    static var empty: DashboardViewModel {
        DashboardViewModel(apiClient: MockAPIClient.empty)
    }
}
