import Foundation
import Combine
@testable import BradOS
import BradOSCore

// MARK: - Cycling API mock

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

    var completeBlockCalled = false

    func getCyclingActivities(limit: Int?) async throws -> [CyclingActivityModel] {
        try cyclingActivitiesResult.get()
    }

    func getCyclingTrainingLoad() async throws -> CyclingTrainingLoadResponse {
        try cyclingTrainingLoadResult.get()
    }

    func getCurrentFTP() async throws -> FTPEntryResponse? {
        try currentFTPResult.get()
    }

    func createFTP(value: Int, date: String, source: String) async throws -> FTPEntryResponse {
        try createFTPResult.get()
    }

    func getFTPHistory() async throws -> [FTPEntryResponse] {
        try ftpHistoryResult.get()
    }

    func getCurrentBlock() async throws -> TrainingBlockResponse? {
        try currentBlockResult.get()
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
        try createBlockResult.get()
    }

    func completeBlock(id: String) async throws {
        do {
            try completeBlockResult.get()
            completeBlockCalled = true
        } catch {
            throw error
        }
    }

    func getVO2Max() async throws -> VO2MaxResponse {
        try vo2MaxResult.get()
    }

    func getEFHistory() async throws -> [EFDataPoint] {
        try efHistoryResult.get()
    }
}

// MARK: - Weight goal API mock

final class MockWeightGoalAPIClient: WeightGoalAPIClientProtocol {
    var latestWeightResult: Result<WeightHistoryEntry?, Error> = .success(nil)
    var weightHistoryResult: Result<[WeightHistoryEntry], Error> = .success([])
    var weightGoalResult: Result<WeightGoalResponse?, Error> = .success(nil)
    var saveWeightGoalResult: Result<WeightGoalResponse, Error> = .success(
        WeightGoalResponse(
            targetWeightLbs: 180,
            targetDate: "2026-03-01",
            startWeightLbs: 190,
            startDate: "2026-01-01"
        )
    )

    func getLatestWeight() async throws -> WeightHistoryEntry? {
        try latestWeightResult.get()
    }

    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry] {
        try weightHistoryResult.get()
    }

    func getWeightGoal() async throws -> WeightGoalResponse? {
        try weightGoalResult.get()
    }

    func saveWeightGoal(
        targetWeightLbs: Double,
        targetDate: String,
        startWeightLbs: Double,
        startDate: String
    ) async throws -> WeightGoalResponse {
        try saveWeightGoalResult.get()
    }
}

// MARK: - TTS audio mock

final class MockTTSAudioEngine: TTSAudioEngineProtocol {
    private let isPlayingSubject = CurrentValueSubject<Bool, Never>(false)
    private let lock = NSLock()

    var isPlaying: Bool {
        isPlayingSubject.value
    }

    var isPlayingPublisher: AnyPublisher<Bool, Never> {
        isPlayingSubject.eraseToAnyPublisher()
    }

    private(set) var playCallCount = 0
    private(set) var stopCallCount = 0
    private(set) var lastPlayedData: Data?

    var playError: Error?
    var autoStopAfterNanos: UInt64?

    func play(data: Data) async throws {
        playCallCount += 1
        lastPlayedData = data
        isPlayingSubject.send(true)
        try await Task.checkCancellation()

        if let playError {
            isPlayingSubject.send(false)
            throw playError
        }

        if let autoStopAfterNanos {
            try await Task.sleep(nanoseconds: autoStopAfterNanos)
            isPlayingSubject.send(false)
        }
    }

    func stop() {
        lock.lock()
        defer { lock.unlock() }
        stopCallCount += 1
        isPlayingSubject.send(false)
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

func makeExerciseHistoryEntry(
    workoutId: String,
    date: Date,
    weekNumber: Int = 1,
    mesocycleId: String = "mesocycle-1",
    bestWeight: Double,
    bestSetReps: Int
) -> ExerciseHistoryEntry {
    ExerciseHistoryEntry(
        workoutId: workoutId,
        date: date,
        weekNumber: weekNumber,
        mesocycleId: mesocycleId,
        sets: [],
        bestWeight: bestWeight,
        bestSetReps: bestSetReps
    )
}

func makeExerciseHistory(
    exerciseId: String = "exercise-1",
    exerciseName: String = "Bench Press",
    entries: [ExerciseHistoryEntry],
    personalRecord: PersonalRecord? = nil
) -> ExerciseHistory {
    ExerciseHistory(
        exerciseId: exerciseId,
        exerciseName: exerciseName,
        entries: entries,
        personalRecord: personalRecord
    )
}

func makeWeightHistoryEntry(date: Date, weight: Double, id: String = "weight-entry") -> WeightHistoryEntry {
    WeightHistoryEntry(id: id, date: isoDateString(date), weightLbs: weight)
}
