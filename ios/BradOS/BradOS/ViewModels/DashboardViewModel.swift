import Foundation

/// ViewModel for the Today Dashboard
/// Demonstrates the API client usage pattern for other features to follow
@MainActor
class DashboardViewModel: ObservableObject {
    // MARK: - Published State

    @Published var workout: Workout?
    @Published var latestStretchSession: StretchSession?
    @Published var latestMeditationSession: MeditationSession?
    @Published var isLoading = false
    @Published var error: APIError?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all dashboard data
    func loadDashboard() async {
        isLoading = true
        error = nil

        // Load all data concurrently
        async let workoutTask = loadTodaysWorkout()
        async let stretchTask = loadLatestStretch()
        async let meditationTask = loadLatestMeditation()

        // Await all tasks - errors are handled individually
        await workoutTask
        await stretchTask
        await meditationTask

        isLoading = false
    }

    /// Refresh just the workout data
    func refreshWorkout() async {
        await loadTodaysWorkout()
    }

    // MARK: - Private Loading Methods

    private func loadTodaysWorkout() async {
        do {
            workout = try await apiClient.getTodaysWorkout()
        } catch let apiError as APIError {
            // Only set error for non-network issues on optional endpoints
            if apiError.code != .networkError {
                #if DEBUG
                print("[DashboardViewModel] Error loading today's workout: \(apiError.message)")
                #endif
            }
            error = apiError
        } catch {
            self.error = APIError.network(error)
        }
    }

    private func loadLatestStretch() async {
        do {
            latestStretchSession = try await apiClient.getLatestStretchSession()
        } catch {
            // Silently fail for non-critical data
            #if DEBUG
            print("[DashboardViewModel] Error loading latest stretch: \(error)")
            #endif
        }
    }

    private func loadLatestMeditation() async {
        do {
            latestMeditationSession = try await apiClient.getLatestMeditationSession()
        } catch {
            // Silently fail for non-critical data
            #if DEBUG
            print("[DashboardViewModel] Error loading latest meditation: \(error)")
            #endif
        }
    }

    // MARK: - Workout Actions

    /// Start today's workout
    func startWorkout() async throws {
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
    func skipWorkout() async throws {
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

    var hasWorkoutScheduled: Bool {
        workout != nil
    }

    var canStartWorkout: Bool {
        workout?.status == .pending
    }

    var canContinueWorkout: Bool {
        workout?.status == .inProgress
    }

    var formattedLastStretchDate: String? {
        guard let date = latestStretchSession?.completedAt else { return nil }
        return formatRelativeDate(date)
    }

    var formattedLastMeditationDate: String? {
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

extension DashboardViewModel {
    /// Create a view model with mock data for previews
    static var preview: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient())
        viewModel.workout = Workout.mockTodayWorkout
        viewModel.latestStretchSession = StretchSession.mockRecentSession
        viewModel.latestMeditationSession = MeditationSession.mockRecentSession
        return viewModel
    }

    /// Create a view model simulating loading state
    static var loading: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient.withDelay(2.0))
        viewModel.isLoading = true
        return viewModel
    }

    /// Create a view model simulating error state
    static var error: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient.failing())
        viewModel.error = APIError.network(NSError(domain: "", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Unable to connect to server"
        ]))
        return viewModel
    }

    /// Create a view model with no data (rest day)
    static var empty: DashboardViewModel {
        let viewModel = DashboardViewModel(apiClient: MockAPIClient.empty)
        return viewModel
    }
}
