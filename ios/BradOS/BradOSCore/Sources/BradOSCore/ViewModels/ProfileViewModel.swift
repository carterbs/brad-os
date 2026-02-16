import Foundation

/// ViewModel for the Profile view
/// Manages activity statistics fetched from the API
@MainActor
public class ProfileViewModel: ObservableObject {
    // MARK: - Published State

    // Statistics
    @Published public var mesocyclesCompleted: Int = 0
    @Published public var totalMesocycles: Int = 0
    @Published public var meditationSessions: Int = 0
    @Published public var meditationMinutes: Int = 0

    // Loading/Error state
    @Published public var isLoading = false
    @Published public var error: String?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Initialization

    public init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    // MARK: - Data Loading

    /// Load all profile statistics
    public func loadStats() async {
        isLoading = true
        error = nil

        // Load all data concurrently
        async let loadMesocycles: Void = loadMesocycleStats()
        async let loadMeditation: Void = loadMeditationStats()

        // Await all tasks
        await loadMesocycles
        await loadMeditation

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
            self.error = "Failed to load mesocycle data"
        }
    }

    private func loadMeditationStats() async {
        do {
            let stats = try await apiClient.getMeditationStats()

            meditationSessions = stats.totalSessions
            meditationMinutes = stats.totalMinutes
        } catch {
            // Don't overwrite error if mesocycles already set one
            if self.error == nil {
                self.error = "Failed to load meditation data"
            }
        }
    }
}

// MARK: - Preview Support

public extension ProfileViewModel {
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
