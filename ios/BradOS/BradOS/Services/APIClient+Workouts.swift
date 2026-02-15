import Foundation
import BradOSCore

// MARK: - Workouts, Sets, Exercises, Plans, Mesocycles

extension APIClient {

    // MARK: - Workouts

    func getTodaysWorkout() async throws -> Workout? {
        try await getOptional("/workouts/today", cacheTTL: CacheTTL.short)
    }

    func getWorkout(id: String) async throws -> Workout {
        try await get("/workouts/\(id)")
    }

    func startWorkout(id: String) async throws -> Workout {
        let result: Workout = try await put("/workouts/\(id)/start")
        invalidateCache(matching: "/workouts")
        return result
    }

    func completeWorkout(id: String) async throws -> Workout {
        let result: Workout = try await put("/workouts/\(id)/complete")
        invalidateCache(matching: "/workouts")
        return result
    }

    func skipWorkout(id: String) async throws -> Workout {
        let result: Workout = try await put("/workouts/\(id)/skip")
        invalidateCache(matching: "/workouts")
        return result
    }

    // MARK: - Workout Sets

    func logSet(id: String, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
        struct LogSetBody: Encodable {
            let actualReps: Int
            let actualWeight: Double

            enum CodingKeys: String, CodingKey {
                case actualReps = "actual_reps"
                case actualWeight = "actual_weight"
            }
        }
        return try await put("/workout-sets/\(id)/log", body: LogSetBody(actualReps: actualReps, actualWeight: actualWeight))
    }

    func skipSet(id: String) async throws -> WorkoutSet {
        try await put("/workout-sets/\(id)/skip")
    }

    func unlogSet(id: String) async throws -> WorkoutSet {
        try await put("/workout-sets/\(id)/unlog")
    }

    func addSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult {
        try await post("/workouts/\(workoutId)/exercises/\(exerciseId)/sets/add", body: EmptyBody())
    }

    func removeSet(workoutId: String, exerciseId: String) async throws -> ModifySetCountResult {
        try await deleteRequest("/workouts/\(workoutId)/exercises/\(exerciseId)/sets/remove")
    }

    // MARK: - Exercises

    func getExercises() async throws -> [Exercise] {
        try await get("/exercises")
    }

    func getExercise(id: String) async throws -> Exercise {
        try await get("/exercises/\(id)")
    }

    func createExercise(name: String, weightIncrement: Double = 5.0) async throws -> Exercise {
        struct CreateExerciseBody: Encodable {
            let name: String
            let weightIncrement: Double

            enum CodingKeys: String, CodingKey {
                case name
                case weightIncrement = "weight_increment"
            }
        }
        return try await post("/exercises", body: CreateExerciseBody(name: name, weightIncrement: weightIncrement))
    }

    func updateExercise(id: String, name: String? = nil, weightIncrement: Double? = nil) async throws -> Exercise {
        struct UpdateExerciseBody: Encodable {
            let name: String?
            let weightIncrement: Double?

            enum CodingKeys: String, CodingKey {
                case name
                case weightIncrement = "weight_increment"
            }
        }
        return try await put("/exercises/\(id)", body: UpdateExerciseBody(name: name, weightIncrement: weightIncrement))
    }

    func deleteExercise(id: String) async throws {
        try await deleteRequest("/exercises/\(id)")
    }

    func getExerciseHistory(id: String) async throws -> ExerciseHistory {
        try await get("/exercises/\(id)/history")
    }

    // MARK: - Plans

    func getPlans() async throws -> [Plan] {
        try await get("/plans")
    }

    func getPlan(id: String) async throws -> Plan {
        try await get("/plans/\(id)")
    }

    func createPlan(name: String, durationWeeks: Int = 6) async throws -> Plan {
        struct CreatePlanBody: Encodable {
            let name: String
            let durationWeeks: Int

            enum CodingKeys: String, CodingKey {
                case name
                case durationWeeks = "duration_weeks"
            }
        }
        return try await post("/plans", body: CreatePlanBody(name: name, durationWeeks: durationWeeks))
    }

    func updatePlan(id: String, name: String? = nil, durationWeeks: Int? = nil) async throws -> Plan {
        struct UpdatePlanBody: Encodable {
            let name: String?
            let durationWeeks: Int?

            enum CodingKeys: String, CodingKey {
                case name
                case durationWeeks = "duration_weeks"
            }
        }
        return try await put("/plans/\(id)", body: UpdatePlanBody(name: name, durationWeeks: durationWeeks))
    }

    func deletePlan(id: String) async throws {
        try await deleteRequest("/plans/\(id)")
    }

    func getPlanDays(planId: String) async throws -> [PlanDay] {
        print("[APIClient] getPlanDays: fetching days for plan \(planId)")
        let days: [PlanDay] = try await get("/plans/\(planId)/days")
        print("[APIClient] getPlanDays: got \(days.count) days for plan \(planId)")
        var enrichedDays: [PlanDay] = []
        for var day in days {
            do {
                let exercises: [PlanDayExercise] = try await get("/plans/\(planId)/days/\(day.id)/exercises")
                day.exercises = exercises
                print("[APIClient] getPlanDays: day \(day.id) has \(exercises.count) exercises")
            } catch {
                print("[APIClient] getPlanDays: FAILED to decode exercises for day \(day.id): \(error)")
                // Continue with empty exercises rather than failing the entire plan
                day.exercises = []
            }
            enrichedDays.append(day)
        }
        return enrichedDays
    }

    // MARK: - Mesocycles

    func getMesocycles() async throws -> [Mesocycle] {
        try await get("/mesocycles")
    }

    func getActiveMesocycle() async throws -> Mesocycle? {
        try await getOptional("/mesocycles/active")
    }

    func getMesocycle(id: String) async throws -> Mesocycle {
        try await get("/mesocycles/\(id)")
    }

    func createMesocycle(planId: String, startDate: Date) async throws -> Mesocycle {
        struct CreateMesocycleBody: Encodable {
            let planId: String
            let startDate: String

            enum CodingKeys: String, CodingKey {
                case planId = "plan_id"
                case startDate = "start_date"
            }
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        let dateString = formatter.string(from: startDate)
        return try await post("/mesocycles", body: CreateMesocycleBody(planId: planId, startDate: dateString))
    }

    func startMesocycle(id: String) async throws -> Mesocycle {
        try await put("/mesocycles/\(id)/start")
    }

    func completeMesocycle(id: String) async throws -> Mesocycle {
        try await put("/mesocycles/\(id)/complete")
    }

    func cancelMesocycle(id: String) async throws -> Mesocycle {
        try await put("/mesocycles/\(id)/cancel")
    }
}
