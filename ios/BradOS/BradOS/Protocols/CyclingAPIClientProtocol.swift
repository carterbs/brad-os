import Foundation
import BradOSCore

/// Protocol for cycling-specific API operations.
/// Separate from APIClientProtocol because cycling types live in the app target, not BradOSCore.
protocol CyclingAPIClientProtocol: APIClientProtocol {
    // MARK: - Strava

    func syncStravaTokens(_ tokens: StravaTokens) async throws

    // MARK: - Cycling Activities

    func getCyclingActivities(limit: Int?) async throws -> [CyclingActivityModel]
    func getCyclingTrainingLoad() async throws -> CyclingTrainingLoadResponse
    func syncCyclingActivities() async throws -> CyclingSyncResponse

    // MARK: - FTP

    func getCurrentFTP() async throws -> FTPEntryResponse?
    func createFTP(value: Int, date: String, source: String) async throws -> FTPEntryResponse
    func getFTPHistory() async throws -> [FTPEntryResponse]

    // MARK: - Training Block

    func getCurrentBlock() async throws -> TrainingBlockResponse?
    func createBlock(
        startDate: String, endDate: String, goals: [String],
        daysPerWeek: Int?, weeklySessions: [WeeklySessionModel]?,
        preferredDays: [Int]?, experienceLevel: ExperienceLevel?,
        weeklyHoursAvailable: Double?
    ) async throws -> TrainingBlockResponse
    func completeBlock(id: String) async throws

    // MARK: - VO2 Max & Efficiency

    func getVO2Max() async throws -> VO2MaxResponse
    func getEFHistory() async throws -> [EFDataPoint]

    // MARK: - Coach

    func generateSchedule(_ request: GenerateScheduleRequest) async throws -> GenerateScheduleResponse
    func getCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> CyclingCoachRecommendation
    func getTodayCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> TodayCoachRecommendation

    // MARK: - Weight & Health Sync

    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry]
    func getLatestWeight() async throws -> WeightHistoryEntry?
    func syncWeightBulk(weights: [WeightSyncEntry]) async throws -> Int
    func syncHRVBulk(entries: [HRVSyncEntry]) async throws -> Int
    func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry]
    func syncRHRBulk(entries: [RHRSyncEntry]) async throws -> Int
    func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry]
    func syncSleepBulk(entries: [SleepSyncEntry]) async throws -> Int
    func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry]
    func getLatestRecovery() async throws -> RecoverySnapshotResponse?
    func syncRecovery(recovery: RecoverySyncData, baseline: RecoveryBaselineSyncData?) async throws -> RecoverySyncResponse
    func getWeightGoal() async throws -> WeightGoalResponse?
    func saveWeightGoal(
        targetWeightLbs: Double, targetDate: String,
        startWeightLbs: Double, startDate: String
    ) async throws -> WeightGoalResponse
}

// APIClient already has all these methods, so conformance is automatic
extension APIClient: CyclingAPIClientProtocol {}
