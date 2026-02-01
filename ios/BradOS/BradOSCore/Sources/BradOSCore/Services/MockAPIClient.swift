import Foundation

/// Mock API client for SwiftUI previews and unit testing
public final class MockAPIClient: APIClientProtocol, @unchecked Sendable {
    // MARK: - Configuration

    /// Whether the mock should simulate failures
    public var shouldFail = false

    /// Custom error to throw when shouldFail is true
    public var mockError: APIError?

    /// Simulated network delay in seconds
    public var delay: TimeInterval = 0

    // MARK: - Mock Data Storage

    public var mockWorkout: Workout?
    public var mockStretchSession: StretchSession?
    public var mockMeditationSession: MeditationSession?
    public var mockExercises: [Exercise] = []
    public var mockPlans: [Plan] = []
    public var mockMesocycles: [Mesocycle] = []
    public var mockActiveMesocycle: Mesocycle?
    public var mockMeditationStats: MeditationStats?
    public var mockExerciseHistory: ExerciseHistory?
    public var mockCalendarData: CalendarData?
    public var mockBarcodes: [Barcode] = []
    public var mockIngredients: [Ingredient] = []
    public var mockRecipes: [Recipe] = []

    // MARK: - Initialization

    public init() {
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
        mockBarcodes = Barcode.mockBarcodes
        mockIngredients = Ingredient.mockIngredients
        mockRecipes = Recipe.mockRecipes
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

    public func getTodaysWorkout() async throws -> Workout? {
        await simulateDelay()
        try checkForError()
        return mockWorkout
    }

    public func getWorkout(id: String) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        guard let workout = mockWorkout else {
            throw APIError.notFound("Workout \(id) not found")
        }
        return workout
    }

    public func startWorkout(id: String) async throws -> Workout {
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

    public func completeWorkout(id: String) async throws -> Workout {
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

    public func skipWorkout(id: String) async throws -> Workout {
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

    public func logSet(id: String, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: "mock-workout-1",
            exerciseId: "mock-exercise-1",
            setNumber: 1,
            targetReps: actualReps,
            targetWeight: actualWeight,
            actualReps: actualReps,
            actualWeight: actualWeight,
            status: .completed
        )
    }

    public func skipSet(id: String) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: "mock-workout-1",
            exerciseId: "mock-exercise-1",
            setNumber: 1,
            targetReps: 10,
            targetWeight: 100,
            actualReps: nil,
            actualWeight: nil,
            status: .skipped
        )
    }

    public func unlogSet(id: String) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(
            id: id,
            workoutId: "mock-workout-1",
            exerciseId: "mock-exercise-1",
            setNumber: 1,
            targetReps: 10,
            targetWeight: 100,
            actualReps: nil,
            actualWeight: nil,
            status: .pending
        )
    }

    public func addSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult {
        await simulateDelay()
        try checkForError()
        let newSet = WorkoutSet(
            id: "mock-set-\(UUID().uuidString.prefix(8))",
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

    public func removeSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult {
        await simulateDelay()
        try checkForError()
        return ModifySetCountResult(
            currentWorkoutSet: nil,
            futureWorkoutsAffected: 5,
            futureSetsModified: 5
        )
    }

    // MARK: - Exercises

    public func getExercises() async throws -> [Exercise] {
        await simulateDelay()
        try checkForError()
        return mockExercises
    }

    public func getExercise(id: String) async throws -> Exercise {
        await simulateDelay()
        try checkForError()
        guard let exercise = mockExercises.first(where: { $0.id == id }) else {
            throw APIError.notFound("Exercise \(id) not found")
        }
        return exercise
    }

    public func createExercise(name: String, weightIncrement: Double) async throws -> Exercise {
        await simulateDelay()
        try checkForError()
        let newId = "mock-exercise-\(UUID().uuidString.prefix(8))"
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

    public func updateExercise(id: String, name: String?, weightIncrement: Double?) async throws -> Exercise {
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

    public func deleteExercise(id: String) async throws {
        await simulateDelay()
        try checkForError()
        mockExercises.removeAll { $0.id == id }
    }

    public func getExerciseHistory(id: String) async throws -> ExerciseHistory {
        await simulateDelay()
        try checkForError()
        guard let history = mockExerciseHistory else {
            throw APIError.notFound("Exercise history not found")
        }
        return history
    }

    // MARK: - Plans

    public func getPlans() async throws -> [Plan] {
        await simulateDelay()
        try checkForError()
        return mockPlans
    }

    public func getPlan(id: String) async throws -> Plan {
        await simulateDelay()
        try checkForError()
        guard let plan = mockPlans.first(where: { $0.id == id }) else {
            throw APIError.notFound("Plan \(id) not found")
        }
        return plan
    }

    public func createPlan(name: String, durationWeeks: Int) async throws -> Plan {
        await simulateDelay()
        try checkForError()
        let newId = "mock-plan-\(UUID().uuidString.prefix(8))"
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

    public func updatePlan(id: String, name: String?, durationWeeks: Int?) async throws -> Plan {
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

    public func deletePlan(id: String) async throws {
        await simulateDelay()
        try checkForError()
        mockPlans.removeAll { $0.id == id }
    }

    // MARK: - Mesocycles

    public func getMesocycles() async throws -> [Mesocycle] {
        await simulateDelay()
        try checkForError()
        return mockMesocycles
    }

    public func getActiveMesocycle() async throws -> Mesocycle? {
        await simulateDelay()
        try checkForError()
        return mockActiveMesocycle
    }

    public func getMesocycle(id: String) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        guard let mesocycle = mockMesocycles.first(where: { $0.id == id }) else {
            throw APIError.notFound("Mesocycle \(id) not found")
        }
        return mesocycle
    }

    public func createMesocycle(planId: String, startDate: Date) async throws -> Mesocycle {
        await simulateDelay()
        try checkForError()
        let newId = "mock-mesocycle-\(UUID().uuidString.prefix(8))"
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

    public func startMesocycle(id: String) async throws -> Mesocycle {
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

    public func completeMesocycle(id: String) async throws -> Mesocycle {
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

    public func cancelMesocycle(id: String) async throws -> Mesocycle {
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

    public func getStretchSessions() async throws -> [StretchSession] {
        await simulateDelay()
        try checkForError()
        if let session = mockStretchSession {
            return [session]
        }
        return []
    }

    public func getLatestStretchSession() async throws -> StretchSession? {
        await simulateDelay()
        try checkForError()
        return mockStretchSession
    }

    public func getStretchSession(id: String) async throws -> StretchSession {
        await simulateDelay()
        try checkForError()
        if let session = mockStretchSession, session.id == id {
            return session
        }
        throw APIError.notFound("Stretch session not found")
    }

    public func createStretchSession(_ session: StretchSession) async throws -> StretchSession {
        await simulateDelay()
        try checkForError()
        mockStretchSession = session
        return session
    }

    // MARK: - Meditation Sessions

    public func getMeditationSessions() async throws -> [MeditationSession] {
        await simulateDelay()
        try checkForError()
        if let session = mockMeditationSession {
            return [session]
        }
        return []
    }

    public func getLatestMeditationSession() async throws -> MeditationSession? {
        await simulateDelay()
        try checkForError()
        return mockMeditationSession
    }

    public func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession {
        await simulateDelay()
        try checkForError()
        mockMeditationSession = session
        return session
    }

    public func getMeditationStats() async throws -> MeditationStats {
        await simulateDelay()
        try checkForError()
        guard let stats = mockMeditationStats else {
            throw APIError.notFound("Meditation stats not found")
        }
        return stats
    }

    // MARK: - Barcodes

    public func getBarcodes() async throws -> [Barcode] {
        await simulateDelay()
        try checkForError()
        return mockBarcodes
    }

    public func getBarcode(id: String) async throws -> Barcode {
        await simulateDelay()
        try checkForError()
        guard let barcode = mockBarcodes.first(where: { $0.id == id }) else {
            throw APIError.notFound("Barcode \(id) not found")
        }
        return barcode
    }

    public func createBarcode(_ dto: CreateBarcodeDTO) async throws -> Barcode {
        await simulateDelay()
        try checkForError()
        let newId = "mock-barcode-\(UUID().uuidString.prefix(8))"
        let barcode = Barcode(
            id: newId,
            label: dto.label,
            value: dto.value,
            barcodeType: BarcodeType(rawValue: dto.barcodeType) ?? .code128,
            color: dto.color,
            sortOrder: dto.sortOrder,
            createdAt: Date(),
            updatedAt: Date()
        )
        mockBarcodes.append(barcode)
        return barcode
    }

    public func updateBarcode(id: String, dto: UpdateBarcodeDTO) async throws -> Barcode {
        await simulateDelay()
        try checkForError()
        guard let index = mockBarcodes.firstIndex(where: { $0.id == id }) else {
            throw APIError.notFound("Barcode \(id) not found")
        }
        var barcode = mockBarcodes[index]
        if let label = dto.label { barcode.label = label }
        if let value = dto.value { barcode.value = value }
        if let barcodeType = dto.barcodeType, let type = BarcodeType(rawValue: barcodeType) {
            barcode.barcodeType = type
        }
        if let color = dto.color { barcode.color = color }
        if let sortOrder = dto.sortOrder { barcode.sortOrder = sortOrder }
        barcode.updatedAt = Date()
        mockBarcodes[index] = barcode
        return barcode
    }

    public func deleteBarcode(id: String) async throws {
        await simulateDelay()
        try checkForError()
        mockBarcodes.removeAll { $0.id == id }
    }

    // MARK: - Ingredients

    public func getIngredients() async throws -> [Ingredient] {
        await simulateDelay()
        try checkForError()
        return mockIngredients
    }

    // MARK: - Recipes

    public func getRecipes() async throws -> [Recipe] {
        await simulateDelay()
        try checkForError()
        return mockRecipes
    }

    // MARK: - Calendar

    public func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData {
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

public extension MockAPIClient {
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
        client.mockBarcodes = []
        client.mockIngredients = []
        client.mockRecipes = []
        return client
    }
}
