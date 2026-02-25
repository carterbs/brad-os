import Foundation

/// Protocol for cycling-specific API operations
public protocol CyclingAPIClientProtocol: Sendable {
    // MARK: - Cycling Activities

    func getCyclingActivities(limit: Int?) async throws -> [CyclingActivityModel]
    func getCyclingTrainingLoad() async throws -> CyclingTrainingLoadResponse

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
}
