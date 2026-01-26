import Foundation

// MARK: - Stored State Types

/// Persisted workout state for crash recovery
struct StoredWorkoutState: Codable {
    let workoutId: Int
    var sets: [Int: StoredSetState]  // setId -> state
    var pendingEdits: [Int: PendingEdit]  // setId -> uncommitted edits
    var lastUpdated: Date
    var activeTimer: StoredTimerState?
}

/// Persisted state for a logged set
struct StoredSetState: Codable {
    let actualReps: Int
    let actualWeight: Double
    let status: SetStatus
}

/// Uncommitted edits to a set (before logging)
struct PendingEdit: Codable {
    var weight: Double?
    var reps: Int?
}

/// Persisted rest timer state for recovery
struct StoredTimerState: Codable {
    let startedAt: Date
    let targetSeconds: Int
    let exerciseId: Int
    let setNumber: Int
}

// MARK: - Workout State Manager

/// Manages in-progress workout state persistence using UserDefaults
/// Enables crash recovery and state synchronization
final class WorkoutStateManager: ObservableObject {
    // MARK: - Published State

    @Published private(set) var currentState: StoredWorkoutState?

    // MARK: - Constants

    private let storageKey = "brad_os_workout_state"
    private let userDefaults: UserDefaults

    // MARK: - Initialization

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        self.currentState = loadState()
    }

    // MARK: - State Management

    /// Save the entire workout state
    func saveState(_ state: StoredWorkoutState) {
        currentState = state
        persistState(state)
    }

    /// Load the stored workout state (nil if none exists)
    func loadState() -> StoredWorkoutState? {
        guard let data = userDefaults.data(forKey: storageKey) else {
            return nil
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(StoredWorkoutState.self, from: data)
        } catch {
            #if DEBUG
            print("[WorkoutStateManager] Failed to decode state: \(error)")
            #endif
            // Clear corrupted state
            clearState()
            return nil
        }
    }

    /// Clear all stored state
    func clearState() {
        currentState = nil
        userDefaults.removeObject(forKey: storageKey)
    }

    // MARK: - Set State Updates

    /// Update the state for a specific set
    func updateSet(setId: Int, reps: Int, weight: Double, status: SetStatus) {
        guard var state = currentState else { return }

        state.sets[setId] = StoredSetState(
            actualReps: reps,
            actualWeight: weight,
            status: status
        )
        state.lastUpdated = Date()

        saveState(state)
    }

    /// Update pending edits for a set (before logging)
    func updatePendingEdit(setId: Int, weight: Double?, reps: Int?) {
        guard var state = currentState else { return }

        if weight == nil && reps == nil {
            state.pendingEdits.removeValue(forKey: setId)
        } else {
            state.pendingEdits[setId] = PendingEdit(weight: weight, reps: reps)
        }
        state.lastUpdated = Date()

        saveState(state)
    }

    /// Get pending edits for a specific set
    func getPendingEdit(setId: Int) -> PendingEdit? {
        currentState?.pendingEdits[setId]
    }

    /// Remove a pending edit
    func removePendingEdit(setId: Int) {
        guard var state = currentState else { return }
        state.pendingEdits.removeValue(forKey: setId)
        state.lastUpdated = Date()
        saveState(state)
    }

    // MARK: - Timer State

    /// Save active rest timer state
    func saveTimerState(_ timer: StoredTimerState) {
        guard var state = currentState else { return }
        state.activeTimer = timer
        state.lastUpdated = Date()
        saveState(state)
    }

    /// Clear the active timer state
    func clearTimerState() {
        guard var state = currentState else { return }
        state.activeTimer = nil
        state.lastUpdated = Date()
        saveState(state)
    }

    /// Get the active timer state if any
    func getTimerState() -> StoredTimerState? {
        currentState?.activeTimer
    }

    // MARK: - Initialization for New Workout

    /// Initialize state for a new workout
    func initializeForWorkout(workoutId: Int) {
        let state = StoredWorkoutState(
            workoutId: workoutId,
            sets: [:],
            pendingEdits: [:],
            lastUpdated: Date(),
            activeTimer: nil
        )
        saveState(state)
    }

    /// Check if stored state matches a workout ID
    func hasStateForWorkout(workoutId: Int) -> Bool {
        currentState?.workoutId == workoutId
    }

    // MARK: - Private Helpers

    private func persistState(_ state: StoredWorkoutState) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(state)
            userDefaults.set(data, forKey: storageKey)
        } catch {
            #if DEBUG
            print("[WorkoutStateManager] Failed to encode state: \(error)")
            #endif
        }
    }
}

// MARK: - Result Types for API Responses

/// Result from adding or removing sets
struct ModifySetCountResult: Codable {
    let currentWorkoutSet: WorkoutSet?
    let futureWorkoutsAffected: Int
    let futureSetsModified: Int

    enum CodingKeys: String, CodingKey {
        case currentWorkoutSet = "current_workout_set"
        case futureWorkoutsAffected = "future_workouts_affected"
        case futureSetsModified = "future_sets_modified"
    }
}
