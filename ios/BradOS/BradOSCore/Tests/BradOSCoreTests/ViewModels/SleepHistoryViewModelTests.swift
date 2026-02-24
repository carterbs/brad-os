import Testing
import Foundation
@testable import BradOSCore

@Suite("SleepHistoryViewModel")
struct SleepHistoryViewModelTests {

    // MARK: - Helpers

    private func makeSleepEntry(
        id: String,
        daysAgo: Int,
        totalSleepMinutes: Int = 420,
        deepMinutes: Int = 84,
        efficiency: Double = 90.0
    ) -> SleepHistoryEntry {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: Date()) ?? Date()
        return SleepHistoryEntry(
            id: id,
            date: formatter.string(from: date),
            totalSleepMinutes: totalSleepMinutes,
            coreMinutes: totalSleepMinutes / 2,
            deepMinutes: deepMinutes,
            remMinutes: totalSleepMinutes / 4,
            awakeMinutes: 20,
            sleepEfficiency: efficiency
        )
    }

    // MARK: - Initial State

    @Test("initial state is empty")
    @MainActor
    func initialStateIsEmpty() {
        let vm = SleepHistoryViewModel(apiClient: MockAPIClient.empty)
        #expect(vm.allHistory.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
        #expect(vm.currentEntry == nil)
        #expect(vm.averageSleepHours == nil)
    }

    // MARK: - Data Loading

    @Test("loadData populates history from sleep API")
    @MainActor
    func loadDataPopulatesHistory() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = Array(SleepHistoryEntry.mockEntries.prefix(10))
        let vm = SleepHistoryViewModel(apiClient: mock)

        await vm.loadData()

        #expect(vm.allHistory.count == 10)
        #expect(vm.error == nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadData sets error on failure")
    @MainActor
    func loadDataSetsErrorOnFailure() async {
        let mock = MockAPIClient.failing()
        let vm = SleepHistoryViewModel(apiClient: mock)

        await vm.loadData()

        #expect(vm.error != nil)
        #expect(vm.allHistory.isEmpty)
        #expect(vm.isLoading == false)
    }

    @Test("loadData converts minutes to hours")
    @MainActor
    func loadDataConvertsMinutesToHours() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = [
            makeSleepEntry(id: "s-0", daysAgo: 2, totalSleepMinutes: 420),   // 7.0h
            makeSleepEntry(id: "s-1", daysAgo: 1, totalSleepMinutes: 480),   // 8.0h
            makeSleepEntry(id: "s-2", daysAgo: 0, totalSleepMinutes: 360)    // 6.0h
        ]
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        #expect(vm.allHistory.count == 3)
        // Sorted ascending: oldest first
        let hours = vm.allHistory.map(\.totalHours)
        #expect(abs(hours[0] - 7.0) < 0.001)
        #expect(abs(hours[1] - 8.0) < 0.001)
        #expect(abs(hours[2] - 6.0) < 0.001)
    }

    @Test("loadData deduplicates entries by date")
    @MainActor
    func loadDataDeduplicatesByDate() async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let today = formatter.string(from: Date())

        let mock = MockAPIClient.empty
        mock.mockSleepHistory = [
            SleepHistoryEntry(
                id: "s-1", date: today, totalSleepMinutes: 420,
                coreMinutes: 210, deepMinutes: 84, remMinutes: 105, awakeMinutes: 20,
                sleepEfficiency: 90.0
            ),
            SleepHistoryEntry(
                id: "s-2", date: today, totalSleepMinutes: 400,  // duplicate date
                coreMinutes: 200, deepMinutes: 80, remMinutes: 100, awakeMinutes: 20,
                sleepEfficiency: 88.0
            )
        ]
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        #expect(vm.allHistory.count == 1)
    }

    // MARK: - Computed Properties

    @Test("averageSleepHours computes 7-entry average")
    @MainActor
    func averageSleepHoursComputes7EntryAverage() async {
        // 7 entries each with 420 minutes = 7.0h → avg = 7.0
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = (0..<7).map { i in
            makeSleepEntry(id: "s-\(i)", daysAgo: i, totalSleepMinutes: 420)
        }
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        let avg = vm.averageSleepHours ?? 0
        #expect(abs(avg - 7.0) < 0.001)
    }

    @Test("averageEfficiency computes 7-entry average")
    @MainActor
    func averageEfficiencyComputes7EntryAverage() async {
        // 7 entries each with 90% efficiency → avg = 90.0
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = (0..<7).map { i in
            makeSleepEntry(id: "s-\(i)", daysAgo: i, totalSleepMinutes: 420, efficiency: 90.0)
        }
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        let avg = vm.averageEfficiency ?? 0
        #expect(abs(avg - 90.0) < 0.001)
    }

    @Test("currentEntry returns last history entry")
    @MainActor
    func currentEntryReturnsLast() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = (0..<3).map { i in
            makeSleepEntry(id: "s-\(i)", daysAgo: 2 - i, totalSleepMinutes: 360 + i * 30)
        }
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        // allHistory sorted ascending: s-2 (today) is last
        let current = vm.currentEntry
        #expect(current != nil)
        #expect(abs((current?.totalHours ?? 0) - 7.0) < 0.001)  // 420 min / 60 = 7.0
    }

    // MARK: - Range Filtering

    @Test("history filters by selectedRange")
    @MainActor
    func historyFiltersByRange() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = SleepHistoryEntry.mockEntries  // 30 entries
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        vm.selectedRange = .sixMonths
        let sixMonthCount = vm.history.count
        #expect(sixMonthCount == 30)

        vm.selectedRange = .oneWeek
        let oneWeekCount = vm.history.count
        #expect(oneWeekCount < sixMonthCount)
        #expect(oneWeekCount <= 8)
    }

    // MARK: - Chart Helpers

    @Test("totalSleepPoints maps history to HealthMetricChartPoints")
    @MainActor
    func totalSleepPointsMapsHistory() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = (0..<5).map { i in
            makeSleepEntry(id: "s-\(i)", daysAgo: 4 - i, totalSleepMinutes: 420)
        }
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        let points = vm.totalSleepPoints
        #expect(points.count == vm.history.count)
        // Each totalHours = 420/60 = 7.0
        for point in points {
            #expect(abs(point.value - 7.0) < 0.001)
        }
    }

    @Test("smoothedTotalSleep applies 7-day SMA")
    @MainActor
    func smoothedTotalSleepAppliesSMA() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = (0..<10).map { i in
            makeSleepEntry(id: "s-\(i)", daysAgo: 9 - i, totalSleepMinutes: 420)
        }
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        let smoothed = vm.smoothedTotalSleep
        #expect(smoothed.count == vm.totalSleepPoints.count)
        // With all values equal, smoothed = original values
        for point in smoothed {
            #expect(abs(point.value - 7.0) < 0.001)
        }
    }

    @Test("chartYDomain provides padded range")
    @MainActor
    func chartYDomainProvidesPadding() async {
        let mock = MockAPIClient.empty
        mock.mockSleepHistory = [
            makeSleepEntry(id: "s-0", daysAgo: 2, totalSleepMinutes: 360),  // 6.0h
            makeSleepEntry(id: "s-1", daysAgo: 1, totalSleepMinutes: 480),  // 8.0h
            makeSleepEntry(id: "s-2", daysAgo: 0, totalSleepMinutes: 420)   // 7.0h
        ]
        let vm = SleepHistoryViewModel(apiClient: mock)
        await vm.loadData()

        let domain = vm.chartYDomain
        // Min value = 6.0, max = 8.0; domain should extend beyond
        #expect(domain.lowerBound <= 6.0)
        #expect(domain.upperBound >= 8.0)
    }
}
