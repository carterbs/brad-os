import Testing
@testable import BradOS
import BradOSCore
import Foundation

@Suite("CyclingViewModel")
struct CyclingViewModelTests {

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
        let today = Date()
        let sessions = [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .vo2max),
            makeWeeklySession(order: 3, sessionType: .recovery)
        ]
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = TrainingBlockModel(
            id: "block-1",
            startDate: today,
            endDate: Calendar.current.date(byAdding: .day, value: 56, to: today) ?? today,
            currentWeek: 1,
            goals: [.regainFitness],
            status: .active,
            daysPerWeek: nil,
            weeklySessions: sessions,
            preferredDays: nil,
            experienceLevel: .intermediate,
            weeklyHoursAvailable: nil
        )

        vm.activities = [
            makeCyclingActivity(date: dateInCurrentWeek(0), type: .fun),
            makeCyclingActivity(date: dateInCurrentWeek(1), type: .threshold),
            makeCyclingActivity(date: dateInCurrentWeek(2), type: .vo2max),
            makeCyclingActivity(date: dateInCurrentWeek(3), type: .recovery)
        ]

        #expect(vm.sessionsCompletedThisWeek == 3)
    }

    @Test("nextSession returns first incomplete weekly session")
    @MainActor
    func nextSessionReturnsFirstIncompleteWeeklySession() {
        let today = Date()
        let sessions = [
            makeWeeklySession(order: 1, sessionType: .threshold),
            makeWeeklySession(order: 2, sessionType: .recovery),
            makeWeeklySession(order: 3, sessionType: .vo2max)
        ]
        let vm = CyclingViewModel(apiClient: MockCyclingAPIClient())
        vm.currentBlock = TrainingBlockModel(
            id: "block-1",
            startDate: today,
            endDate: Calendar.current.date(byAdding: .day, value: 56, to: today) ?? today,
            currentWeek: 1,
            goals: [.regainFitness],
            status: .active,
            daysPerWeek: nil,
            weeklySessions: sessions,
            preferredDays: nil,
            experienceLevel: .intermediate,
            weeklyHoursAvailable: nil
        )

        vm.activities = [
            makeCyclingActivity(date: dateInCurrentWeek(0), type: .threshold),
            makeCyclingActivity(date: dateInCurrentWeek(1), type: .recovery)
        ]

        #expect(vm.nextSession?.id == 3)
    }

    @Test("saveFTP success updates ftp fields and returns true")
    @MainActor
    func saveFTPSuccessUpdatesFields() async {
        let mock = MockCyclingAPIClient()
        let response = FTPEntryResponse(id: "ftp-1", value: 250, date: "2026-02-24", source: "manual")
        mock.createFTPResult = .success(response)
        let vm = CyclingViewModel(apiClient: mock)
        let date = fixedDate(2026, 2, 24)
        let result = await vm.saveFTP(250, date: date, source: "manual")

        #expect(result == true)
        #expect(vm.currentFTP == 250)
        #expect(vm.ftpLastTested == date)
        #expect(vm.error == nil)
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
}
