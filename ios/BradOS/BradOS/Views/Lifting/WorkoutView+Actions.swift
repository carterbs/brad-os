import SwiftUI
import BradOSCore

// MARK: - Data Loading & Workout Actions

extension WorkoutView {

    func loadWorkout() async {
        isLoading = true
        error = nil

        do {
            workout = try await apiClient.getWorkout(id: workoutId)

            // Handle state based on workout status
            if let workout = workout {
                if workout.status == .inProgress {
                    // Restore local state if available and matches this workout
                    if let state = stateManager.loadState(), state.workoutId == workoutId {
                        restoreLocalState(from: state)
                        // Sync with server - remove edits for already-completed sets
                        syncStateWithServer()
                    } else {
                        // No local state but workout is in progress - initialize fresh
                        stateManager.initializeForWorkout(workoutId: workoutId)
                    }

                    // Resync Watch with in-progress workout context
                    if watchWorkoutController.canSendToWatch {
                        if !watchWorkoutController.isWorkoutActive {
                            try? await watchWorkoutController.startMirroredWorkout()
                        }
                        watchWorkoutController.sendWorkoutContext(from: workout)
                    }
                } else if workout.status == .completed || workout.status == .skipped {
                    // Workout is finished - clear any stale local state
                    if stateManager.hasStateForWorkout(workoutId: workoutId) {
                        stateManager.clearState()
                        restTimer.dismiss()
                    }
                }
            }
        } catch {
            self.error = error
            #if DEBUG
            print("[WorkoutView] Failed to load workout: \(error)")
            #endif
        }

        isLoading = false
    }

    func restoreLocalState(from state: StoredWorkoutState) {
        // Restore pending edits
        for (setId, edit) in state.pendingEdits {
            localSetEdits[setId] = SetEditState(
                weight: edit.weight ?? 0,
                reps: Double(edit.reps ?? 0)
            )
        }

        // Restore timer if still valid
        if let timerState = state.activeTimer {
            let elapsed = Int(Date().timeIntervalSince(timerState.startedAt))
            // Only restore if within 5 minutes of target
            if elapsed < timerState.targetSeconds + 300 {
                restTimer.restore(
                    startedAt: timerState.startedAt,
                    targetSeconds: timerState.targetSeconds
                )
            }
        }
    }

    /// Sync local state with server - server is source of truth for completed sets
    func syncStateWithServer() {
        guard let workout = workout,
              let exercises = workout.exercises else { return }

        // Server is source of truth for completed sets
        // Remove local edits for sets that are already completed/skipped on server
        for exercise in exercises {
            for set in exercise.sets where set.status == .completed || set.status == .skipped {
                localSetEdits.removeValue(forKey: set.id)
                stateManager.removePendingEdit(setId: set.id)
            }
        }
    }

    // MARK: - Workout Actions

    func startWorkout() async {
        isStarting = true

        do {
            // Start the workout - this returns minimal workout data without exercises
            _ = try await apiClient.startWorkout(id: workoutId)
            stateManager.initializeForWorkout(workoutId: workoutId)
            // Reload the full workout to get exercises
            await loadWorkout()

            // Start Watch workout and send context
            if watchWorkoutController.canSendToWatch {
                try? await watchWorkoutController.startMirroredWorkout()
                if let workout = workout {
                    watchWorkoutController.sendWorkoutContext(from: workout)
                }
            }
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to start workout: \(error)")
            #endif
        }

        isStarting = false
    }

    func completeWorkout() async {
        isCompleting = true

        do {
            // Preserve planDayName since the complete API doesn't return it
            let existingPlanDayName = workout?.planDayName
            var completedWorkout = try await apiClient.completeWorkout(id: workoutId)
            completedWorkout.planDayName = existingPlanDayName
            workout = completedWorkout

            // End Watch workout
            if watchWorkoutController.isWorkoutActive {
                try? await watchWorkoutController.endWorkout()
            }

            stateManager.clearState()
            dismissRestTimer()
            showingStretchPrompt = true
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to complete workout: \(error)")
            #endif
        }

        isCompleting = false
    }

    func skipWorkout() async {
        isSkipping = true

        do {
            // Preserve planDayName since the skip API doesn't return it
            let existingPlanDayName = workout?.planDayName
            var skippedWorkout = try await apiClient.skipWorkout(id: workoutId)
            skippedWorkout.planDayName = existingPlanDayName
            workout = skippedWorkout

            // Cancel Watch workout
            watchWorkoutController.cancelWorkout()

            stateManager.clearState()
            dismissRestTimer()
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to skip workout: \(error)")
            #endif
        }

        isSkipping = false
    }

    // MARK: - Set Actions

    func logSet(_ set: WorkoutSet, exercise: WorkoutExercise) async {
        let editState = localSetEdits[set.id]
        let weight = editState?.weight ?? set.targetWeight
        let reps = Int(editState?.reps ?? Double(set.targetReps))

        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .completed, actualWeight: weight, actualReps: reps)

        // Persist to state manager
        stateManager.updateSet(setId: set.id, reps: reps, weight: weight, status: .completed)

        // Start rest timer
        startRestTimer(targetSeconds: exercise.restSeconds, exerciseId: set.exerciseId, setNumber: set.setNumber)

        do {
            _ = try await apiClient.logSet(id: set.id, actualReps: reps, actualWeight: weight)
            // Remove from local edits after successful log
            localSetEdits.removeValue(forKey: set.id)
            stateManager.removePendingEdit(setId: set.id)

            // Send update to Watch
            watchWorkoutController.sendExerciseUpdate(WatchExerciseUpdate())
        } catch {
            // Rollback on failure
            updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)
            #if DEBUG
            print("[WorkoutView] Failed to log set: \(error)")
            #endif
        }
    }

    func unlogSet(_ set: WorkoutSet) async {
        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)

        do {
            _ = try await apiClient.unlogSet(id: set.id)
        } catch {
            // Rollback
            updateSetInWorkout(
                setId: set.id,
                status: .completed,
                actualWeight: set.actualWeight,
                actualReps: set.actualReps
            )
            #if DEBUG
            print("[WorkoutView] Failed to unlog set: \(error)")
            #endif
        }
    }

    func skipSet(_ set: WorkoutSet) async {
        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .skipped, actualWeight: nil, actualReps: nil)

        do {
            _ = try await apiClient.skipSet(id: set.id)
        } catch {
            // Rollback
            updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)
            #if DEBUG
            print("[WorkoutView] Failed to skip set: \(error)")
            #endif
        }
    }

    func addSet(exerciseId: String) async {
        do {
            let result = try await apiClient.addSet(workoutId: workoutId, exerciseId: exerciseId)
            if let newSet = result.currentWorkoutSet {
                appendSetToExercise(exerciseId: exerciseId, set: newSet)
            }
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to add set: \(error)")
            #endif
        }
    }

    func removeSet(exerciseId: String) async {
        do {
            _ = try await apiClient.removeSet(workoutId: workoutId, exerciseId: exerciseId)
            removeLastPendingSetFromExercise(exerciseId: exerciseId)
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to remove set: \(error)")
            #endif
        }
    }
}
