import Foundation
import SwiftUI
import BradOSCore

/// ViewModel for the Exercise History view
@MainActor
class ExerciseHistoryViewModel: ObservableObject {
    // MARK: - Published State

    @Published private(set) var historyState: LoadState<ExerciseHistory> = .idle
    @Published private(set) var exerciseState: LoadState<Exercise> = .idle
    @Published private(set) var isUpdating = false
    @Published var updateError: String?

    // MARK: - Edit Form State

    @Published var editName = ""
    @Published var editWeightIncrement = ""
    @Published var editValidationError: String?

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol
    let exerciseId: String

    init(exerciseId: String, apiClient: APIClientProtocol = APIClient.shared) {
        self.exerciseId = exerciseId
        self.apiClient = apiClient
    }

    // MARK: - Computed

    var history: ExerciseHistory? { historyState.data }
    var exercise: Exercise? { exerciseState.data }
    var isLoading: Bool { historyState.isLoading }
    var hasHistory: Bool { !(history?.entries.isEmpty ?? true) }

    /// Chart data sorted chronologically
    var chartData: [(date: Date, weight: Double, reps: Int)] {
        guard let entries = history?.entries else { return [] }
        return entries.map { entry in
            (date: entry.date, weight: entry.bestWeight, reps: entry.bestSetReps)
        }.sorted { $0.date < $1.date }
    }

    /// Entries sorted in reverse chronological order (most recent first)
    var sortedEntries: [ExerciseHistoryEntry] {
        guard let entries = history?.entries else { return [] }
        return entries.sorted { $0.date > $1.date }
    }

    // MARK: - Actions

    func loadHistory() async {
        historyState = .loading
        do {
            let history = try await apiClient.getExerciseHistory(id: exerciseId)
            historyState = .loaded(history)
        } catch {
            historyState = .error(error)
        }
    }

    func loadExerciseForEdit() async {
        exerciseState = .loading
        do {
            let exercise = try await apiClient.getExercise(id: exerciseId)
            exerciseState = .loaded(exercise)
            editName = exercise.name
            editWeightIncrement = formatWeightIncrement(exercise.weightIncrement)
        } catch {
            exerciseState = .error(error)
            // Fallback to history exercise if available
            if let historyExercise = history?.exercise {
                editName = historyExercise.name
                editWeightIncrement = formatWeightIncrement(historyExercise.weightIncrement)
            }
        }
    }

    func updateExercise() async -> Bool {
        guard validateEditForm() else { return false }

        isUpdating = true
        updateError = nil

        do {
            _ = try await apiClient.updateExercise(
                id: exerciseId,
                name: editName.trimmingCharacters(in: .whitespaces),
                weightIncrement: Double(editWeightIncrement)
            )

            // Reload history to get updated exercise info
            await loadHistory()

            isUpdating = false
            return true
        } catch {
            updateError = error.displayMessage
            isUpdating = false
            return false
        }
    }

    // MARK: - Validation

    func validateEditForm() -> Bool {
        editValidationError = nil

        let trimmedName = editName.trimmingCharacters(in: .whitespaces)

        if trimmedName.isEmpty {
            editValidationError = "Exercise name is required"
            return false
        }

        if trimmedName.count > 100 {
            editValidationError = "Exercise name must be 100 characters or less"
            return false
        }

        if let increment = Double(editWeightIncrement), increment <= 0 {
            editValidationError = "Weight increment must be a positive number"
            return false
        }

        return true
    }

    func clearUpdateError() {
        updateError = nil
        editValidationError = nil
    }

    // MARK: - Helpers

    private func formatWeightIncrement(_ value: Double) -> String {
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return String(format: "%.0f", value)
        }
        return String(format: "%.1f", value)
    }
}

// MARK: - Preview Support

extension ExerciseHistoryViewModel {
    /// Create a view model with mock data for previews
    static func preview(exerciseId: String = "1") -> ExerciseHistoryViewModel {
        let viewModel = ExerciseHistoryViewModel(exerciseId: exerciseId, apiClient: MockAPIClient())
        viewModel.historyState = .loaded(ExerciseHistory.mockHistory)
        return viewModel
    }

    /// Create a view model simulating loading state
    static func loading(exerciseId: String = "1") -> ExerciseHistoryViewModel {
        let viewModel = ExerciseHistoryViewModel(exerciseId: exerciseId, apiClient: MockAPIClient.withDelay(2.0))
        viewModel.historyState = .loading
        return viewModel
    }

    /// Create a view model simulating error state
    static func error(exerciseId: String = "1") -> ExerciseHistoryViewModel {
        let viewModel = ExerciseHistoryViewModel(exerciseId: exerciseId, apiClient: MockAPIClient.failing())
        viewModel.historyState = .error(APIError.notFound("Exercise not found"))
        return viewModel
    }

    /// Create a view model with no history entries
    static func empty(exerciseId: String = "1") -> ExerciseHistoryViewModel {
        let viewModel = ExerciseHistoryViewModel(exerciseId: exerciseId, apiClient: MockAPIClient.empty)
        viewModel.historyState = .loaded(ExerciseHistory(
            exerciseId: "1",
            exerciseName: "Bench Press",
            entries: [],
            personalRecord: nil
        ))
        return viewModel
    }
}
