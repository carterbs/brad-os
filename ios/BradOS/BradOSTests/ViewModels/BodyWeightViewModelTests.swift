import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("BodyWeightViewModel")
struct BodyWeightViewModelTests {

    private func makeWeightEntries(
        startDate: Date,
        startWeight: Double,
        count: Int,
        dailyDelta: Double
    ) -> [WeightHistoryEntry] {
        (0..<count).compactMap { index in
            let date = Calendar.current.date(byAdding: .day, value: index, to: startDate) ?? startDate
            return WeightHistoryEntry(
                id: "weight-\(index)",
                date: isoDateString(date),
                weightLbs: startWeight + (dailyDelta * Double(index))
            )
        }
    }

    private func makePoints(
        startDate: Date,
        startWeight: Double,
        count: Int,
        dailyDelta: Double
    ) -> [WeightChartPoint] {
        (0..<count).compactMap { index in
            let date = Calendar.current.date(byAdding: .day, value: index, to: startDate) ?? startDate
            return WeightChartPoint(date: date, weight: startWeight + (dailyDelta * Double(index)))
        }
    }

    private func assertNear(_ actual: Double, _ expected: Double, tolerance: Double = 0.001) {
        #expect(abs(actual - expected) < tolerance)
    }

    @Test("loadData computes smoothed history and recent trend summaries")
    @MainActor
    func loadDataComputesSmoothedHistoryAndTrendSummaries() async {
        let mock = MockBodyWeightAPIClient()
        mock.weightHistoryResult = .success(makeWeightEntries(
            startDate: fixedDate(2026, 2, 1),
            startWeight: 180,
            count: 10,
            dailyDelta: 1
        ))

        let vm = BodyWeightViewModel(apiClient: mock)
        await vm.loadData()

        #expect(vm.allWeightHistory.count == 10)
        #expect(vm.allSmoothedHistory.count == 10)
        assertNear(vm.currentWeight ?? 0, 189)
        #expect(vm.currentWeightDate == "2026-02-10")
        #expect(vm.recentTrends.count == 2)
        #expect(vm.recentTrends[0].windowLabel == "7-Day")
        #expect(vm.recentTrends[0].state == .increasing)
        #expect(vm.recentTrends[1].windowLabel == "30-Day")
        #expect(vm.recentTrends[1].state == .increasing)
    }

    @Test("updateRecentTrends classifies increasing and decreasing states")
    @MainActor
    func updateRecentTrendsClassifiesIncreasingAndDecreasingStates() {
        let vm = BodyWeightViewModel(apiClient: MockBodyWeightAPIClient())
        vm.currentWeight = 160
        vm.allWeightHistory = makePoints(startDate: fixedDate(2026, 1, 1), startWeight: 165, count: 10, dailyDelta: -1)
        vm.updateRecentTrends()

        #expect(vm.recentTrends[0].state == .decreasing)

        vm.currentWeight = 200
        vm.allWeightHistory = makePoints(startDate: fixedDate(2026, 1, 1), startWeight: 180, count: 10, dailyDelta: 0.8)
        vm.updateRecentTrends()

        #expect(vm.recentTrends[0].state == .increasing)
    }

    @Test("updateRecentTrends classifies stable state")
    @MainActor
    func updateRecentTrendsClassifiesStableState() {
        let vm = BodyWeightViewModel(apiClient: MockBodyWeightAPIClient())
        vm.currentWeight = 150
        vm.allWeightHistory = makePoints(startDate: fixedDate(2026, 1, 1), startWeight: 150, count: 10, dailyDelta: 0)
        vm.updateRecentTrends()

        #expect(vm.recentTrends[0].state == .stable)
        #expect(vm.recentTrends[1].state == .stable)
    }

    @Test("logEntry sends expected manual payload")
    @MainActor
    func logEntrySendsExpectedPayload() async {
        let mock = MockBodyWeightAPIClient()
        mock.weightHistoryResult = .success(makeWeightEntries(
            startDate: fixedDate(2026, 2, 1),
            startWeight: 180,
            count: 10,
            dailyDelta: 1
        ))
        mock.logWeightEntryResult = .success(
            WeightHistoryEntry(
                id: "manual-entry",
                date: "2026-03-14",
                weightLbs: 182.2,
                source: "manual"
            )
        )
        let vm = BodyWeightViewModel(apiClient: mock)
        vm.entryWeight = "182.2"
        vm.entryDate = fixedDate(2026, 3, 14)

        await vm.logEntry()

        #expect(mock.logWeightEntryCallCount == 1)
        #expect(mock.lastLogWeightEntryRequest?.weightLbs == 182.2)
        #expect(mock.lastLogWeightEntryRequest?.date == "2026-03-14")
        #expect(mock.lastLogWeightEntryRequest?.source == "manual")
        #expect(vm.logSuccess == true)
        #expect(vm.currentWeight == 182.2)
    }

    @Test("logEntry does not call API for invalid weight input")
    @MainActor
    func logEntryNoCallForInvalidInput() async {
        let mock = MockBodyWeightAPIClient()
        let vm = BodyWeightViewModel(apiClient: mock)
        vm.entryWeight = "abc"

        await vm.logEntry()

        #expect(mock.logWeightEntryCallCount == 0)
        #expect(vm.logSuccess == false)
        #expect(vm.error != nil)
    }

    @Test("logEntry failure sets error and does not keep success state")
    @MainActor
    func logEntryFailureSetsError() async {
        let mock = MockBodyWeightAPIClient()
        mock.logWeightEntryResult = .failure(APIError.internalError("Log failed"))

        let vm = BodyWeightViewModel(apiClient: mock)
        vm.entryWeight = "182"
        vm.entryDate = fixedDate(2026, 3, 14)

        await vm.logEntry()

        #expect(vm.logSuccess == false)
        #expect(vm.error != nil)
        #expect(mock.getWeightHistoryCallCount == 0)
    }

    @Test("successful log refreshes history and trend state")
    @MainActor
    func logEntryRefreshesHistory() async {
        let mock = MockBodyWeightAPIClient()
        mock.weightHistoryResult = .success(makeWeightEntries(
            startDate: fixedDate(2026, 3, 1),
            startWeight: 180,
            count: 2,
            dailyDelta: 1
        ))

        let vm = BodyWeightViewModel(apiClient: mock)
        vm.entryWeight = "183"
        vm.entryDate = fixedDate(2026, 3, 3)

        mock.logWeightEntryResult = .success(
            WeightHistoryEntry(
                id: "2026-03-03",
                date: "2026-03-03",
                weightLbs: 183
            )
        )
        mock.weightHistoryResult = .success([
            WeightHistoryEntry(id: "1", date: "2026-03-01", weightLbs: 180),
            WeightHistoryEntry(id: "2", date: "2026-03-02", weightLbs: 181),
            WeightHistoryEntry(id: "3", date: "2026-03-03", weightLbs: 183),
        ])

        await vm.logEntry()

        #expect(mock.getWeightHistoryCallCount == 1)
        #expect(vm.currentWeight == 183)
        #expect(vm.currentWeightDate == "2026-03-03")
        #expect(vm.allWeightHistory.count == 3)
        #expect(vm.recentTrends.count == 2)
    }
}
