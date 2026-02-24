import Foundation

/// Protocol for API client operations
/// Enables dependency injection for testing and previews
public protocol APIClientProtocol: Sendable {
    // MARK: - Workouts

    /// Get today's scheduled workout (nil if none scheduled)
    func getTodaysWorkout() async throws -> Workout?

    /// Get a specific workout by ID
    func getWorkout(id: String) async throws -> Workout

    /// Start a workout (sets status to in_progress)
    func startWorkout(id: String) async throws -> Workout

    /// Complete a workout
    func completeWorkout(id: String) async throws -> Workout

    /// Skip a workout
    func skipWorkout(id: String) async throws -> Workout

    // MARK: - Workout Sets

    /// Log a completed set with actual reps and weight
    func logSet(id: String, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet

    /// Skip a set
    func skipSet(id: String) async throws -> WorkoutSet

    /// Unlog a previously logged set (reset to pending)
    func unlogSet(id: String) async throws -> WorkoutSet

    /// Add a set to an exercise in a workout (also adds to future workouts)
    func addSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult

    /// Remove the last pending set from an exercise (also removes from future workouts)
    func removeSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult

    // MARK: - Exercises

    /// Get all exercises
    func getExercises() async throws -> [Exercise]

    /// Get a specific exercise by ID
    func getExercise(id: String) async throws -> Exercise

    /// Create a new exercise
    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise

    /// Update an existing exercise
    func updateExercise(id: String, name: String?, weightIncrement: Double?) async throws -> Exercise

    /// Delete an exercise
    func deleteExercise(id: String) async throws

    /// Get exercise history
    func getExerciseHistory(id: String) async throws -> ExerciseHistory

    // MARK: - Plans

    /// Get all plans
    func getPlans() async throws -> [Plan]

    /// Get a specific plan by ID
    func getPlan(id: String) async throws -> Plan

    /// Create a new plan
    func createPlan(name: String, durationWeeks: Int) async throws -> Plan

    /// Update an existing plan
    func updatePlan(id: String, name: String?, durationWeeks: Int?) async throws -> Plan

    /// Delete a plan
    func deletePlan(id: String) async throws

    /// Get days for a plan (with exercises populated)
    func getPlanDays(planId: String) async throws -> [PlanDay]

    // MARK: - Mesocycles

    /// Get all mesocycles
    func getMesocycles() async throws -> [Mesocycle]

    /// Get the currently active mesocycle (nil if none)
    func getActiveMesocycle() async throws -> Mesocycle?

    /// Get a specific mesocycle by ID
    func getMesocycle(id: String) async throws -> Mesocycle

    /// Create a new mesocycle from a plan
    func createMesocycle(planId: String, startDate: Date) async throws -> Mesocycle

    /// Start a pending mesocycle
    func startMesocycle(id: String) async throws -> Mesocycle

    /// Complete an active mesocycle
    func completeMesocycle(id: String) async throws -> Mesocycle

    /// Cancel a mesocycle
    func cancelMesocycle(id: String) async throws -> Mesocycle

    // MARK: - Stretch Sessions

    /// Get all stretch sessions
    func getStretchSessions() async throws -> [StretchSession]

    /// Get a specific stretch session by ID
    func getStretchSession(id: String) async throws -> StretchSession

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

    // MARK: - Barcodes

    /// Get all barcodes ordered by sort_order
    func getBarcodes() async throws -> [Barcode]

    /// Get a specific barcode by ID
    func getBarcode(id: String) async throws -> Barcode

    /// Create a new barcode
    func createBarcode(_ dto: CreateBarcodeDTO) async throws -> Barcode

    /// Update an existing barcode
    func updateBarcode(id: String, dto: UpdateBarcodeDTO) async throws -> Barcode

    /// Delete a barcode
    func deleteBarcode(id: String) async throws

    // MARK: - Ingredients

    /// Get all ingredients
    func getIngredients() async throws -> [Ingredient]

    // MARK: - Recipes

    /// Get all recipes
    func getRecipes() async throws -> [Recipe]

    // MARK: - Meal Plans

    /// Generate a new meal plan
    func generateMealPlan() async throws -> GenerateMealPlanResponse

    /// Get a meal plan session by ID
    func getMealPlanSession(id: String) async throws -> MealPlanSession

    /// Submit a critique to modify the meal plan
    func critiqueMealPlan(sessionId: String, critique: String) async throws -> CritiqueMealPlanResponse

    /// Finalize a meal plan session
    func finalizeMealPlan(sessionId: String) async throws

    /// Get the most recent meal plan session
    func getLatestMealPlanSession() async throws -> MealPlanSession?

    // MARK: - Guided Meditations

    /// Get all guided meditation categories
    func getGuidedMeditationCategories() async throws -> [GuidedMeditationCategoryResponse]

    /// Get scripts for a specific category
    func getGuidedMeditationScripts(category: String) async throws -> [GuidedMeditationScript]

    /// Get a full guided meditation script with segments and interjections
    func getGuidedMeditationScript(id: String) async throws -> GuidedMeditationScript

    // MARK: - Stretches

    /// Get all stretch regions with embedded stretch definitions
    func getStretches() async throws -> [StretchRegionData]

    // MARK: - Text to Speech

    /// Synthesize speech from text, returns MP3 audio data
    func synthesizeSpeech(text: String) async throws -> Data

    // MARK: - Health Sync

    /// Get HRV history entries
    func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry]

    /// Get RHR history entries
    func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry]

    /// Get sleep history entries
    func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry]
}
