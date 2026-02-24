# iOS API Client Implementation Plan

## Overview

Implement a foundational networking layer for the iOS app that enables communication with the Brad OS server API. This client will be used by all features (Dashboard, Workout Tracking, Calendar, Exercises, Plans, Mesocycles, Stretching, Meditation) and must handle the server's consistent response format, error codes, and date serialization.

## Dependencies

None - this is a foundational component that other features depend on.

## Current State Analysis

### What Exists

| File | Description |
|------|-------------|
| `Models/*.swift` | All data models with `Codable` and `CodingKeys` for snake_case mapping |
| `Theme/Theme.swift` | App configuration (could add API base URL) |
| `App/BradOSApp.swift` | App entry point with `AppState` |

### Server API Patterns (from `packages/server/src/routes/`)

**Response Format:**
```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, details?: unknown } }
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Duplicate or constraint violation |
| `FORBIDDEN` | 403 | Action not allowed |
| `INTERNAL_ERROR` | 500 | Server error |

**Date Handling:**
- All dates as ISO 8601 strings
- Date-only fields: `"YYYY-MM-DD"`
- Timestamps: `"YYYY-MM-DDTHH:mm:ss.sssZ"`

### API Endpoints Required by Features

| Feature | Endpoints |
|---------|-----------|
| Dashboard | `GET /workouts/today`, `GET /stretch-sessions/latest`, `GET /meditation-sessions/latest` |
| Workout Tracking | `GET/PUT /workouts/:id`, `PUT /workouts/:id/start\|complete\|skip`, `PUT /workout-sets/:id/log\|skip\|unlog` |
| Calendar | `GET /calendar/:year/:month?tz=` |
| Exercises | `GET/POST/PUT/DELETE /exercises`, `GET /exercises/:id/history` |
| Plans | Full CRUD on `/plans`, `/plans/:id/days`, `/plans/:id/days/:dayId/exercises` |
| Mesocycles | `GET /mesocycles`, `GET /mesocycles/active`, `POST /mesocycles`, `PUT /mesocycles/:id/start\|complete\|cancel` |
| Stretch | `POST /stretch-sessions`, `GET /stretch-sessions`, `GET /stretch-sessions/latest` |
| Meditation | `POST /meditation-sessions`, `GET /meditation-sessions`, `GET /meditation-sessions/latest`, `GET /meditation-sessions/stats` |

## Desired End State

- Single `APIClient` class with async/await methods for all endpoints
- Typed Swift error enum matching server error codes
- Automatic JSON encoding/decoding with ISO 8601 date handling
- Configurable base URL (localhost for simulator, production URL for device)
- Singleton instance (`APIClient.shared`) for app-wide use
- Protocol-based design for testability (mock client in tests/previews)

## What We're NOT Doing

- Authentication (server has none)
- Request caching (leave to feature ViewModels)
- Retry logic (can be added later)
- Background upload/download
- WebSocket connections

## Key Discoveries

### Web Client Pattern (Reference)

From `packages/client/src/api/exerciseApi.ts:36-54`:

```typescript
async function handleResponse<T>(response: Response): Promise<T> {
  const result = await response.json() as ApiResponse<T> | ApiError;
  if (!response.ok || !result.success) {
    const errorResult = result as ApiError;
    const message = errorResult.error?.message ?? 'An error occurred';
    const code = errorResult.error?.code ?? 'UNKNOWN_ERROR';
    switch (response.status) {
      case 404: throw new NotFoundError(message);
      case 400: throw new ValidationError(message);
      case 409: throw new ConflictError(message);
      default: throw new ApiClientError(message, response.status, code);
    }
  }
  return result.data;
}
```

### Existing iOS Model Pattern

From `ios/BradOS/BradOS/Models/Workout.swift:27-39`:

```swift
enum CodingKeys: String, CodingKey {
    case id
    case mesocycleId = "mesocycle_id"
    case planDayId = "plan_day_id"
    case weekNumber = "week_number"
    case scheduledDate = "scheduled_date"
    case status
    case startedAt = "started_at"
    case completedAt = "completed_at"
    // ...
}
```

Models already handle snake_case → camelCase mapping via `CodingKeys`.

---

## Implementation Approach

Build a protocol-based API client with a concrete URLSession implementation. Use Swift's `async/await` for clean async code. Create typed error handling that mirrors server error codes.

---

## Phase 1: Core Infrastructure

### Overview
Create the foundational types and protocols for the API client.

### Changes Required

#### 1.1 Create `Services/` directory

```bash
mkdir -p ios/BradOS/BradOS/Services
```

#### 1.2 Create `Services/APIError.swift` (new file)

Define error types matching server error codes:

```swift
import Foundation

/// API error codes matching server responses
enum APIErrorCode: String, Codable {
    case notFound = "NOT_FOUND"
    case validationError = "VALIDATION_ERROR"
    case conflict = "CONFLICT"
    case forbidden = "FORBIDDEN"
    case internalError = "INTERNAL_ERROR"
    case networkError = "NETWORK_ERROR"
    case decodingError = "DECODING_ERROR"
    case unknown = "UNKNOWN_ERROR"
}

/// Structured API error with code and message
struct APIError: Error, LocalizedError {
    let code: APIErrorCode
    let message: String
    let statusCode: Int?
    let details: Any?

    var errorDescription: String? { message }

    // Convenience initializers for common errors
    static func notFound(_ message: String) -> APIError {
        APIError(code: .notFound, message: message, statusCode: 404, details: nil)
    }

    static func validation(_ message: String, details: Any? = nil) -> APIError {
        APIError(code: .validationError, message: message, statusCode: 400, details: details)
    }

    static func conflict(_ message: String) -> APIError {
        APIError(code: .conflict, message: message, statusCode: 409, details: nil)
    }

    static func network(_ error: Error) -> APIError {
        APIError(code: .networkError, message: error.localizedDescription, statusCode: nil, details: nil)
    }

    static func decoding(_ error: Error) -> APIError {
        APIError(code: .decodingError, message: "Failed to decode response: \(error.localizedDescription)", statusCode: nil, details: nil)
    }
}
```

#### 1.3 Create `Services/APIResponse.swift` (new file)

Define response wrapper types matching server format:

```swift
import Foundation

/// Successful API response wrapper
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T
}

/// Error response from server
struct APIErrorResponse: Decodable {
    let success: Bool
    let error: APIErrorDetail
}

struct APIErrorDetail: Decodable {
    let code: String
    let message: String
    let details: AnyCodable?
}

/// Type-erased Codable for arbitrary JSON details
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else {
            try container.encodeNil()
        }
    }
}
```

#### 1.4 Create `Services/APIConfiguration.swift` (new file)

Define base URL configuration:

```swift
import Foundation

/// API configuration for different environments
struct APIConfiguration {
    let baseURL: URL

    /// Default configuration based on build settings
    static var `default`: APIConfiguration {
        #if DEBUG
        // Use localhost for simulator, configurable IP for device
        #if targetEnvironment(simulator)
        let urlString = "http://localhost:3001/api"
        #else
        // For physical device testing, use your Mac's IP
        // TODO: Make this configurable via Settings or environment
        let urlString = "http://192.168.1.100:3001/api"
        #endif
        #else
        // Production URL
        let urlString = "https://api.brad-os.com/api"
        #endif

        guard let url = URL(string: urlString) else {
            fatalError("Invalid API base URL: \(urlString)")
        }
        return APIConfiguration(baseURL: url)
    }

    /// Create configuration with custom base URL
    static func custom(_ baseURLString: String) -> APIConfiguration {
        guard let url = URL(string: baseURLString) else {
            fatalError("Invalid API base URL: \(baseURLString)")
        }
        return APIConfiguration(baseURL: url)
    }
}
```

### Success Criteria

- [ ] `APIError` enum compiles with all server error codes
- [ ] `APIResponse<T>` correctly decodes `{ success: true, data: T }`
- [ ] `APIErrorResponse` correctly decodes `{ success: false, error: {...} }`
- [ ] `APIConfiguration` provides correct URLs for simulator/device/production

### Confirmation Gate
Write unit tests for response decoding with sample JSON payloads.

---

## Phase 2: API Client Protocol & Implementation

### Overview
Create the main API client with URLSession-based networking.

### Changes Required

#### 2.1 Create `Services/APIClientProtocol.swift` (new file)

Define protocol for testability:

```swift
import Foundation

/// Protocol for API client operations
protocol APIClientProtocol {
    // MARK: - Workouts
    func getTodaysWorkout() async throws -> Workout?
    func getWorkout(id: Int) async throws -> Workout
    func startWorkout(id: Int) async throws -> Workout
    func completeWorkout(id: Int) async throws -> Workout
    func skipWorkout(id: Int) async throws -> Workout

    // MARK: - Workout Sets
    func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet
    func skipSet(id: Int) async throws -> WorkoutSet
    func unlogSet(id: Int) async throws -> WorkoutSet

    // MARK: - Exercises
    func getExercises() async throws -> [Exercise]
    func getExercise(id: Int) async throws -> Exercise
    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise
    func updateExercise(id: Int, name: String?, weightIncrement: Double?) async throws -> Exercise
    func deleteExercise(id: Int) async throws

    // MARK: - Plans
    func getPlans() async throws -> [Plan]
    func getPlan(id: Int) async throws -> Plan
    func createPlan(name: String, durationWeeks: Int) async throws -> Plan
    func updatePlan(id: Int, name: String?, durationWeeks: Int?) async throws -> Plan
    func deletePlan(id: Int) async throws

    // MARK: - Mesocycles
    func getMesocycles() async throws -> [Mesocycle]
    func getActiveMesocycle() async throws -> Mesocycle?
    func getMesocycle(id: Int) async throws -> Mesocycle
    func createMesocycle(planId: Int, startDate: Date) async throws -> Mesocycle
    func startMesocycle(id: Int) async throws -> Mesocycle
    func completeMesocycle(id: Int) async throws -> Mesocycle
    func cancelMesocycle(id: Int) async throws -> Mesocycle

    // MARK: - Stretch Sessions
    func getStretchSessions() async throws -> [StretchSession]
    func getLatestStretchSession() async throws -> StretchSession?
    func createStretchSession(_ session: StretchSession) async throws -> StretchSession

    // MARK: - Meditation Sessions
    func getMeditationSessions() async throws -> [MeditationSession]
    func getLatestMeditationSession() async throws -> MeditationSession?
    func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession

    // MARK: - Calendar
    func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData
}
```

#### 2.2 Create `Services/APIClient.swift` (new file)

Implement the full API client:

```swift
import Foundation

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
    init(configuration: APIConfiguration = .default, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session

        // Configure decoder for ISO 8601 dates
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

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
    private func getOptional<T: Decodable>(_ path: String) async throws -> T? {
        let request = try buildRequest(path: path, method: "GET")
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
    private func put<T: Decodable>(_ path: String, body: (any Encodable)? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        if let body = body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await performRequest(request)
    }

    /// Perform DELETE request
    private func delete(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (data, response) = try await session.data(for: request)
        try validateResponse(data: data, response: response, allowEmpty: true)
    }

    // MARK: - Request Building

    private func buildRequest(path: String, method: String, queryItems: [URLQueryItem]? = nil) throws -> URLRequest {
        var components = URLComponents(url: configuration.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw APIError(code: .unknown, message: "Invalid URL path: \(path)", statusCode: nil, details: nil)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    // MARK: - Response Handling

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateResponse(data: data, response: response)

        do {
            let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)
            return apiResponse.data
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func performOptionalRequest<T: Decodable>(_ request: URLRequest) async throws -> T? {
        let (data, response) = try await session.data(for: request)
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
            throw APIError(code: .networkError, message: "Invalid response type", statusCode: nil, details: nil)
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
                statusCode: httpResponse.statusCode,
                details: errorResponse.error.details?.value
            )
        }

        // Fallback error
        throw APIError(
            code: .unknown,
            message: "Request failed with status \(httpResponse.statusCode)",
            statusCode: httpResponse.statusCode,
            details: nil
        )
    }
}

/// Type-erased Encodable wrapper
private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        _encode = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
```

### Success Criteria

- [ ] `APIClient` initializes with correct decoder/encoder settings
- [ ] GET, POST, PUT, DELETE methods work correctly
- [ ] Error responses are correctly parsed into `APIError`
- [ ] Null responses (like `getTodaysWorkout`) return `nil` not throw

### Confirmation Gate
Test core methods against running dev server or with mocked URLSession.

---

## Phase 3: Endpoint Implementations

### Overview
Implement all endpoint methods on the API client.

### Changes Required

#### 3.1 Add Workout endpoints to `APIClient.swift`

```swift
// MARK: - Workouts

func getTodaysWorkout() async throws -> Workout? {
    try await getOptional("/workouts/today")
}

func getWorkout(id: Int) async throws -> Workout {
    try await get("/workouts/\(id)")
}

func startWorkout(id: Int) async throws -> Workout {
    try await put("/workouts/\(id)/start")
}

func completeWorkout(id: Int) async throws -> Workout {
    try await put("/workouts/\(id)/complete")
}

func skipWorkout(id: Int) async throws -> Workout {
    try await put("/workouts/\(id)/skip")
}
```

#### 3.2 Add Workout Set endpoints

```swift
// MARK: - Workout Sets

func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
    struct LogSetBody: Encodable {
        let actual_reps: Int
        let actual_weight: Double
    }
    var request = try buildRequest(path: "/workout-sets/\(id)/log", method: "PUT")
    request.httpBody = try encoder.encode(LogSetBody(actual_reps: actualReps, actual_weight: actualWeight))
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return try await performRequest(request)
}

func skipSet(id: Int) async throws -> WorkoutSet {
    try await put("/workout-sets/\(id)/skip")
}

func unlogSet(id: Int) async throws -> WorkoutSet {
    try await put("/workout-sets/\(id)/unlog")
}
```

#### 3.3 Add Exercise endpoints

```swift
// MARK: - Exercises

func getExercises() async throws -> [Exercise] {
    try await get("/exercises")
}

func getExercise(id: Int) async throws -> Exercise {
    try await get("/exercises/\(id)")
}

func createExercise(name: String, weightIncrement: Double = 5.0) async throws -> Exercise {
    struct CreateExerciseBody: Encodable {
        let name: String
        let weight_increment: Double
    }
    return try await post("/exercises", body: CreateExerciseBody(name: name, weight_increment: weightIncrement))
}

func updateExercise(id: Int, name: String? = nil, weightIncrement: Double? = nil) async throws -> Exercise {
    struct UpdateExerciseBody: Encodable {
        let name: String?
        let weight_increment: Double?
    }
    var request = try buildRequest(path: "/exercises/\(id)", method: "PUT")
    request.httpBody = try encoder.encode(UpdateExerciseBody(name: name, weight_increment: weightIncrement))
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return try await performRequest(request)
}

func deleteExercise(id: Int) async throws {
    try await delete("/exercises/\(id)")
}

func getExerciseHistory(id: Int) async throws -> ExerciseHistory {
    try await get("/exercises/\(id)/history")
}
```

#### 3.4 Add Plan endpoints

```swift
// MARK: - Plans

func getPlans() async throws -> [Plan] {
    try await get("/plans")
}

func getPlan(id: Int) async throws -> Plan {
    try await get("/plans/\(id)")
}

func createPlan(name: String, durationWeeks: Int = 6) async throws -> Plan {
    struct CreatePlanBody: Encodable {
        let name: String
        let duration_weeks: Int
    }
    return try await post("/plans", body: CreatePlanBody(name: name, duration_weeks: durationWeeks))
}

func updatePlan(id: Int, name: String? = nil, durationWeeks: Int? = nil) async throws -> Plan {
    struct UpdatePlanBody: Encodable {
        let name: String?
        let duration_weeks: Int?
    }
    var request = try buildRequest(path: "/plans/\(id)", method: "PUT")
    request.httpBody = try encoder.encode(UpdatePlanBody(name: name, duration_weeks: durationWeeks))
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return try await performRequest(request)
}

func deletePlan(id: Int) async throws {
    try await delete("/plans/\(id)")
}
```

#### 3.5 Add Mesocycle endpoints

```swift
// MARK: - Mesocycles

func getMesocycles() async throws -> [Mesocycle] {
    try await get("/mesocycles")
}

func getActiveMesocycle() async throws -> Mesocycle? {
    try await getOptional("/mesocycles/active")
}

func getMesocycle(id: Int) async throws -> Mesocycle {
    try await get("/mesocycles/\(id)")
}

func createMesocycle(planId: Int, startDate: Date) async throws -> Mesocycle {
    struct CreateMesocycleBody: Encodable {
        let plan_id: Int
        let start_date: String
    }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    let dateString = formatter.string(from: startDate)
    return try await post("/mesocycles", body: CreateMesocycleBody(plan_id: planId, start_date: dateString))
}

func startMesocycle(id: Int) async throws -> Mesocycle {
    try await put("/mesocycles/\(id)/start")
}

func completeMesocycle(id: Int) async throws -> Mesocycle {
    try await put("/mesocycles/\(id)/complete")
}

func cancelMesocycle(id: Int) async throws -> Mesocycle {
    try await put("/mesocycles/\(id)/cancel")
}
```

#### 3.6 Add Stretch Session endpoints

```swift
// MARK: - Stretch Sessions

func getStretchSessions() async throws -> [StretchSession] {
    try await get("/stretch-sessions")
}

func getLatestStretchSession() async throws -> StretchSession? {
    try await getOptional("/stretch-sessions/latest")
}

func createStretchSession(_ session: StretchSession) async throws -> StretchSession {
    // Encode session directly (model already has CodingKeys)
    return try await post("/stretch-sessions", body: session)
}
```

#### 3.7 Add Meditation Session endpoints

```swift
// MARK: - Meditation Sessions

func getMeditationSessions() async throws -> [MeditationSession] {
    try await get("/meditation-sessions")
}

func getLatestMeditationSession() async throws -> MeditationSession? {
    try await getOptional("/meditation-sessions/latest")
}

func createMeditationSession(_ session: MeditationSession) async throws -> MeditationSession {
    return try await post("/meditation-sessions", body: session)
}

func getMeditationStats() async throws -> MeditationStats {
    try await get("/meditation-sessions/stats")
}
```

#### 3.8 Add Calendar endpoints

```swift
// MARK: - Calendar

func getCalendarData(year: Int, month: Int, timezoneOffset: Int? = nil) async throws -> CalendarData {
    var queryItems: [URLQueryItem]? = nil
    if let tz = timezoneOffset {
        queryItems = [URLQueryItem(name: "tz", value: String(tz))]
    }
    return try await get("/calendar/\(year)/\(month)", queryItems: queryItems)
}
```

#### 3.9 Add missing model types

Create `Models/CalendarActivity.swift` updates or new file if `CalendarData` type doesn't exist:

```swift
// Add to existing CalendarActivity.swift or create new

/// Response from calendar API
struct CalendarData: Codable {
    let startDate: String
    let endDate: String
    let days: [String: CalendarDayData]

    enum CodingKeys: String, CodingKey {
        case startDate = "start_date"
        case endDate = "end_date"
        case days
    }
}

/// Stats from meditation API
struct MeditationStats: Codable {
    let totalSessions: Int
    let totalMinutes: Int
    let currentStreak: Int
    let longestStreak: Int

    enum CodingKeys: String, CodingKey {
        case totalSessions = "total_sessions"
        case totalMinutes = "total_minutes"
        case currentStreak = "current_streak"
        case longestStreak = "longest_streak"
    }
}

/// Exercise history from API
struct ExerciseHistory: Codable {
    let exercise: Exercise
    let entries: [ExerciseHistoryEntry]
    let personalRecord: PersonalRecord?

    enum CodingKeys: String, CodingKey {
        case exercise
        case entries
        case personalRecord = "personal_record"
    }
}

struct ExerciseHistoryEntry: Codable, Identifiable {
    var id: Int { workoutId }
    let workoutId: Int
    let date: Date
    let weekNumber: Int
    let sets: [HistorySet]

    enum CodingKeys: String, CodingKey {
        case workoutId = "workout_id"
        case date
        case weekNumber = "week_number"
        case sets
    }
}

struct HistorySet: Codable {
    let setNumber: Int
    let targetReps: Int
    let targetWeight: Double
    let actualReps: Int?
    let actualWeight: Double?
    let status: SetStatus

    enum CodingKeys: String, CodingKey {
        case setNumber = "set_number"
        case targetReps = "target_reps"
        case targetWeight = "target_weight"
        case actualReps = "actual_reps"
        case actualWeight = "actual_weight"
        case status
    }
}

struct PersonalRecord: Codable {
    let weight: Double
    let reps: Int
    let date: Date
}
```

### Success Criteria

- [ ] All endpoint methods compile and follow consistent patterns
- [ ] Request bodies use correct snake_case field names
- [ ] Optional endpoints return `nil` instead of throwing for empty data
- [ ] All new model types decode correctly from server responses

### Confirmation Gate
Test each endpoint category against running dev server.

---

## Phase 4: Mock Client & Testing Support

### Overview
Create a mock implementation for SwiftUI previews and unit tests.

### Changes Required

#### 4.1 Create `Services/MockAPIClient.swift` (new file)

```swift
import Foundation

/// Mock API client for previews and testing
final class MockAPIClient: APIClientProtocol {
    // Configuration for mock behavior
    var shouldFail = false
    var mockError: APIError?
    var delay: TimeInterval = 0

    // Mock data storage
    var mockWorkout: Workout?
    var mockStretchSession: StretchSession?
    var mockMeditationSession: MeditationSession?
    var mockExercises: [Exercise] = []
    var mockPlans: [Plan] = []
    var mockMesocycles: [Mesocycle] = []

    init() {
        // Set up default mock data
        mockWorkout = Workout.mockTodayWorkout
        mockStretchSession = StretchSession.mockRecentSession
        mockMeditationSession = MeditationSession.mockRecentSession
    }

    private func simulateDelay() async {
        if delay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }
    }

    private func checkForError() throws {
        if shouldFail {
            throw mockError ?? APIError(code: .internalError, message: "Mock error", statusCode: 500, details: nil)
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
        mockWorkout?.status = .inProgress
        mockWorkout?.startedAt = Date()
        return mockWorkout!
    }

    func completeWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        mockWorkout?.status = .completed
        mockWorkout?.completedAt = Date()
        return mockWorkout!
    }

    func skipWorkout(id: Int) async throws -> Workout {
        await simulateDelay()
        try checkForError()
        mockWorkout?.status = .skipped
        return mockWorkout!
    }

    // MARK: - Workout Sets (stub implementations)

    func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        // Return a mock set
        return WorkoutSet(id: id, workoutId: 1, exerciseId: 1, setNumber: 1,
                         targetReps: actualReps, targetWeight: actualWeight,
                         actualReps: actualReps, actualWeight: actualWeight, status: .completed)
    }

    func skipSet(id: Int) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(id: id, workoutId: 1, exerciseId: 1, setNumber: 1,
                         targetReps: 10, targetWeight: 100,
                         actualReps: nil, actualWeight: nil, status: .skipped)
    }

    func unlogSet(id: Int) async throws -> WorkoutSet {
        await simulateDelay()
        try checkForError()
        return WorkoutSet(id: id, workoutId: 1, exerciseId: 1, setNumber: 1,
                         targetReps: 10, targetWeight: 100,
                         actualReps: nil, actualWeight: nil, status: .pending)
    }

    // MARK: - Stretch/Meditation Sessions

    func getStretchSessions() async throws -> [StretchSession] {
        await simulateDelay()
        try checkForError()
        return mockStretchSession.map { [$0] } ?? []
    }

    func getLatestStretchSession() async throws -> StretchSession? {
        await simulateDelay()
        try checkForError()
        return mockStretchSession
    }

    func createStretchSession(_ session: StretchSession) async throws -> StretchSession {
        await simulateDelay()
        try checkForError()
        mockStretchSession = session
        return session
    }

    func getMeditationSessions() async throws -> [MeditationSession] {
        await simulateDelay()
        try checkForError()
        return mockMeditationSession.map { [$0] } ?? []
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

    // ... (implement remaining protocol methods with similar patterns)

    // MARK: - Exercises, Plans, Mesocycles, Calendar
    // (Stub implementations following same pattern)

    func getExercises() async throws -> [Exercise] { mockExercises }
    func getExercise(id: Int) async throws -> Exercise { throw APIError.notFound("Not implemented") }
    func createExercise(name: String, weightIncrement: Double) async throws -> Exercise { throw APIError.notFound("Not implemented") }
    func updateExercise(id: Int, name: String?, weightIncrement: Double?) async throws -> Exercise { throw APIError.notFound("Not implemented") }
    func deleteExercise(id: Int) async throws { }

    func getPlans() async throws -> [Plan] { mockPlans }
    func getPlan(id: Int) async throws -> Plan { throw APIError.notFound("Not implemented") }
    func createPlan(name: String, durationWeeks: Int) async throws -> Plan { throw APIError.notFound("Not implemented") }
    func updatePlan(id: Int, name: String?, durationWeeks: Int?) async throws -> Plan { throw APIError.notFound("Not implemented") }
    func deletePlan(id: Int) async throws { }

    func getMesocycles() async throws -> [Mesocycle] { mockMesocycles }
    func getActiveMesocycle() async throws -> Mesocycle? { nil }
    func getMesocycle(id: Int) async throws -> Mesocycle { throw APIError.notFound("Not implemented") }
    func createMesocycle(planId: Int, startDate: Date) async throws -> Mesocycle { throw APIError.notFound("Not implemented") }
    func startMesocycle(id: Int) async throws -> Mesocycle { throw APIError.notFound("Not implemented") }
    func completeMesocycle(id: Int) async throws -> Mesocycle { throw APIError.notFound("Not implemented") }
    func cancelMesocycle(id: Int) async throws -> Mesocycle { throw APIError.notFound("Not implemented") }

    func getCalendarData(year: Int, month: Int, timezoneOffset: Int?) async throws -> CalendarData {
        await simulateDelay()
        try checkForError()
        return CalendarData(startDate: "\(year)-\(month)-01", endDate: "\(year)-\(month)-28", days: [:])
    }
}
```

#### 4.2 Add dependency injection support to `App/BradOSApp.swift`

```swift
// Add to BradOSApp.swift or create new environment key

import SwiftUI

// Environment key for API client
struct APIClientKey: EnvironmentKey {
    static let defaultValue: APIClientProtocol = APIClient.shared
}

extension EnvironmentValues {
    var apiClient: APIClientProtocol {
        get { self[APIClientKey.self] }
        set { self[APIClientKey.self] = newValue }
    }
}

// Usage in views:
// @Environment(\.apiClient) var apiClient
```

### Success Criteria

- [ ] `MockAPIClient` conforms to `APIClientProtocol`
- [ ] Mock client can be configured for success/failure/delay scenarios
- [ ] Environment injection allows swapping real/mock clients
- [ ] SwiftUI previews can use mock client

### Confirmation Gate
Use mock client in a SwiftUI preview to verify it works correctly.

---

## Phase 5: Integration & Documentation

### Overview
Integrate the API client into the app and document usage patterns.

### Changes Required

#### 5.1 Update `App/AppState.swift` to include API client reference

```swift
// In AppState class
@Published var apiClient: APIClientProtocol = APIClient.shared
```

#### 5.2 Create usage example in existing view

Update `Views/Today/TodayDashboardView.swift` to demonstrate API usage pattern:

```swift
// Example usage in a ViewModel (to be created by Dashboard plan)
@MainActor
class ExampleViewModel: ObservableObject {
    @Published var workout: Workout?
    @Published var isLoading = false
    @Published var error: APIError?

    private let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    func loadWorkout() async {
        isLoading = true
        error = nil

        do {
            workout = try await apiClient.getTodaysWorkout()
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.network(error)
        }

        isLoading = false
    }
}
```

#### 5.3 Add Xcode project file references

Ensure all new files are added to the Xcode project:
- `Services/APIClient.swift`
- `Services/APIClientProtocol.swift`
- `Services/APIConfiguration.swift`
- `Services/APIError.swift`
- `Services/APIResponse.swift`
- `Services/MockAPIClient.swift`

### Success Criteria

- [ ] API client is accessible throughout the app
- [ ] Example ViewModel demonstrates correct usage pattern
- [ ] All files compile without errors
- [ ] App launches and can make API calls (when server running)

### Confirmation Gate
Launch app in simulator with dev server running, verify API call succeeds.

---

## Testing Strategy

### Unit Tests

| Test | Description |
|------|-------------|
| `APIResponseDecodingTests` | Verify success/error response parsing |
| `APIErrorTests` | Verify error code mapping |
| `APIClientTests` | Test with mocked URLSession |
| `MockAPIClientTests` | Verify mock behavior |

### Integration Tests

| Test | Description |
|------|-------------|
| Real server connectivity | Test against running dev server |
| Error response handling | Verify 404, 400, 409 handling |
| Date encoding/decoding | Verify ISO 8601 round-trip |

### Manual Testing

- [ ] Simulator can reach localhost:3001
- [ ] Physical device can reach dev server (requires IP configuration)
- [ ] All endpoint methods return expected data
- [ ] Error states display correctly in UI

---

## File Structure Summary

```
ios/BradOS/BradOS/
├── Services/           (NEW)
│   ├── APIClient.swift
│   ├── APIClientProtocol.swift
│   ├── APIConfiguration.swift
│   ├── APIError.swift
│   ├── APIResponse.swift
│   └── MockAPIClient.swift
├── Models/
│   ├── ... (existing)
│   └── CalendarActivity.swift  (updates)
└── App/
    └── BradOSApp.swift  (updates for DI)
```

---

## References

- Server routes: `packages/server/src/routes/*.ts`
- API types: `packages/shared/src/types/api.ts`
- Web client examples: `packages/client/src/api/*.ts`
- iOS models: `ios/BradOS/BradOS/Models/*.swift`
- iOS specs: `ios/specs/*.md`
