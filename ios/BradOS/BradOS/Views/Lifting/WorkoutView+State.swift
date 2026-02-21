import SwiftUI
import BradOSCore

// MARK: - Local State Helpers & Rest Timer

extension WorkoutView {

    func localSetEditsForExercise(_ exerciseId: String) -> [String: SetEditState] {
        guard let exercises = workout?.exercises,
              let exercise = exercises.first(where: { $0.exerciseId == exerciseId }) else {
            return [:]
        }
        let setIds = Set(exercise.sets.map { $0.id })
        return localSetEdits.filter { setIds.contains($0.key) }
    }

    func updateLocalEdit(setId: String, weight: Double, reps: Int) {
        localSetEdits[setId] = SetEditState(weight: weight, reps: Double(reps))
        stateManager.updatePendingEdit(setId: setId, weight: weight, reps: reps)
    }

    func cascadeValue(
        setId: String,
        weight: Double,
        reps: Int,
        editedField: EditedField,
        in exercise: WorkoutExercise
    ) {
        guard let setIndex = exercise.sets.firstIndex(where: { $0.id == setId }) else { return }
        let currentSet = exercise.sets[setIndex]

        // Update subsequent pending sets with the edited value
        for subsequentSet in exercise.sets where subsequentSet.setNumber > currentSet.setNumber {
            if subsequentSet.status == .pending {
                let existingEdit = localSetEdits[subsequentSet.id]

                // Cascade only the field that was edited, preserve the other
                let newWeight: Double
                let newReps: Double

                switch editedField {
                case .weight:
                    newWeight = weight
                    newReps = existingEdit?.reps ?? Double(subsequentSet.targetReps)
                case .reps:
                    newWeight = existingEdit?.weight ?? subsequentSet.targetWeight
                    newReps = Double(reps)
                }

                localSetEdits[subsequentSet.id] = SetEditState(
                    weight: newWeight,
                    reps: newReps
                )
                stateManager.updatePendingEdit(
                    setId: subsequentSet.id,
                    weight: newWeight,
                    reps: Int(newReps)
                )
            }
        }
    }

    func updateSetInWorkout(setId: String, status: SetStatus, actualWeight: Double?, actualReps: Int?) {
        guard var workout = workout,
              var exercises = workout.exercises else { return }

        for exerciseIndex in exercises.indices {
            if let setIndex = exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setId }) {
                exercises[exerciseIndex].sets[setIndex].status = status
                exercises[exerciseIndex].sets[setIndex].actualWeight = actualWeight
                exercises[exerciseIndex].sets[setIndex].actualReps = actualReps

                // Update completed count
                exercises[exerciseIndex].completedSets = exercises[exerciseIndex].sets
                    .filter { $0.status == .completed }.count
                break
            }
        }

        workout.exercises = exercises
        self.workout = workout
    }

    func appendSetToExercise(exerciseId: String, set: WorkoutSet) {
        guard var workout = workout,
              var exercises = workout.exercises,
              let exerciseIndex = exercises.firstIndex(where: { $0.exerciseId == exerciseId }) else { return }

        exercises[exerciseIndex].sets.append(set)
        exercises[exerciseIndex].totalSets += 1
        workout.exercises = exercises
        self.workout = workout
    }

    func removeLastPendingSetFromExercise(exerciseId: String) {
        guard var workout = workout,
              var exercises = workout.exercises,
              let exerciseIndex = exercises.firstIndex(where: { $0.exerciseId == exerciseId }) else { return }

        // Find last pending set
        if let lastPendingIndex = exercises[exerciseIndex].sets.lastIndex(where: { $0.status == .pending }) {
            let removedSetId = exercises[exerciseIndex].sets[lastPendingIndex].id
            exercises[exerciseIndex].sets.remove(at: lastPendingIndex)
            exercises[exerciseIndex].totalSets -= 1
            localSetEdits.removeValue(forKey: removedSetId)
        }

        workout.exercises = exercises
        self.workout = workout
    }

    // MARK: - Rest Timer

    func startRestTimer(targetSeconds: Int, exerciseId: String, setNumber: Int) {
        restTimer.start(
            targetSeconds: targetSeconds
        )

        // Persist timer state
        let timerState = StoredTimerState(
            startedAt: Date(),
            targetSeconds: targetSeconds,
            exerciseId: exerciseId,
            setNumber: setNumber
        )
        stateManager.saveTimerState(timerState)

        // Notify Watch
        let exerciseName = workout?.exercises?.first(where: { $0.exerciseId == exerciseId })?.exerciseName
        watchWorkoutController.sendRestTimerEvent(
            action: "start", targetSeconds: targetSeconds, exerciseName: exerciseName
        )
    }

    func dismissRestTimer() {
        restTimer.dismiss()
        stateManager.clearTimerState()
        watchWorkoutController.sendRestTimerEvent(action: "dismiss")
        showingTimerOverlay = false
    }
}
