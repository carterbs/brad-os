import Testing
@testable import BradOS
import BradOSCore
import Foundation

@Suite("ExerciseHistoryViewModel")
struct ExerciseHistoryViewModelTests {

    @Test("loadHistory success sets loaded state and sortedEntries newest-first")
    @MainActor
    func loadHistorySuccessSetsStateAndSortedEntries() async {
        let mock = MockAPIClient()
        let olderEntry = makeExerciseHistoryEntry(
            workoutId: "entry-1",
            date: fixedDate(2026, 2, 20),
            weekNumber: 1,
            bestWeight: 135,
            bestSetReps: 8
        )
        let newerEntry = makeExerciseHistoryEntry(
            workoutId: "entry-2",
            date: fixedDate(2026, 2, 24),
            weekNumber: 2,
            bestWeight: 140,
            bestSetReps: 6
        )
        mock.mockExerciseHistory = makeExerciseHistory(entries: [olderEntry, newerEntry])
        let vm = ExerciseHistoryViewModel(exerciseId: "exercise-1", apiClient: mock)

        await vm.loadHistory()

        #expect(vm.historyState.isLoading == false)
        #expect(vm.historyState.data?.exerciseId == "exercise-1")
        #expect(vm.sortedEntries.first?.workoutId == "entry-2")
        #expect(vm.sortedEntries.last?.workoutId == "entry-1")
    }

    @Test("loadHistory failure sets error state")
    @MainActor
    func loadHistoryFailureSetsError() async {
        let mock = MockAPIClient.failing(with: APIError.internalError("History failed"))
        let vm = ExerciseHistoryViewModel(exerciseId: "exercise-1", apiClient: mock)

        await vm.loadHistory()

        #expect(vm.historyState.error != nil)
    }

    @Test("validateEditForm rejects empty name and non-positive increment")
    @MainActor
    func validateEditFormRejectsInvalidInputs() {
        let vm = ExerciseHistoryViewModel(exerciseId: "exercise-1", apiClient: MockAPIClient())

        vm.editName = ""
        vm.editWeightIncrement = "5"
        #expect(vm.validateEditForm() == false)
        #expect(vm.editValidationError?.contains("required") == true)

        vm.editName = "Bench"
        vm.editWeightIncrement = "0"
        #expect(vm.validateEditForm() == false)
        #expect(vm.editValidationError?.contains("positive") == true)
    }

    @Test("updateExercise success trims name, clears updateError, and reloads history")
    @MainActor
    func updateExerciseSuccessTrimsNameReloadsHistory() async {
        let mock = MockAPIClient()
        let originalHistory = makeExerciseHistory(
            entries: [
                makeExerciseHistoryEntry(
                    workoutId: "entry-1",
                    date: fixedDate(2026, 2, 20),
                    bestWeight: 135,
                    bestSetReps: 8
                )
            ]
        )
        let updatedHistory = makeExerciseHistory(
            entries: [
                makeExerciseHistoryEntry(
                    workoutId: "entry-2",
                    date: fixedDate(2026, 2, 24),
                    bestWeight: 140,
                    bestSetReps: 7
                )
            ]
        )
        mock.mockExerciseHistory = originalHistory
        let vm = ExerciseHistoryViewModel(exerciseId: "exercise-1", apiClient: mock)
        await vm.loadHistory()
        vm.editName = "  Squat  "
        vm.editWeightIncrement = "2.5"

        mock.mockExerciseHistory = updatedHistory
        let result = await vm.updateExercise()

        #expect(result == true)
        #expect(vm.updateError == nil)
        #expect(vm.historyState.data?.entries == updatedHistory.entries)
    }

    @Test("updateExercise failure sets updateError and resets isUpdating")
    @MainActor
    func updateExerciseFailureResetsUpdatingState() async {
        let mock = MockAPIClient.failing(with: APIError.internalError("Failed update"))
        let vm = ExerciseHistoryViewModel(exerciseId: "exercise-1", apiClient: mock)
        vm.editName = "Squat"
        vm.editWeightIncrement = "2.5"

        let result = await vm.updateExercise()

        #expect(result == false)
        #expect(vm.isUpdating == false)
        #expect(vm.updateError != nil)
    }
}
