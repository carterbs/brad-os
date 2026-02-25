import Foundation

/// ViewModel for Calendar and History views
/// Manages calendar data fetching, month navigation, and loading/error states
@MainActor
public class CalendarViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var currentMonth: Date = Date()
    @Published public var activitiesByDate: [String: [CalendarActivity]] = [:]
    @Published public private(set) var calendarState: LoadState<CalendarData> = .idle
    @Published public var selectedFilter: String?

    // MARK: - Computed (backwards-compatible)

    public var isLoading: Bool { calendarState.isLoading }
    public var error: String? { calendarState.error?.displayMessage }
    public var calendarData: CalendarData? { calendarState.data }

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Computed Properties

    public var year: Int {
        Calendar.current.component(.year, from: currentMonth)
    }

    public var month: Int {
        Calendar.current.component(.month, from: currentMonth)
    }

    public var timezoneOffset: Int {
        TimeZone.current.secondsFromGMT() / 60
    }

    // MARK: - Initialization

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load calendar data for the current month
    public func loadCalendarData() async {
        calendarState = .loading

        do {
            let response = try await apiClient.getCalendarData(
                year: year,
                month: month,
                timezoneOffset: timezoneOffset
            )

            calendarState = .loaded(response)

            // Transform CalendarDayData to activities array per date
            activitiesByDate = response.days.mapValues { dayData in
                dayData.activities
            }
        } catch {
            calendarState = .error(error)
        }
    }

    /// Fetch calendar data for the current month (alias for loadCalendarData)
    public func fetchMonth() async {
        await loadCalendarData()
    }

    // MARK: - Navigation

    /// Navigate to previous month and fetch data
    public func previousMonth() {
        navigateToPreviousMonth()
        Task { await fetchMonth() }
    }

    /// Navigate to next month and fetch data
    public func nextMonth() {
        navigateToNextMonth()
        Task { await fetchMonth() }
    }

    /// Navigate to next month without fetching
    public func navigateToNextMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: 1, to: currentMonth) {
            currentMonth = newMonth
        }
    }

    /// Navigate to previous month without fetching
    public func navigateToPreviousMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: -1, to: currentMonth) {
            currentMonth = newMonth
        }
    }

    // MARK: - Data Access

    /// Get activities for a specific date
    public func activitiesForDate(_ date: Date) -> [CalendarActivity] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let key = formatter.string(from: date)
        return activitiesByDate[key] ?? []
    }

    /// Get activities for a specific date, optionally filtered by type
    public func activitiesForDate(_ date: Date, filter: ActivityType?) -> [CalendarActivity] {
        let activities = activitiesForDate(date)
        if let filter = filter {
            return activities.filter { $0.type == filter }
        }
        return activities
    }

    /// Check if an activity type should be shown based on current filter
    public func shouldShowActivity(type: String) -> Bool {
        guard let filter = selectedFilter else { return true }
        return type == filter
    }

    /// Compare two calendar activities for deterministic sorting.
    /// Primary: (completedAt ?? date) descending (most recent first).
    /// Tie-breaker: id ascending to guarantee deterministic order when sort keys match.
    private func compareRecentActivities(_ lhs: CalendarActivity, _ rhs: CalendarActivity) -> Bool {
        let lhsTime = lhs.completedAt ?? lhs.date
        let rhsTime = rhs.completedAt ?? rhs.date
        if lhsTime != rhsTime {
            return lhsTime > rhsTime // Descending
        }
        // Tie-breaker: sort by id ascending
        return lhs.id < rhs.id
    }

    /// Get recent activities sorted by completion time (most recent first)
    /// - Parameter limit: Maximum number of activities to return
    /// - Returns: Array of recent activities sorted by completedAt descending, deterministic for ties
    public func recentActivities(limit: Int = 3) -> [CalendarActivity] {
        activitiesByDate.values
            .flatMap { $0 }
            .sorted(by: compareRecentActivities)
            .prefix(limit)
            .map { $0 }
    }
}

// MARK: - Preview Support

public extension CalendarViewModel {
    /// Create a view model with mock data for previews
    static var preview: CalendarViewModel {
        let viewModel = CalendarViewModel(apiClient: MockAPIClient())
        // Pre-populate with mock activities
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        for activity in CalendarActivity.mockActivities {
            let key = formatter.string(from: activity.date)
            viewModel.activitiesByDate[key, default: []].append(activity)
        }

        return viewModel
    }

    /// Create a view model simulating loading state
    static var loading: CalendarViewModel {
        let viewModel = CalendarViewModel(apiClient: MockAPIClient.withDelay(2.0))
        viewModel.calendarState = .loading
        return viewModel
    }

    /// Create a view model simulating error state
    static var errorState: CalendarViewModel {
        let viewModel = CalendarViewModel(apiClient: MockAPIClient.failing())
        viewModel.calendarState = .error(APIError.network(NSError(domain: "", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Failed to load calendar data"
        ])))
        return viewModel
    }

    /// Create a view model with no data
    static var empty: CalendarViewModel {
        CalendarViewModel(apiClient: MockAPIClient.empty)
    }
}
