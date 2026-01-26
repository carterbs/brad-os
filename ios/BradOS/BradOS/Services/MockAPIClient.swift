import Foundation

/// Mock API client for SwiftUI previews and unit testing
final class MockAPIClient: APIClientProtocol {
    // MARK: - Configuration

    /// Whether the mock should simulate failures
    var shouldFail = false

    /// Custom error to throw when shouldFail is true
    var mockError: APIError?

    /// Simulated network delay in seconds
    var delay: TimeInterval = 0

    // MARK: - Mock Data Storage

    var mockWorkout: Workout?
    var mockStretchSession: StretchSession?
    var mockMeditationSession: MeditationSession?
    var mockExercises: [Exercise] = []
    var mockPlans: [Plan] = []
    var mockMesocycles: [Mesocycle] = []
    var mockActiveMesocycle: Mesocycle?
    var mockMeditationStats: MeditationStats?
    var mockExerciseHistory: ExerciseHistory?
    var mockCalendarData: CalendarData?

    // MARK: - Initialization

    init() {
        // Set up default mock data
        mockWorkout = Workout.mockTodayWorkout
        mockStretchSession = StretchSession.mockRecentSession
        mockMeditationSession = MeditationSession.mockRecentSession
        mockExercises = Exercise.mockExercises
        mockPlans = Plan.mockPlans
        mockMesocycles = [Mesocycle.mockActiveMesocycle] + Mesocycle.mockCompletedMesocycles
        mockActiveMesocycle = Mesocycle.mockActiveMesocycle
        mockMeditationStats = MeditationStats.mockStats
        mockExerciseHistory = ExerciseHistory.mockHistory
    }

    // MARK: - Helper Methods

    private func simulateDelay() async {
        if delay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }
    }

    private func checkForError() throws {
        if shouldFail {
            throw mockError ?? APIError.internalError("Mock error for testing")
        }
    }

    // MARK: - Workouts

    func getTodaysWorkout() async throws -> Workout? {
        await simulateDelay()
        try checkForError()
        return mockWorkout
    }

    func getWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        guard let workout = mockWorkout else {
            throw APIError.notFound("Workout \(id) not found")
        }
        return workout
    }

    func startWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        guard var workout = mockWorkout else {
            throw APIError.notFound("Workout \(id) not found")
        }
        workout.status = .inProgress
        workout.startedAt = Date()
        mockWorkout = workout
        return workout
    }

    func completeWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        guard var workout = mockWorkout else {
            throw APIError.notFound("Workout \(id) not found")
        }
        workout.status = .completed
        workout.completedAt = Date()
        mockWorkout = workout
        return workout
    }

    func skipWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        guard var workout = mockWorkout else {
            throw APIError.notFound("Workout \(id) not found")
        }
        workout.status = .skipped
        mockWorkout = workout
        return workout
    }

    // MARK: - Workout Sets

    func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: 1,
            exerciseId: 1,
            setNumber: 1,
            targetReps: actualReps,
            targetWeight: actualWeight,
            actualReps: actualReps,
            actualWeight: actualWeight,
            status: .completed
        )
    }

    func skipSet(id: Int) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: 1,
            exerciseId: 1,
            setNumber: 1,
            targetReps: 10,
            targetWeight: 100,
            actualReps: nil,
            actualWeight: nil,
            status: .skipped
        )
    }

    func unlogSet(id: Int) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: 1,
            exerciseId: 1,
            setNumber: 1,
            targetReps: 10,
            targetWeight: 100,
            actualReps: nil,
            actualWeight: nil,
            status: .pending
        )
    }

    func addSet(workoutId: Int, exerciseId: Int) async throws -> ModifySetCountResult {
        await simulateDelay()
        try checkForError()
        let newSet = WorkoutSet(
            id: Int.random(in: 1000...9999),
            workoutId: workoutId,
            exerciseId: exerciseId,
            setNumber: 4,
            targetReps: 10,
            targetWeight: 100,
            actualReps: nil,
            actualWeight: nil,
            status: .pending
        )
        return ModifySetCountResult(
            currentWorkoutSet: newSet,
            futureWorkoutsAffected: 5,
            futureSetsModified: 5
        )
    }

    func removeSet(workoutId: Int, exerciseId: Int) async throws -> ModifySetCountResult {
        await simulateDelay()
        try checkForError()
        return ModifySetCountResult(
            currentWorkoutSet: nil,
            futureWorkoutsAffected: 5,
            futureSetsModified: 5
        )
    }

    // MARK: - Exercises

    func getExercises() async throws -> [Exercise] {
        await simulateDelay()
        try checkForError()
        return mockExercises
    }

    func getExercise(id: Int) async throws -> Exercise {
        await simulateDelay()
        try checkForError()
        guard let exercise = mockExercises.first(where: { $0.id == id }) else {
            throw APIError.notFound("Exercise \(id) not found")
        }
        return exercise
    }

    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise {
        await simulateDelay()
        try checkForError()
        let newId = (mockExercises.map { $0.id }.max() ?? 0) + 1
        let exercise = Exercise(
            id: newId,
            name: name,
            weightIncrement: weightIncrement,
            isCustom: true,
            createdAt: Date(),
            updatedAt: Date()
        )
        mockExercises.append(exercise)
        return exercise
    }

    func updateExercise(id: Int, name: String?, weightIncrement: Double?) async throws -> Exercise {
        await simulateDelay()
        try checkForError()
        guard let index = mockExercises.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Exercise \(id) not found")
        }
        var exercise = mockExercises[index]
        if let name = name {
            exercise.name = name
        }
        if let weightIncrement = weightIncrement {
            exercise.weightIncrement = weightIncrement
        }
        exercise.updatedAt = Date()
        mockExercises[index] = exercise
        return exercise
    }

    func deleteExercise(id: Int) async throws {
        await simulateDelay()
        try checkForError()
        mockExercises.removeAll { $0.id == id }
    }

    func getExerciseHistory(id: Int) async throws -> ExerciseHistory {
        await simulateDelay()
        try checkForError()
        guard let history = mockExerciseHistory else {
            throw APIError.notFound("Exercise history not found")
        }
        return history
    }

    // MARK: - Plans

    func getPlans() async throws -> [Plan] {
        await simulateDelay()
        try checkForError()
        return mockPlans
    }

    func getPlan(id: Int) async throws -> Plan {
        await simulateDelay()
        try checkForError()
        guard let plan = mockPlans.first(where: { $0.id == id }) else {
            throw APIError.notFound("Plan \(id) not found")
        }
        return plan
    }

    func createPlan(name: String, durationWeeks: Int) async throws -> Plan {
        await simulateDelay()
        try checkForError()
        let newId = (mockPlans.map { $0.id }.max() ?? 0) + 1
        let plan = Plan(
            id: newId,
            name: name,
            durationWeeks: durationWeeks,
            createdAt: Date(),
            updatedAt: Date(),
            days: nil
        )
        mockPlans.append(plan)
        return plan
    }

    func updatePlan(id: Int, name: String?, durationWeeks: Int?) async throws -> Plan {
        await simulateDelay()
        try checkForError()
        guard let index = mockPlans.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Plan \(id) not found")
        }
        var plan = mockPlans[index]
        if let name = name {
            plan.name = name
        }
        if let durationWeeks = durationWeeks {
            plan.durationWeeks = durationWeeks
        }
        plan.updatedAt = Date()
        mockPlans[index] = plan
        return plan
    }

    func deletePlan(id: Int) async throws {
        await simulateDelay()
        try checkForError()
        mockPlans.removeAll { $0.id == id }
    }

    // MARK: - Mesocycles

    func getMesocycles() async throws -> [Mesocycle] {
        await simulateDelay()
        try checkForError()
        return mockMesocycles
    }

    func getActiveMesocycle() async throws -> Mesocycle? {
        await simulateDelay()
        try checkForError()
        return mockActiveMesocycle
    }

    func getMesocycle(id: Int) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        guard let mesocycle = mockMesocycles.first(where: { $0.id == id }) else {
            throw APIError.notFound("Mesocycle \(id) not found")
        }
        return mesocycle
    }

    func createMesocycle(planId: Int, startDate: Date) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        let newId = (mockMesocycles.map { $0.id }.max() ?? 0) + 1
        let mesocycle = Mesocycle(
            id: newId,
            planId: planId,
            startDate: startDate,
            currentWeek: 0,
            status: .pending,
            createdAt: Date(),
            updatedAt: Date(),
            planName: mockPlans.first(where: { $0.id == planId })?.name,
            weeks: nil,
            totalWorkouts: 21,
            completedWorkouts: 0
        )
        mockMesocycles.append(mesocycle)
        return mesocycle
    }

    func startMesocycle(id: Int) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        guard let index = mockMesocycles.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Mesocycle \(id) not found")
        }
        var mesocycle = mockMesocycles[index]
        mesocycle.status = .active
        mesocycle.updatedAt = Date()
        mockMesocycles[index] = mesocycle
        mockActiveMesocycle = mesocycle
        return mesocycle
    }

    func completeMesocycle(id: Int) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        guard let index = mockMesocycles.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Mesocycle \(id) not found")
        }
        var mesocycle = mockMesocycles[index]
        mesocycle.status = .completed
        mesocycle.updatedAt = Date()
        mockMesocycles[index] = mesocycle
        if mockActiveMesocycle?.id == id {
            mockActiveMesocycle = nil
        }
        return mesocycle
    }

    func cancelMesocycle(id: Int) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        guard let index = mockMesocycles.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Mesocycle \(id) not found")
        }
        var mesocycle = mockMesocycles[index]
        mesocycle.status = .cancelled
        mesocycle.updatedAt = Date()
        mockMesocycles[index] = mesocycle
        if mockActiveMesocycle?.id == id {
            mockActiveMesocycle = nil
        }
        return mesocycle
    }

    // MARK: - Stretch Sessions

    func getStretchSessions() async throws -> [StretchSession] {
        await simulateDelay()
        try checkForError()
        if let session = mockStretchSession {
            return [session]
        }
        return []
    }

    func getLatestStretchSession() async throws -> StretchSession? {
        await simulateDelay()
        try checkForError()
        return mockStretchSession
    }

    func getStretchSession(id: String) async throws -> StretchSession {
        await simulateDelay()
        try checkForError()
        if let session = mockStretchSession, session.id == id {
            return session
        }
        throw APIError.notFound("Stretch session not found")
    }

    func createStretchSession(_ session: StretchSession) async throws -> StretchSession {
        await simulateDelay()
        try checkForError()
        mockStretchSession = session
        return session
    }

    // MARK: - Meditation Sessions

    func getMeditationSessions() async throws -> [MeditationSession] {
        await simulateDelay()
        try checkForError()
        if let session = mockMeditationSession {
            return [session]
        }
        return []
    }

    func getLatestMeditationSession() async throws -> MeditationSession? {
        await simulateDelay()
        try checkForError()
        return mockMeditationSession
    }

    func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession {
        await simulateDelay()
        try checkForError()
        mockMeditationSession = session
        return session
    }

    func getMeditationStats() async throws -> MeditationStats {
        await simulateDelay()
        try checkForError()
        guard let stats = mockMeditationStats else {
            throw APIError.notFound("Meditation stats not found")
        }
        return stats
    }

    // MARK: - Calendar

    func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData {
        await simulateDelay()
        try checkForError()
        if let data = mockCalendarData {
            return data
        }
        // Return empty calendar data as default
        return CalendarData(
            startDate: "\(year)-\(String(format: "%02d", month))-01",
            endDate: "\(year)-\(String(format: "%02d", month))-28",
            days: [:]
        )
    }
}

// MARK: - Preview Helpers

extension MockAPIClient {
    /// Create a mock client with loading state simulation
    static func withDelay(_ seconds: TimeInterval) -> MockAPIClient {
        let client = MockAPIClient()
        client.delay = seconds
        return client
    }

    /// Create a mock client that always fails
    static func failing(with error: APIError? = nil) -> MockAPIClient {
        let client = MockAPIClient()
        client.shouldFail = true
        client.mockError = error
        return client
    }

    /// Create a mock client with empty data
    static var empty: MockAPIClient {
        let client = MockAPIClient()
        client.mockWorkout = nil
        client.mockStretchSession = nil
        client.mockMeditationSession = nil
        client.mockExercises = []
        client.mockPlans = []
        client.mockMesocycles = []
        client.mockActiveMesocycle = nil
        return client
    }
}
