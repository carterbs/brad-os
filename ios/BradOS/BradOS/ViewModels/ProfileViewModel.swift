import Foundation

/// ViewModel for the Profile view
/// Manages activity statistics fetched from the API
@MainActor
class ProfileViewModel: ObservableObject {
    // MARK: - Published State

    // Statistics
    @Published var mesocyclesCompleted: Int = 0
    @Published var totalMesocycles: Int = 0
    @Published var meditationSessions: Int = 0
    @Published var meditationMinutes: Int = 0

    // Loading/Error state
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all profile statistics
    func loadStats() async {
        isLoading = true
        error = nil

        // Load all data concurrently
        async let mesocyclesTask = loadMesocycleStats()
        async let meditationTask = loadMeditationStats()

        // Await all tasks
        await mesocyclesTask
        await meditationTask

        isLoading = false
    }

    // MARK: - Private Loading Methods

    private func loadMesocycleStats() async {
        do {
            let mesocycles = try await apiClient.getMesocycles()

            // Calculate stats
            totalMesocycles = mesocycles.count
            mesocyclesCompleted = mesocycles.filter { $0.status == .completed }.count
        } catch {
            #if DEBUG
            print("[ProfileViewModel] Error loading mesocycle stats: \(error)")
            #endif
            self.error = "Failed to load mesocycle data"
        }
    }

    private func loadMeditationStats() async {
        do {
            let stats = try await apiClient.getMeditationStats()

            meditationSessions = stats.totalSessions
            meditationMinutes = stats.totalMinutes
        } catch {
            #if DEBUG
            print("[ProfileViewModel] Error loading meditation stats: \(error)")
            #endif
            // Don't overwrite error if mesocycles already set one
            if self.error == nil {
                self.error = "Failed to load meditation data"
            }
        }
    }
}

// MARK: - Preview Support

extension ProfileViewModel {
    /// Create a view model with mock data for previews
    static var preview: ProfileViewModel {
        let viewModel = ProfileViewModel(apiClient: MockAPIClient())
        viewModel.mesocyclesCompleted = 3
        viewModel.totalMesocycles = 4
        viewModel.meditationSessions = 47
        viewModel.meditationMinutes = 520
        return viewModel
    }

    /// Create a view model simulating loading state
    static var loading: ProfileViewModel {
        let viewModel = ProfileViewModel(apiClient: MockAPIClient.withDelay(2.0))
        viewModel.isLoading = true
        return viewModel
    }

    /// Create a view model simulating error state
    static var errorState: ProfileViewModel {
        let viewModel = ProfileViewModel(apiClient: MockAPIClient.failing())
        viewModel.error = "Unable to connect to server"
        return viewModel
    }

    /// Create a view model with no data
    static var empty: ProfileViewModel {
        let viewModel = ProfileViewModel(apiClient: MockAPIClient.empty)
        viewModel.mesocyclesCompleted = 0
        viewModel.totalMesocycles = 0
        viewModel.meditationSessions = 0
        viewModel.meditationMinutes = 0
        return viewModel
    }
}
