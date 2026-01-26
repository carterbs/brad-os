import Foundation

/// ViewModel for Calendar and History views
/// Manages calendar data fetching, month navigation, and loading/error states
@MainActor
class CalendarViewModel: ObservableObject {
    // MARK: - Published State

    @Published var currentMonth: Date = Date()
    @Published var activitiesByDate: [String: [CalendarActivity]] = [:]
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Computed Properties

    var year: Int {
        Calendar.current.component(.year, from: currentMonth)
    }

    var month: Int {
        Calendar.current.component(.month, from: currentMonth)
    }

    // MARK: - Initialization

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Fetch calendar data for the current month
    func fetchMonth() async {
        isLoading = true
        error = nil

        // Calculate timezone offset in minutes
        let timezoneOffset = TimeZone.current.secondsFromGMT() / 60

        do {
            let response = try await apiClient.getCalendarData(
                year: year,
                month: month,
                timezoneOffset: timezoneOffset
            )

            // Transform CalendarDayData to activities array per date
            activitiesByDate = response.days.mapValues { dayData in
                dayData.activities
            }
        } catch {
            self.error = "Failed to load calendar data"
            #if DEBUG
            print("[CalendarViewModel] Error loading calendar data: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Navigation

    /// Navigate to previous month and fetch data
    func previousMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: -1, to: currentMonth) {
            currentMonth = newMonth
            Task { await fetchMonth() }
        }
    }

    /// Navigate to next month and fetch data
    func nextMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: 1, to: currentMonth) {
            currentMonth = newMonth
            Task { await fetchMonth() }
        }
    }

    // MARK: - Data Access

    /// Get activities for a specific date
    func activitiesForDate(_ date: Date) -> [CalendarActivity] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let key = formatter.string(from: date)
        return activitiesByDate[key] ?? []
    }

    /// Get activities for a specific date, optionally filtered by type
    func activitiesForDate(_ date: Date, filter: ActivityType?) -> [CalendarActivity] {
        let activities = activitiesForDate(date)
        if let filter = filter {
            return activities.filter { $0.type == filter }
        }
        return activities
    }

    /// Get recent activities sorted by completion time (most recent first)
    /// - Parameter limit: Maximum number of activities to return
    /// - Returns: Array of recent activities sorted by completedAt descending
    func recentActivities(limit: Int = 3) -> [CalendarActivity] {
        activitiesByDate.values
            .flatMap { $0 }
            .sorted { ($0.completedAt ?? $0.date) > ($1.completedAt ?? $1.date) }
            .prefix(limit)
            .map { $0 }
    }
}

// MARK: - Preview Support

extension CalendarViewModel {
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
        viewModel.isLoading = true
        return viewModel
    }

    /// Create a view model simulating error state
    static var error: CalendarViewModel {
        let viewModel = CalendarViewModel(apiClient: MockAPIClient.failing())
        viewModel.error = "Failed to load calendar data"
        return viewModel
    }

    /// Create a view model with no data
    static var empty: CalendarViewModel {
        CalendarViewModel(apiClient: MockAPIClient.empty)
    }
}
