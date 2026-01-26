import Foundation

/// An exercise in the exercise library
struct Exercise: Identifiable, Codable, Hashable {
    let id: Int
    var name: String
    var weightIncrement: Double
    var isCustom: Bool
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case weightIncrement = "weight_increment"
        case isCustom = "is_custom"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - DTOs

/// Request body for POST /api/exercises
struct CreateExerciseDTO: Encodable {
    let name: String
    let weightIncrement: Double
    let isCustom: Bool

    enum CodingKeys: String, CodingKey {
        case name
        case weightIncrement = "weight_increment"
        case isCustom = "is_custom"
    }

    init(name: String, weightIncrement: Double = 5.0) {
        self.name = name
        self.weightIncrement = weightIncrement
        self.isCustom = true
    }
}

/// Request body for PUT /api/exercises/:id
struct UpdateExerciseDTO: Encodable {
    let name: String?
    let weightIncrement: Double?

    enum CodingKeys: String, CodingKey {
        case name
        case weightIncrement = "weight_increment"
    }
}

// MARK: - Mock Data
extension Exercise {
    static let mockExercises: [Exercise] = [
        Exercise(
            id: 1,
            name: "Bench Press",
            weightIncrement: 5,
            isCustom: false,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Exercise(
            id: 2,
            name: "Squat",
            weightIncrement: 5,
            isCustom: false,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Exercise(
            id: 3,
            name: "Deadlift",
            weightIncrement: 5,
            isCustom: false,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Exercise(
            id: 4,
            name: "Overhead Press",
            weightIncrement: 5,
            isCustom: false,
            createdAt: Date(),
            updatedAt: Date()
        ),
        Exercise(
            id: 5,
            name: "Barbell Row",
            weightIncrement: 5,
            isCustom: false,
            createdAt: Date(),
            updatedAt: Date()
        )
    ]
}
