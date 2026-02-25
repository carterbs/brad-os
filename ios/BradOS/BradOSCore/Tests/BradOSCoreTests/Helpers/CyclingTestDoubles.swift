import Foundation
@testable import BradOSCore

// MARK: - Cycling API test gates

actor CyclingAPICallGate {
    private let expectedCalls: Set<CyclingAPICall>
    private var startedCalls: Set<CyclingAPICall> = []
    private var isReleased = false
    private var releaseContinuations: [CheckedContinuation<Void, Never>] = []

    init(expectedCalls: [CyclingAPICall]) {
        self.expectedCalls = Set(expectedCalls)
    }

    init(expectedCalls: Set<CyclingAPICall> = Set(CyclingAPICall.allCases)) {
        self.init(expectedCalls: Array(expectedCalls))
    }

    func markStarted(_ call: CyclingAPICall) {
        startedCalls.insert(call)
    }

    func waitUntilAllStarted(timeoutNanoseconds: UInt64) async -> Bool {
        if startedCalls.isSuperset(of: expectedCalls) {
            return true
        }

        let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
        while !startedCalls.isSuperset(of: expectedCalls) {
            if DispatchTime.now().uptimeNanoseconds >= deadline {
                return false
            }

            let remaining = deadline - DispatchTime.now().uptimeNanoseconds
            let delay = min(UInt64(25_000_000), remaining)
            try? await Task.sleep(nanoseconds: delay)
        }

        return true
    }

    func waitUntilReleased() async {
        if isReleased {
            return
        }

        await withCheckedContinuation { continuation in
            releaseContinuations.append(continuation)
        }
    }

    func releaseAll() {
        isReleased = true
        let continuations = releaseContinuations
        releaseContinuations.removeAll()
        continuations.forEach { $0.resume() }
    }
}

// MARK: - Cycling API mock

enum CyclingAPICall: String, CaseIterable, Hashable {
    case getCyclingActivities
    case getCyclingTrainingLoad
    case getCurrentFTP
    case createFTP
    case getFTPHistory
    case getCurrentBlock
    case createBlock
    case completeBlock
    case getVO2Max
    case getEFHistory
}

final class MockCyclingAPIClient: CyclingAPIClientProtocol {
    // Results
    var cyclingActivitiesResult: Result<[CyclingActivityModel], Error> = .success([])
    var cyclingTrainingLoadResult: Result<CyclingTrainingLoadResponse, Error> = .success(
        CyclingTrainingLoadResponse(atl: 0, ctl: 0, tsb: 0)
    )
    var currentFTPResult: Result<FTPEntryResponse?, Error> = .success(nil)
    var createFTPResult: Result<FTPEntryResponse, Error> = .success(
        FTPEntryResponse(id: "ftp-default", value: 0, date: "2026-01-01", source: "manual")
    )
    var ftpHistoryResult: Result<[FTPEntryResponse], Error> = .success([])
    var currentBlockResult: Result<TrainingBlockResponse?, Error> = .success(nil)
    var createBlockResult: Result<TrainingBlockResponse, Error> = .success(
        TrainingBlockResponse(
            id: "block-1",
            startDate: "2026-01-01",
            endDate: "2026-02-26",
            currentWeek: 1,
            goals: ["regain_fitness"],
            status: "active",
            daysPerWeek: nil,
            weeklySessions: nil,
            preferredDays: nil,
            experienceLevel: nil,
            weeklyHoursAvailable: nil
        )
    )
    var completeBlockResult: Result<Void, Error> = .success(())
    var vo2MaxResult: Result<VO2MaxResponse, Error> = .success(
        VO2MaxResponse(latest: nil, history: [])
    )
    var efHistoryResult: Result<[EFDataPoint], Error> = .success([])

    private(set) var callCounts: [CyclingAPICall: Int] = [:]
    private(set) var lastCreateFTPRequest: (value: Int, date: String, source: String)?
    private(set) var lastCompleteBlockID: String?
    private(set) var lastActivitiesLimit: Int?

    var onCall: (@Sendable (CyclingAPICall) async -> Void)?

    var completeBlockCalled = false
    private let stateLock = NSLock()

    private func trackCall(_ call: CyclingAPICall) async {
        stateLock.lock()
        callCounts[call, default: 0] += 1
        stateLock.unlock()
        await onCall?(call)
    }

    func getCyclingActivities(limit: Int?) async throws -> [CyclingActivityModel] {
        await trackCall(.getCyclingActivities)
        stateLock.lock()
        lastActivitiesLimit = limit
        stateLock.unlock()
        return try cyclingActivitiesResult.get()
    }

    func getCyclingTrainingLoad() async throws -> CyclingTrainingLoadResponse {
        await trackCall(.getCyclingTrainingLoad)
        return try cyclingTrainingLoadResult.get()
    }

    func getCurrentFTP() async throws -> FTPEntryResponse? {
        await trackCall(.getCurrentFTP)
        return try currentFTPResult.get()
    }

    func createFTP(value: Int, date: String, source: String) async throws -> FTPEntryResponse {
        await trackCall(.createFTP)
        stateLock.lock()
        lastCreateFTPRequest = (value: value, date: date, source: source)
        stateLock.unlock()
        return try createFTPResult.get()
    }

    func getFTPHistory() async throws -> [FTPEntryResponse] {
        await trackCall(.getFTPHistory)
        return try ftpHistoryResult.get()
    }

    func getCurrentBlock() async throws -> TrainingBlockResponse? {
        await trackCall(.getCurrentBlock)
        return try currentBlockResult.get()
    }

    func createBlock(
        startDate: String,
        endDate: String,
        goals: [String],
        daysPerWeek: Int?,
        weeklySessions: [WeeklySessionModel]?,
        preferredDays: [Int]?,
        experienceLevel: ExperienceLevel?,
        weeklyHoursAvailable: Double?
    ) async throws -> TrainingBlockResponse {
        await trackCall(.createBlock)
        return try createBlockResult.get()
    }

    func completeBlock(id: String) async throws {
        await trackCall(.completeBlock)
        stateLock.lock()
        lastCompleteBlockID = id
        stateLock.unlock()
        do {
            try completeBlockResult.get()
            stateLock.lock()
            completeBlockCalled = true
            stateLock.unlock()
        } catch {
            throw error
        }
    }

    func getVO2Max() async throws -> VO2MaxResponse {
        await trackCall(.getVO2Max)
        return try vo2MaxResult.get()
    }

    func getEFHistory() async throws -> [EFDataPoint] {
        await trackCall(.getEFHistory)
        return try efHistoryResult.get()
    }
}

// MARK: - Date and fixture helpers

func fixedDate(_ year: Int, _ month: Int, _ day: Int, calendar: Calendar = .init(identifier: .gregorian)) -> Date {
    calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
}

func isoDateString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter.string(from: date)
}

func dateInCurrentWeek(_ dayOffset: Int, from referenceDate: Date = Date(), calendar: Calendar = .current) -> Date {
    let startOfWeek = calendar.dateInterval(of: .weekOfYear, for: referenceDate)?.start ?? referenceDate
    return calendar.date(byAdding: .day, value: dayOffset, to: startOfWeek) ?? referenceDate
}

func makeCyclingActivity(
    id: String = "activity-\(UUID().uuidString)",
    date: Date = Date(),
    type: CyclingActivityModel.CyclingWorkoutType = .fun,
    durationMinutes: Int = 60,
    normalizedPower: Double = 200,
    avgHeartRate: Double = 150,
    tss: Double = 100
) -> CyclingActivityModel {
    CyclingActivityModel(
        id: id,
        date: date,
        durationMinutes: durationMinutes,
        normalizedPower: normalizedPower,
        avgHeartRate: avgHeartRate,
        tss: tss,
        type: type,
        ef: nil,
        peak5MinPower: nil,
        hrCompleteness: nil
    )
}

func makeWeeklySession(
    order: Int,
    sessionType: SessionType,
    pelotonClassTypes: [String] = [],
    suggestedDurationMinutes: Int = 60,
    description: String = ""
) -> WeeklySessionModel {
    WeeklySessionModel(
        order: order,
        sessionType: sessionType.rawValue,
        pelotonClassTypes: pelotonClassTypes.isEmpty ? [sessionType.rawValue] : pelotonClassTypes,
        suggestedDurationMinutes: suggestedDurationMinutes,
        description: description.isEmpty ? sessionType.displayName : description
    )
}
