import Foundation
import Combine
@testable import Brad_OS
import BradOSCore

// MARK: - Async API test gate

actor AsyncAPICallGate {
    private let expectedCallCount: Int
    private var startedCallCount = 0
    private var isReleased = false
    private var releaseContinuations: [CheckedContinuation<Void, Never>] = []

    init(expectedCallCount: Int = 1) {
        self.expectedCallCount = expectedCallCount
    }

    func markStarted() {
        startedCallCount += 1
    }

    func waitUntilAllStarted(timeoutNanoseconds: UInt64) async -> Bool {
        if startedCallCount >= expectedCallCount {
            return true
        }

        let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
        while startedCallCount < expectedCallCount {
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
    var syncWeightBulkResult: Result<Int, Error> = .success(1)

    private(set) var getLatestWeightCallCount: Int = 0
    private(set) var getWeightHistoryCallCount: Int = 0
    private(set) var getWeightGoalCallCount: Int = 0
    private(set) var saveWeightGoalCallCount: Int = 0
    private(set) var syncWeightBulkCallCount: Int = 0
    private(set) var lastWeightHistoryDays: Int?
    private(set) var lastSaveWeightGoalRequest: (
        targetWeightLbs: Double,
        targetDate: String,
        startWeightLbs: Double,
        startDate: String
    )?
    private(set) var lastSyncWeightBulkPayload: [WeightSyncEntry]?

    func getLatestWeight() async throws -> WeightHistoryEntry? {
        getLatestWeightCallCount += 1
        return try latestWeightResult.get()
    }

    func getWeightHistory(days: Int) async throws -> [WeightHistoryEntry] {
        getWeightHistoryCallCount += 1
        lastWeightHistoryDays = days
        return try weightHistoryResult.get()
    }

    func getWeightGoal() async throws -> WeightGoalResponse? {
        getWeightGoalCallCount += 1
        return try weightGoalResult.get()
    }

    func saveWeightGoal(
        targetWeightLbs: Double,
        targetDate: String,
        startWeightLbs: Double,
        startDate: String
    ) async throws -> WeightGoalResponse {
        saveWeightGoalCallCount += 1
        lastSaveWeightGoalRequest = (
            targetWeightLbs: targetWeightLbs,
            targetDate: targetDate,
            startWeightLbs: startWeightLbs,
            startDate: startDate
        )
        return try saveWeightGoalResult.get()
    }

    func syncWeightBulk(weights: [WeightSyncEntry]) async throws -> Int {
        syncWeightBulkCallCount += 1
        lastSyncWeightBulkPayload = weights
        return try syncWeightBulkResult.get()
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
    private(set) var lastPlayedText: String?

    var playError: Error?
    var autoStopAfterNanos: UInt64?

    func play(text: String) async throws {
        playCallCount += 1
        lastPlayedText = text
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

// MARK: - Today Coach API mock

final class MockTodayCoachAPIClient: TodayCoachAPIClientProtocol {
    var getTodayCoachRecommendationResult: Result<TodayCoachRecommendation, Error> = .success(
        makeTodayCoachRecommendation()
    )

    private(set) var getTodayCoachRecommendationCallCount = 0
    private(set) var lastGetTodayCoachRecommendationRequest: TodayCoachRequestBody?

    /// Optional async gate to hold requests in-flight for loading-state assertions
    var requestGate: AsyncAPICallGate?

    func getTodayCoachRecommendation(_ body: TodayCoachRequestBody) async throws -> TodayCoachRecommendation {
        getTodayCoachRecommendationCallCount += 1
        lastGetTodayCoachRecommendationRequest = body

        // Mark as started if a gate is configured
        await requestGate?.markStarted()

        // Wait for release if a gate is configured
        if let gate = requestGate {
            await gate.waitUntilReleased()
        }

        return try getTodayCoachRecommendationResult.get()
    }
}

// MARK: - Today Coach fixture helpers

/// Create a TodayCoachRecommendation with optional section payloads.
/// By default, all sections are included. Pass nil for lifting or weight
/// to test partial-data scenarios.
func makeTodayCoachRecommendation(
    dailyBriefing: String = "Here's your day ahead.",
    recovery: TodayCoachRecommendation.RecoverySection? = nil,
    lifting: TodayCoachRecommendation.LiftingSection? = TodayCoachRecommendation.LiftingSection(
        insight: "Good recovery for lifting.",
        workout: TodayCoachRecommendation.LiftingSection.WorkoutDetails(
            planDayName: "Lower Body",
            weekNumber: 1,
            isDeload: false,
            exerciseCount: 4,
            status: "pending"
        ),
        priority: "normal"
    ),
    stretching: TodayCoachRecommendation.StretchingSection? = nil,
    meditation: TodayCoachRecommendation.MeditationSection? = nil,
    weight: TodayCoachRecommendation.WeightSection? = TodayCoachRecommendation.WeightSection(
        insight: "Weight stable this week."
    ),
    warnings: [TodayCoachRecommendation.CoachWarning] = []
) -> TodayCoachRecommendation {
    let sections = TodayCoachRecommendation.CoachSections(
        recovery: recovery ?? TodayCoachRecommendation.RecoverySection(
            insight: "HRV is 12% above baseline.",
            status: "great"
        ),
        lifting: lifting,
        stretching: stretching ?? TodayCoachRecommendation.StretchingSection(
            insight: "Focus on lower body.",
            suggestedRegions: ["hamstrings", "quads"],
            priority: "normal"
        ),
        meditation: meditation ?? TodayCoachRecommendation.MeditationSection(
            insight: "Consider a brief session.",
            suggestedDurationMinutes: 10,
            priority: "low"
        ),
        weight: weight
    )

    return TodayCoachRecommendation(
        dailyBriefing: dailyBriefing,
        sections: sections,
        warnings: warnings
    )
}

// MARK: - Recovery fixture helper

func makeRecoveryData(
    date: Date = Date(),
    hrvMs: Double = 45,
    hrvVsBaseline: Double = 1.2,
    rhrBpm: Double = 55,
    rhrVsBaseline: Double = 0.95,
    sleepHours: Double = 8.0,
    sleepEfficiency: Double = 0.85,
    deepSleepPercent: Double = 0.25,
    score: Int = 85,
    state: RecoveryState = .ready
) -> RecoveryData {
    RecoveryData(
        date: date,
        hrvMs: hrvMs,
        hrvVsBaseline: hrvVsBaseline,
        rhrBpm: rhrBpm,
        rhrVsBaseline: rhrVsBaseline,
        sleepHours: sleepHours,
        sleepEfficiency: sleepEfficiency,
        deepSleepPercent: deepSleepPercent,
        score: score,
        state: state
    )
}
