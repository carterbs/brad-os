import Foundation
import BradOSCore

// MARK: - Strava, Cycling, Weight & Health Sync, Calendar

extension APIClient {

    // MARK: - Strava Token Sync

    func syncStravaTokens(_ tokens: StravaTokens) async throws {
        struct SyncTokensBody: Encodable {
            let accessToken: String
            let refreshToken: String
            let expiresAt: Int
            let athleteId: Int
        }
        struct SyncTokensResponse: Decodable {
            let synced: Bool
        }
        let _: SyncTokensResponse = try await post("/strava/tokens", body: SyncTokensBody(
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            athleteId: tokens.athleteId
        ))
    }

    // MARK: - Cycling

    func getCyclingActivities(limit: Int? = nil) async throws -> [CyclingActivityModel] {
        var queryItems: [URLQueryItem]?
        if let limit = limit {
            queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        }
        return try await get("/cycling/activities", queryItems: queryItems, cacheTTL: CacheTTL.medium)
    }

    func getCyclingTrainingLoad() async throws -> CyclingTrainingLoadResponse {
        try await get("/cycling/training-load", cacheTTL: CacheTTL.medium)
    }

    func getCurrentFTP() async throws -> FTPEntryResponse? {
        try await getOptional("/cycling/ftp", cacheTTL: CacheTTL.long)
    }

    func getCurrentBlock() async throws -> TrainingBlockResponse? {
        try await getOptional("/cycling/block", cacheTTL: CacheTTL.long)
    }

    func getVO2Max() async throws -> VO2MaxResponse {
        try await get("/cycling/vo2max", cacheTTL: CacheTTL.long)
    }

    func getEFHistory() async throws -> [EFDataPoint] {
        try await get("/cycling/ef", cacheTTL: CacheTTL.medium)
    }

    func createFTP(value: Int, date: String, source: String = "manual") async throws -> FTPEntryResponse {
        struct CreateFTPBody: Encodable {
            let value: Int
            let date: String
            let source: String
        }
        let result: FTPEntryResponse = try await post(
            "/cycling/ftp",
            body: CreateFTPBody(value: value, date: date, source: source)
        )
        invalidateCache(matching: "/cycling/ftp")
        return result
    }

    func getFTPHistory() async throws -> [FTPEntryResponse] {
        try await get("/cycling/ftp/history", cacheTTL: CacheTTL.long)
    }

    func createBlock(
        startDate: String,
        endDate: String,
        goals: [String],
        daysPerWeek: Int? = nil,
        weeklySessions: [WeeklySessionModel]? = nil,
        preferredDays: [Int]? = nil,
        experienceLevel: ExperienceLevel? = nil,
        weeklyHoursAvailable: Double? = nil
    ) async throws -> TrainingBlockResponse {
        struct CreateBlockBody: Encodable {
            let startDate: String
            let endDate: String
            let goals: [String]
            let daysPerWeek: Int?
            let weeklySessions: [WeeklySessionModel]?
            let preferredDays: [Int]?
            let experienceLevel: String?
            let weeklyHoursAvailable: Double?
        }
        let result: TrainingBlockResponse = try await post("/cycling/block", body: CreateBlockBody(
            startDate: startDate,
            endDate: endDate,
            goals: goals,
            daysPerWeek: daysPerWeek,
            weeklySessions: weeklySessions,
            preferredDays: preferredDays,
            experienceLevel: experienceLevel?.rawValue,
            weeklyHoursAvailable: weeklyHoursAvailable
        ))
        invalidateCache(matching: "/cycling/block")
        return result
    }

    func generateSchedule(_ request: GenerateScheduleRequest) async throws -> GenerateScheduleResponse {
        try await post("/cycling-coach/generate-schedule", body: request)
    }

    func getCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> CyclingCoachRecommendation {
        try await post("/cycling-coach/recommend", body: body)
    }

    func getTodayCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> TodayCoachRecommendation {
        // Backend expects JS-style offset: minutes *behind* UTC (positive = west of UTC)
        // iOS secondsFromGMT is seconds *ahead* of UTC (negative = west of UTC), so negate
        let timezoneOffset = -(TimeZone.current.secondsFromGMT() / 60)
        let result: TodayCoachRecommendation = try await post("/today-coach/recommend", body: body, headers: [
            "x-timezone-offset": String(timezoneOffset)
        ])
        return result
    }

    func syncCyclingActivities() async throws -> CyclingSyncResponse {
        let result: CyclingSyncResponse = try await post("/cycling/sync", body: EmptyBody())
        invalidateCache(matching: "/cycling/activities")
        invalidateCache(matching: "/cycling/training-load")
        return result
    }

    func completeBlock(id: String) async throws {
        struct CompleteResponse: Decodable { let completed: Bool }
        let _: CompleteResponse = try await put("/cycling/block/\(id)/complete")
        invalidateCache(matching: "/cycling/block")
    }

    // MARK: - Weight & Health Sync

    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry] {
        try await get(
            "/health-sync/weight",
            queryItems: [URLQueryItem(name: "days", value: String(days))],
            cacheTTL: CacheTTL.long
        )
    }

    func getLatestWeight() async throws -> WeightHistoryEntry? {
        try await getOptional("/health-sync/weight", cacheTTL: CacheTTL.medium)
    }

    func logWeightEntry(weightLbs: Double, date: String, source: String = "manual") async throws -> WeightHistoryEntry {
        struct LogWeightBody: Encodable {
            let weightLbs: Double
            let date: String
            let source: String
        }
        let result: WeightHistoryEntry = try await post(
            "/health-sync/weight",
            body: LogWeightBody(weightLbs: weightLbs, date: date, source: source),
        )
        invalidateCache(matching: "/health-sync/weight")
        return result
    }

    func syncWeightBulk(weights: [WeightSyncEntry]) async throws -> Int {
        struct BulkWeightBody: Encodable {
            let weights: [WeightSyncEntry]
        }
        struct BulkWeightResponse: Decodable {
            let added: Int
        }
        let response: BulkWeightResponse = try await post(
            "/health-sync/weight/bulk",
            body: BulkWeightBody(weights: weights)
        )
        if response.added > 0 { invalidateCache(matching: "/health-sync/weight") }
        return response.added
    }

    func syncHRVBulk(entries: [HRVSyncEntry]) async throws -> Int {
        struct BulkHRVBody: Encodable {
            let entries: [HRVSyncEntry]
        }
        struct BulkHRVResponse: Decodable {
            let added: Int
        }
        let response: BulkHRVResponse = try await post(
            "/health-sync/hrv/bulk",
            body: BulkHRVBody(entries: entries)
        )
        if response.added > 0 { invalidateCache(matching: "/health-sync/hrv") }
        return response.added
    }

    func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry] {
        try await get(
            "/health-sync/hrv",
            queryItems: [URLQueryItem(name: "days", value: String(days))],
            cacheTTL: CacheTTL.long
        )
    }

    func syncRHRBulk(entries: [RHRSyncEntry]) async throws -> Int {
        struct BulkRHRBody: Encodable {
            let entries: [RHRSyncEntry]
        }
        struct BulkRHRResponse: Decodable {
            let added: Int
        }
        let response: BulkRHRResponse = try await post(
            "/health-sync/rhr/bulk",
            body: BulkRHRBody(entries: entries)
        )
        if response.added > 0 { invalidateCache(matching: "/health-sync/rhr") }
        return response.added
    }

    func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry] {
        try await get(
            "/health-sync/rhr",
            queryItems: [URLQueryItem(name: "days", value: String(days))],
            cacheTTL: CacheTTL.long
        )
    }

    func syncSleepBulk(entries: [SleepSyncEntry]) async throws -> Int {
        struct BulkSleepBody: Encodable {
            let entries: [SleepSyncEntry]
        }
        struct BulkSleepResponse: Decodable {
            let added: Int
        }
        let response: BulkSleepResponse = try await post(
            "/health-sync/sleep/bulk",
            body: BulkSleepBody(entries: entries)
        )
        if response.added > 0 { invalidateCache(matching: "/health-sync/sleep") }
        return response.added
    }

    func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry] {
        try await get(
            "/health-sync/sleep",
            queryItems: [URLQueryItem(name: "days", value: String(days))],
            cacheTTL: CacheTTL.long
        )
    }

    func getLatestRecovery() async throws -> RecoverySnapshotResponse? {
        try await getOptional("/health-sync/recovery", cacheTTL: CacheTTL.medium)
    }

    func syncRecovery(
        recovery: RecoverySyncData,
        baseline: RecoveryBaselineSyncData?
    ) async throws -> RecoverySyncResponse {
        struct SyncBody: Encodable {
            let recovery: RecoverySyncData
            let baseline: RecoveryBaselineSyncData?
        }
        let result: RecoverySyncResponse = try await post(
            "/health-sync/sync",
            body: SyncBody(recovery: recovery, baseline: baseline)
        )
        invalidateCache(matching: "/health-sync/recovery")
        return result
    }

    func getWeightGoal() async throws -> WeightGoalResponse? {
        try await getOptional("/cycling/weight-goal", cacheTTL: CacheTTL.long)
    }

    func saveWeightGoal(
        targetWeightLbs: Double, targetDate: String,
        startWeightLbs: Double, startDate: String
    ) async throws -> WeightGoalResponse {
        struct SaveWeightGoalBody: Encodable {
            let targetWeightLbs: Double
            let targetDate: String
            let startWeightLbs: Double
            let startDate: String
        }
        let result: WeightGoalResponse = try await post("/cycling/weight-goal", body: SaveWeightGoalBody(
            targetWeightLbs: targetWeightLbs,
            targetDate: targetDate,
            startWeightLbs: startWeightLbs,
            startDate: startDate
        ))
        invalidateCache(matching: "/cycling/weight-goal")
        return result
    }

    // MARK: - Calendar

    func getCalendarData(year: Int, month: Int, timezoneOffset: Int? = nil) async throws -> CalendarData {
        var queryItems: [URLQueryItem]?
        if let tz = timezoneOffset {
            queryItems = [URLQueryItem(name: "tz", value: String(tz))]
        }
        return try await get("/calendar/\(year)/\(month)", queryItems: queryItems, cacheTTL: CacheTTL.medium)
    }
}
