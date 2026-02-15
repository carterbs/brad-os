import Foundation
import BradOSCore

// MARK: - Stretch, Meditation, Barcodes, Ingredients, Recipes, Meal Plans, TTS, Guided Meditations

extension APIClient {

    // MARK: - Stretch Sessions

    func getStretchSessions() async throws -> [StretchSession] {
        try await get("/stretch-sessions")
    }

    func getLatestStretchSession() async throws -> StretchSession? {
        try await getOptional("/stretch-sessions/latest", cacheTTL: CacheTTL.short)
    }

    func getStretchSession(id: String) async throws -> StretchSession {
        try await get("/stretch-sessions/\(id)")
    }

    func createStretchSession(_ session: StretchSession) async throws -> StretchSession {
        // Use a custom body struct to match server expectations (camelCase)
        struct CompletedStretchBody: Encodable {
            let region: String
            let stretchId: String
            let stretchName: String
            let durationSeconds: Int
            let skippedSegments: Int
        }

        struct CreateStretchSessionBody: Encodable {
            let completedAt: String
            let totalDurationSeconds: Int
            let regionsCompleted: Int
            let regionsSkipped: Int
            let stretches: [CompletedStretchBody]
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Convert stretches to the expected format
        let stretchBodies = (session.stretches ?? []).map { stretch in
            CompletedStretchBody(
                region: stretch.region.rawValue,
                stretchId: stretch.stretchId,
                stretchName: stretch.stretchName,
                durationSeconds: stretch.durationSeconds,
                skippedSegments: stretch.skippedSegments
            )
        }

        let body = CreateStretchSessionBody(
            completedAt: formatter.string(from: session.completedAt),
            totalDurationSeconds: session.totalDurationSeconds,
            regionsCompleted: session.regionsCompleted,
            regionsSkipped: session.regionsSkipped,
            stretches: stretchBodies
        )
        let result: StretchSession = try await post("/stretch-sessions", body: body)
        invalidateCache(matching: "/stretch-sessions")
        return result
    }

    // MARK: - Meditation Sessions

    func getMeditationSessions() async throws -> [MeditationSession] {
        try await get("/meditation-sessions")
    }

    func getLatestMeditationSession() async throws -> MeditationSession? {
        try await getOptional("/meditation-sessions/latest", cacheTTL: CacheTTL.short)
    }

    func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession {
        // Use a custom body struct to match server expectations (camelCase)
        struct CreateMeditationSessionBody: Encodable {
            let completedAt: String
            let sessionType: String
            let plannedDurationSeconds: Int
            let actualDurationSeconds: Int
            let completedFully: Bool
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let body = CreateMeditationSessionBody(
            completedAt: formatter.string(from: session.completedAt),
            sessionType: session.sessionType,
            plannedDurationSeconds: session.plannedDurationSeconds,
            actualDurationSeconds: session.actualDurationSeconds,
            completedFully: session.completedFully
        )
        let result: MeditationSession = try await post("/meditation-sessions", body: body)
        invalidateCache(matching: "/meditation-sessions")
        return result
    }

    func getMeditationStats() async throws -> MeditationStats {
        try await get("/meditation-sessions/stats", cacheTTL: CacheTTL.short)
    }

    // MARK: - Barcodes

    func getBarcodes() async throws -> [Barcode] {
        try await get("/barcodes")
    }

    func getBarcode(id: String) async throws -> Barcode {
        try await get("/barcodes/\(id)")
    }

    func createBarcode(_ dto: CreateBarcodeDTO) async throws -> Barcode {
        try await post("/barcodes", body: dto)
    }

    func updateBarcode(id: String, dto: UpdateBarcodeDTO) async throws -> Barcode {
        try await put("/barcodes/\(id)", body: dto)
    }

    func deleteBarcode(id: String) async throws {
        try await deleteRequest("/barcodes/\(id)")
    }

    // MARK: - Ingredients

    func getIngredients() async throws -> [Ingredient] {
        try await get("/ingredients")
    }

    // MARK: - Recipes

    func getRecipes() async throws -> [Recipe] {
        try await get("/recipes")
    }

    // MARK: - Meal Plans

    func generateMealPlan() async throws -> GenerateMealPlanResponse {
        return try await post("/mealplans/generate", body: EmptyBody())
    }

    func getMealPlanSession(id: String) async throws -> MealPlanSession {
        try await get("/mealplans/\(id)")
    }

    func critiqueMealPlan(sessionId: String, critique: String) async throws -> CritiqueMealPlanResponse {
        struct CritiqueBody: Encodable { let critique: String }
        return try await post("/mealplans/\(sessionId)/critique", body: CritiqueBody(critique: critique))
    }

    func finalizeMealPlan(sessionId: String) async throws {
        struct FinalizeResponse: Decodable { let finalized: Bool }
        let _: FinalizeResponse = try await post("/mealplans/\(sessionId)/finalize", body: EmptyBody())
    }

    func getLatestMealPlanSession() async throws -> MealPlanSession? {
        return try await getOptional("/mealplans/latest")
    }

    // MARK: - Stretches

    func getStretches() async throws -> [StretchRegionData] {
        try await get("/stretches")
    }

    // MARK: - Text to Speech

    func synthesizeSpeech(text: String) async throws -> Data {
        struct SynthesizeBody: Encodable {
            let text: String
        }

        struct SynthesizeResponse: Decodable {
            let audio: String
        }

        let response: SynthesizeResponse = try await post("/tts/synthesize", body: SynthesizeBody(text: text))

        guard let audioData = Data(base64Encoded: response.audio) else {
            throw APIError.unknown("Failed to decode base64 audio data")
        }

        return audioData
    }

    // MARK: - Guided Meditations

    func getGuidedMeditationCategories() async throws -> [GuidedMeditationCategoryResponse] {
        try await get("/guidedMeditations/categories")
    }

    func getGuidedMeditationScripts(category: String) async throws -> [GuidedMeditationScript] {
        try await get("/guidedMeditations/category/\(category)")
    }

    func getGuidedMeditationScript(id: String) async throws -> GuidedMeditationScript {
        try await get("/guidedMeditations/\(id)")
    }
}
