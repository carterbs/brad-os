import Foundation

/// Protocol for API client operations
/// Enables dependency injection for testing and previews
protocol APIClientProtocol {
    // MARK: - Workouts

    /// Get today's scheduled workout (nil if none scheduled)
    func getTodaysWorkout() async throws -> Workout?

    /// Get a specific workout by ID
    func getWorkout(id: Int) async throws -> Workout

    /// Start a workout (sets status to in_progress)
    func startWorkout(id: Int) async throws -> Workout

    /// Complete a workout
    func completeWorkout(id: Int) async throws -> Workout

    /// Skip a workout
    func skipWorkout(id: Int) async throws -> Workout

    // MARK: - Workout Sets

    /// Log a completed set with actual reps and weight
    func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet

    /// Skip a set
    func skipSet(id: Int) async throws -> WorkoutSet

    /// Unlog a previously logged set (reset to pending)
    func unlogSet(id: Int) async throws -> WorkoutSet

    // MARK: - Exercises

    /// Get all exercises
    func getExercises() async throws -> [Exercise]

    /// Get a specific exercise by ID
    func getExercise(id: Int) async throws -> Exercise

    /// Create a new exercise
    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise

    /// Update an existing exercise
    func updateExercise(id: Int, name: String?, weightIncrement: Double?) async throws -> Exercise

    /// Delete an exercise
    func deleteExercise(id: Int) async throws

    /// Get exercise history
    func getExerciseHistory(id: Int) async throws -> ExerciseHistory

    // MARK: - Plans

    /// Get all plans
    func getPlans() async throws -> [Plan]

    /// Get a specific plan by ID
    func getPlan(id: Int) async throws -> Plan

    /// Create a new plan
    func createPlan(name: String, durationWeeks: Int) async throws -> Plan

    /// Update an existing plan
    func updatePlan(id: Int, name: String?, durationWeeks: Int?) async throws -> Plan

    /// Delete a plan
    func deletePlan(id: Int) async throws

    // MARK: - Mesocycles

    /// Get all mesocycles
    func getMesocycles() async throws -> [Mesocycle]

    /// Get the currently active mesocycle (nil if none)
    func getActiveMesocycle() async throws -> Mesocycle?

    /// Get a specific mesocycle by ID
    func getMesocycle(id: Int) async throws -> Mesocycle

    /// Create a new mesocycle from a plan
    func createMesocycle(planId: Int, startDate: Date) async throws -> Mesocycle

    /// Start a pending mesocycle
    func startMesocycle(id: Int) async throws -> Mesocycle

    /// Complete an active mesocycle
    func completeMesocycle(id: Int) async throws -> Mesocycle

    /// Cancel a mesocycle
    func cancelMesocycle(id: Int) async throws -> Mesocycle

    // MARK: - Stretch Sessions

    /// Get all stretch sessions
    func getStretchSessions() async throws -> [StretchSession]

    /// Get the most recent stretch session (nil if none)
    func getLatestStretchSession() async throws -> StretchSession?

    /// Create a new stretch session
    func createStretchSession(_ session: StretchSession) async throws -> StretchSession

    // MARK: - Meditation Sessions

    /// Get all meditation sessions
    func getMeditationSessions() async throws -> [MeditationSession]

    /// Get the most recent meditation session (nil if none)
    func getLatestMeditationSession() async throws -> MeditationSession?

    /// Create a new meditation session
    func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession

    /// Get meditation statistics
    func getMeditationStats() async throws -> MeditationStats

    // MARK: - Calendar

    /// Get calendar data for a specific month
    func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData
}
