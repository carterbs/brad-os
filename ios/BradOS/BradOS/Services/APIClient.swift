import Foundation
import BradOSCore
import FirebaseAppCheck

/// Empty body for POST/PUT requests that don't need a body
private struct EmptyBody: Encodable {}

/// Main API client for Brad OS server
final class APIClient: APIClientProtocol {
    // MARK: - Singleton

    static let shared = APIClient()

    // MARK: - Properties

    private let configuration: APIConfiguration
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    // MARK: - Initialization

    init(configuration: APIConfiguration = .default, session: URLSession? = nil) {
        self.configuration = configuration

        // Use a custom session that bypasses proxies for local network access
        if let session = session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.connectionProxyDictionary = [:] // Disable proxies (including Private Relay)
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }

        print("🌐 [APIClient] Initialized with baseURL: \(configuration.baseURL.absoluteString) (proxy bypass enabled)")

        // Configure decoder for ISO 8601 dates with fractional seconds
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO 8601 with fractional seconds first
            let formatterWithFractional = ISO8601DateFormatter()
            formatterWithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatterWithFractional.date(from: dateString) {
                return date
            }

            // Try ISO 8601 without fractional seconds
            let formatterWithoutFractional = ISO8601DateFormatter()
            formatterWithoutFractional.formatOptions = [.withInternetDateTime]
            if let date = formatterWithoutFractional.date(from: dateString) {
                return date
            }

            // Try date-only format (YYYY-MM-DD)
            // Use local timezone since the server already converts to local date
            let dateOnlyFormatter = DateFormatter()
            dateOnlyFormatter.dateFormat = "yyyy-MM-dd"
            dateOnlyFormatter.locale = Locale(identifier: "en_US_POSIX")
            dateOnlyFormatter.timeZone = TimeZone.current
            if let date = dateOnlyFormatter.date(from: dateString) {
                return date
            }

            // Try space-separated datetime format (YYYY-MM-DD HH:mm:ss) - SQLite default format
            let sqliteFormatter = DateFormatter()
            sqliteFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            sqliteFormatter.locale = Locale(identifier: "en_US_POSIX")
            sqliteFormatter.timeZone = TimeZone(identifier: "UTC")
            if let date = sqliteFormatter.date(from: dateString) {
                return date
            }

            // Try space-separated datetime with fractional seconds (YYYY-MM-DD HH:mm:ss.SSSSSS)
            let sqliteFractionalFormatter = DateFormatter()
            sqliteFractionalFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSS"
            sqliteFractionalFormatter.locale = Locale(identifier: "en_US_POSIX")
            sqliteFractionalFormatter.timeZone = TimeZone(identifier: "UTC")
            if let date = sqliteFractionalFormatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date from: \(dateString)"
            )
        }

        // Configure encoder for ISO 8601 dates
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Core Request Methods

    /// Perform GET request and decode response
    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performRequest(request)
    }

    /// Perform GET request that may return null
    private func getOptional<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> T? {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await performOptionalRequest(request)
    }

    /// Perform POST request with body
    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await performRequest(request)
    }

    /// Perform PUT request with optional body
    private func put<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "PUT")
        return try await performRequest(request)
    }

    /// Perform PUT request with body
    private func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await performRequest(request)
    }

    /// Perform DELETE request (no response body)
    private func delete(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response, allowEmpty: true)
    }

    /// Perform DELETE request with response body
    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "DELETE")
        return try await performRequest(request)
    }

    // MARK: - Request Building

    private func buildRequest(path: String, method: String, queryItems: [URLQueryItem]? = nil) throws -> URLRequest {
        var components = URLComponents(url: configuration.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        if let queryItems = queryItems, !queryItems.isEmpty {
            components?.queryItems = queryItems
        }

        guard let url = components?.url else {
            throw APIError.unknown("Invalid URL path: \(path)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    // MARK: - Response Handling

    private func performDataTask(for request: URLRequest) async throws -> (Data, URLResponse) {
        var request = request

        // Skip App Check for emulator (localhost) - server bypasses verification in emulator mode
        if configuration.isEmulator {
            print("🔧 [APIClient] Skipping App Check for emulator")
        } else {
            // Attach App Check token to request
            do {
                let token = try await AppCheck.appCheck().token(forcingRefresh: false)
                request.setValue(token.token, forHTTPHeaderField: "X-Firebase-AppCheck")
            } catch {
                // Log warning but continue - server will reject if enforcement is on
                print("⚠️ [APIClient] Failed to get App Check token: \(error.localizedDescription)")
            }
        }

        print("🌐 [APIClient] \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        do {
            let (data, response) = try await session.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                print("🌐 [APIClient] Response: \(httpResponse.statusCode) (\(data.count) bytes)")
            }
            return (data, response)
        } catch {
            print("🌐 [APIClient] Network error: \(error.localizedDescription)")
            throw APIError.network(error)
        }
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response)

        do {
            let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)
            return apiResponse.data
        } catch let decodingError {
            // Log the raw response for debugging
            #if DEBUG
            if let jsonString = String(data: data, encoding: .utf8) {
                print("[APIClient] Failed to decode response: \(jsonString)")
                print("[APIClient] Decoding error: \(decodingError)")
            }
            #endif
            throw APIError.decoding(decodingError)
        }
    }

    private func performOptionalRequest<T: Decodable>(_ request: URLRequest) async throws -> T? {
        let (data, response) = try await performDataTask(for: request)
        try validateResponse(data: data, response: response)

        do {
            // Try to decode as APIResponse<T?>
            let apiResponse = try decoder.decode(APIResponse<T?>.self, from: data)
            return apiResponse.data
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func validateResponse(data: Data, response: URLResponse, allowEmpty: Bool = false) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.network(NSError(domain: "APIClient", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid response type"
            ]))
        }

        // Success range
        if (200...299).contains(httpResponse.statusCode) {
            return
        }

        // Try to parse error response
        if let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data) {
            let code = APIErrorCode(rawValue: errorResponse.error.code) ?? .unknown
            throw APIError(
                code: code,
                message: errorResponse.error.message,
                statusCode: httpResponse.statusCode
            )
        }

        // Fallback error based on status code
        let message = "Request failed with status \(httpResponse.statusCode)"
        switch httpResponse.statusCode {
        case 404:
            throw APIError.notFound(message)
        case 400:
            throw APIError.validation(message)
        case 409:
            throw APIError.conflict(message)
        case 403:
            throw APIError.forbidden(message)
        case 500...599:
            throw APIError.internalError(message)
        default:
            throw APIError.unknown(message, statusCode: httpResponse.statusCode)
        }
    }

    // MARK: - Workouts

    func getTodaysWorkout() async throws -> Workout? {
        try await getOptional("/workouts/today")
    }

    func getWorkout(id: String) async throws -> Workout {
        try await get("/workouts/\(id)")
    }

    func startWorkout(id: String) async throws -> Workout {
        try await put("/workouts/\(id)/start")
    }

    func completeWorkout(id: String) async throws -> Workout {
        try await put("/workouts/\(id)/complete")
    }

    func skipWorkout(id: String) async throws -> Workout {
        try await put("/workouts/\(id)/skip")
    }

    // MARK: - Workout Sets

    func logSet(id: String, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
        struct LogSetBody: Encodable {
            let actual_reps: Int
            let actual_weight: Double
        }
        return try await put("/workout-sets/\(id)/log", body: LogSetBody(actual_reps: actualReps, actual_weight: actualWeight))
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
        try await delete("/workouts/\(workoutId)/exercises/\(exerciseId)/sets/remove")
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
            let weight_increment: Double
        }
        return try await post("/exercises", body: CreateExerciseBody(name: name, weight_increment: weightIncrement))
    }

    func updateExercise(id: String, name: String? = nil, weightIncrement: Double? = nil) async throws -> Exercise {
        struct UpdateExerciseBody: Encodable {
            let name: String?
            let weight_increment: Double?
        }
        return try await put("/exercises/\(id)", body: UpdateExerciseBody(name: name, weight_increment: weightIncrement))
    }

    func deleteExercise(id: String) async throws {
        try await delete("/exercises/\(id)")
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
            let duration_weeks: Int
        }
        return try await post("/plans", body: CreatePlanBody(name: name, duration_weeks: durationWeeks))
    }

    func updatePlan(id: String, name: String? = nil, durationWeeks: Int? = nil) async throws -> Plan {
        struct UpdatePlanBody: Encodable {
            let name: String?
            let duration_weeks: Int?
        }
        return try await put("/plans/\(id)", body: UpdatePlanBody(name: name, duration_weeks: durationWeeks))
    }

    func deletePlan(id: String) async throws {
        try await delete("/plans/\(id)")
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
            let plan_id: String
            let start_date: String
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        let dateString = formatter.string(from: startDate)
        return try await post("/mesocycles", body: CreateMesocycleBody(plan_id: planId, start_date: dateString))
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

    // MARK: - Stretch Sessions

    func getStretchSessions() async throws -> [StretchSession] {
        try await get("/stretch-sessions")
    }

    func getLatestStretchSession() async throws -> StretchSession? {
        try await getOptional("/stretch-sessions/latest")
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
        return try await post("/stretch-sessions", body: body)
    }

    // MARK: - Meditation Sessions

    func getMeditationSessions() async throws -> [MeditationSession] {
        try await get("/meditation-sessions")
    }

    func getLatestMeditationSession() async throws -> MeditationSession? {
        try await getOptional("/meditation-sessions/latest")
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
        return try await post("/meditation-sessions", body: body)
    }

    func getMeditationStats() async throws -> MeditationStats {
        try await get("/meditation-sessions/stats")
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
        try await delete("/barcodes/\(id)")
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
        struct EmptyBody: Encodable {}
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
        struct EmptyBody: Encodable {}
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

    // MARK: - Calendar

    func getCalendarData(year: Int, month: Int, timezoneOffset: Int? = nil) async throws -> CalendarData {
        var queryItems: [URLQueryItem]? = nil
        if let tz = timezoneOffset {
            queryItems = [URLQueryItem(name: "tz", value: String(tz))]
        }
        return try await get("/calendar/\(year)/\(month)", queryItems: queryItems)
    }
}
