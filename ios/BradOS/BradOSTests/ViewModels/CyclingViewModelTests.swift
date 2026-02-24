import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("CyclingViewModel")
struct CyclingViewModelTests {
    private func makeBlock(
        id: String = "block-1",
        startDate: Date = fixedDate(2026, 2, 24),
        sessions: [WeeklySessionModel]
    ) -> TrainingBlockModel {
        TrainingBlockModel(
            id: id,
            startDate: startDate,
            endDate: Calendar.current.date(byAdding: .day, value: 56, to: startDate) ?? startDate,
            currentWeek: 1,
            goals: [.regainFitness],
            status: .active,
            daysPerWeek: nil,
            weeklySessions: sessions,
            preferredDays: nil,
            experienceLevel: .intermediate,
            weeklyHoursAvailable: nil
        )
    }

    @Test("initial state is empty")
    @MainActor
    func initialStateIsEmpty() {
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())

        #expect(vm.hasFTP == false)
        #expect(vm.nextSession == nil)
    }

    @Test("sessionsCompletedThisWeek matches sessions in order by type")
    @MainActor
    func sessionsCompletedThisWeekMatchesSessionsInOrderByType() {
        let sessions = [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .vo2max),
            makeWeeklySession(order: 3, sessionType: .recovery)
        ]
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = makeBlock(sessions: sessions)

        vm.activities = [
            makeCyclingActivity(date: dateInCurrentWeek(0), type: .fun),
            makeCyclingActivity(date: dateInCurrentWeek(1), type: .threshold),
            makeCyclingActivity(date: dateInCurrentWeek(2), type: .vo2max),
            makeCyclingActivity(date: dateInCurrentWeek(3), type: .recovery)
        ]

        #expect(vm.sessionsCompletedThisWeek == 3)
    }

    @Test("sessionsCompletedThisWeek ignores previous-week activities and stops at first unmatched session")
    @MainActor
    func sessionsCompletedThisWeekIgnoresPreviousWeekActivitiesAndStopsAtFirstUnmatchedSession() {
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = makeBlock(sessions: [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .vo2max),
            makeWeeklySession(order: 3, sessionType: .recovery)
        ])
        vm.activities = [
            makeCyclingActivity(id: "previous-week", date: dateInCurrentWeek(-8), type: .threshold),
            makeCyclingActivity(id: "out-of-order-2", date: dateInCurrentWeek(3), type: .vo2max),
            makeCyclingActivity(id: "out-of-order-1", date: dateInCurrentWeek(1), type: .threshold)
        ]

        #expect(vm.sessionsCompletedThisWeek == 2)
    }

    @Test("sessionsCompletedThisWeek does not reuse one activity for multiple sessions")
    @MainActor
    func sessionsCompletedThisWeekDoesNotReuseOneActivityForMultipleSessions() {
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = makeBlock(sessions: [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .threshold)
        ])
        vm.activities = [makeCyclingActivity(id: "single-threshold", date: dateInCurrentWeek(1), type: .threshold)]

        #expect(vm.sessionsCompletedThisWeek == 1)
    }

    @Test("nextSession returns first incomplete weekly session")
    @MainActor
    func nextSessionReturnsFirstIncompleteWeeklySession() {
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = makeBlock(sessions: [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .recovery),
            makeWeeklySession(order: 3, sessionType: .vo2max)
        ])
        vm.activities = [
            makeCyclingActivity(date: dateInCurrentWeek(0), type: .threshold),
            makeCyclingActivity(date: dateInCurrentWeek(1), type: .recovery)
        ]

        #expect(vm.nextSession?.id == 3)
    }

    @Test("loadData fans out all cycling fetch calls concurrently before completion")
    @MainActor
    func loadDataFansOutAllCallsConcurrentlyBeforeCompletion() async {
        let mock = MockCyclingAPIClient()
        mock.cyclingActivitiesResult = .success([
            makeCyclingActivity(id: "activity-1", date: fixedDate(2026, 2, 24), type: .threshold)
        ])
        mock.cyclingTrainingLoadResult = .success(CyclingTrainingLoadResponse(atl: 24, ctl: 35, tsb: 11))
        mock.currentFTPResult = .success(FTPEntryResponse(id: "ftp-1", value: 250, date: "2026-02-24", source: "manual"))
        mock.currentBlockResult = .success(TrainingBlockResponse(
            id: "block-1",
            startDate: "2026-02-24",
            endDate: "2026-03-31",
            currentWeek: 1,
            goals: ["regain_fitness"],
            status: "active",
            daysPerWeek: nil,
            weeklySessions: nil,
            preferredDays: nil,
            experienceLevel: nil,
            weeklyHoursAvailable: nil
        ))
        mock.vo2MaxResult = .success(
            VO2MaxResponse(
                latest: VO2MaxEstimateModel(id: "vo2-1", value: 48, method: "ftp_derived", category: "good"),
                history: [VO2MaxEstimateModel(id: "vo2-1", value: 47, method: "ftp_derived", category: "good")]
            )
        )
        mock.efHistoryResult = .success([EFDataPoint(activityId: "activity-1", date: "2026-02-24", ef: 1.23)])

        let gate = CyclingAPICallGate(expectedCalls: [
            .getCyclingActivities,
            .getCyclingTrainingLoad,
            .getCurrentFTP,
            .getCurrentBlock,
            .getVO2Max,
            .getEFHistory
        ])
        mock.onCall = { call in
            await gate.markStarted(call)
            await gate.waitUntilReleased()
        }

        let vm = CyclingViewModel(apiClient: mock)
        let loadTask = Task { await vm.loadData() }

        let allCallsStarted = await gate.waitUntilAllStarted(timeoutNanoseconds: 1_000_000_000)
        #expect(allCallsStarted == true)
        #expect(vm.isLoading == true)

        await gate.releaseAll()
        await loadTask.value

        #expect(mock.callCounts[.getCyclingActivities] == 1)
        #expect(mock.callCounts[.getCyclingTrainingLoad] == 1)
        #expect(mock.callCounts[.getCurrentFTP] == 1)
        #expect(mock.callCounts[.getCurrentBlock] == 1)
        #expect(mock.callCounts[.getVO2Max] == 1)
        #expect(mock.callCounts[.getEFHistory] == 1)
        #expect(mock.callCounts[.getFTPHistory] == nil || mock.callCounts[.getFTPHistory] == 0)
        #expect(mock.callCounts[.createFTP] == nil || mock.callCounts[.createFTP] == 0)
        #expect(mock.callCounts[.completeBlock] == nil || mock.callCounts[.completeBlock] == 0)
        #expect(mock.lastActivitiesLimit == 30)

        #expect(vm.activities.count == 1)
        #expect(vm.trainingLoad != nil)
        #expect(vm.currentFTP == 250)
        #expect(vm.currentBlock?.id == "block-1")
        #expect(vm.vo2maxHistory.count == 1)
        #expect(vm.efHistory.count == 1)
        #expect(vm.tssHistory != nil)
        #expect(vm.loadHistory != nil)
        #expect(vm.isLoading == false)
    }

    @Test("saveFTP success sends formatted payload and updates ftp fields")
    @MainActor
    func saveFTPSuccessSendsPayloadAndUpdatesFields() async {
        let mock = MockCyclingAPIClient()
        let response = FTPEntryResponse(id: "ftp-1", value: 250, date: "2026-02-24", source: "manual")
        mock.createFTPResult = .success(response)
        let vm = CyclingViewModel(apiClient: mock)
        let date = fixedDate(2026, 2, 24)
        let source = "manual"
        let result = await vm.saveFTP(250, date: date, source: source)

        #expect(result == true)
        #expect(vm.currentFTP == 250)
        #expect(vm.ftpLastTested == date)
        #expect(vm.error == nil)
        #expect(mock.lastCreateFTPRequest?.value == 250)
        #expect(mock.lastCreateFTPRequest?.date == isoDateString(date))
        #expect(mock.lastCreateFTPRequest?.source == source)
    }

    @Test("saveFTP failure sets user-facing error and returns false")
    @MainActor
    func saveFTPFailureSetsErrorAndReturnsFalse() async {
        let mock = MockCyclingAPIClient()
        mock.createFTPResult = .failure(APIError.internalError("FTP update failed"))
        let vm = CyclingViewModel(apiClient: mock)
        let result = await vm.saveFTP(250)

        #expect(result == false)
        #expect(vm.error?.contains("Failed to save FTP") == true)
        #expect(vm.currentFTP == nil)
    }

    @Test("loadFTPHistory success returns API history entries")
    @MainActor
    func loadFTPHistorySuccessReturnsHistory() async {
        let mock = MockCyclingAPIClient()
        let expected = [
            FTPEntryResponse(id: "ftp-1", value: 240, date: "2026-01-01", source: "manual"),
            FTPEntryResponse(id: "ftp-2", value: 245, date: "2026-01-15", source: "manual")
        ]
        mock.ftpHistoryResult = .success(expected)
        let vm = CyclingViewModel(apiClient: mock)

        let result = await vm.loadFTPHistory()

        #expect(result.count == expected.count)
        #expect(result[0].id == expected[0].id)
        #expect(result[1].id == expected[1].id)
        #expect(result[1].value == expected[1].value)
    }

    @Test("loadFTPHistory failure returns empty array")
    @MainActor
    func loadFTPHistoryFailureReturnsEmptyArray() async {
        let mock = MockCyclingAPIClient()
        mock.ftpHistoryResult = .failure(APIError.internalError("FTP history unavailable"))
        let vm = CyclingViewModel(apiClient: mock)

        let result = await vm.loadFTPHistory()

        #expect(result.isEmpty)
    }

    @Test("completeCurrentBlock success calls API and marks block completed")
    @MainActor
    func completeCurrentBlockSuccessCallsAPIAndMarksBlockCompleted() async {
        let mock = MockCyclingAPIClient()
        let vm = CyclingViewModel(apiClient: mock)
        let block = makeBlock(id: "active-block", sessions: [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .recovery)
        ])
        vm.currentBlock = block

        await vm.completeCurrentBlock()

        #expect(mock.callCounts[.completeBlock] == 1)
        #expect(mock.lastCompleteBlockID == block.id)
        #expect(vm.currentBlock?.status == .completed)
        #expect(vm.error == nil)
    }

    @Test("completeCurrentBlock failure keeps block active and sets user-facing error")
    @MainActor
    func completeCurrentBlockFailureKeepsBlockActiveAndSetsError() async {
        let mock = MockCyclingAPIClient()
        mock.completeBlockResult = .failure(APIError.internalError("Could not complete block"))
        let vm = CyclingViewModel(apiClient: mock)
        let block = makeBlock(id: "active-block", sessions: [makeWeeklySession(order: 1, sessionType: .threshold)])
        vm.currentBlock = block

        await vm.completeCurrentBlock()

        #expect(mock.callCounts[.completeBlock] == 1)
        #expect(mock.lastCompleteBlockID == block.id)
        #expect(vm.currentBlock?.status == .active)
        #expect(vm.error?.contains("Failed to complete block") == true)
    }

    @Test("completeCurrentBlock with nil currentBlock is a no-op")
    @MainActor
    func completeCurrentBlockNoOpWhenNil() async {
        let mock = MockCyclingAPIClient()
        let vm = CyclingViewModel(apiClient: mock)
        await vm.completeCurrentBlock()
        let completeCalls = mock.callCounts[.completeBlock] ?? 0

        #expect(completeCalls == 0)
        #expect(vm.error == nil)
        #expect(vm.currentBlock == nil)
    }
}
