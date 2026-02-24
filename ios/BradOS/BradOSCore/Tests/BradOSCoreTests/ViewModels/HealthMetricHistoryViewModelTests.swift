import Testing
import Foundation
@testable import BradOSCore

@Suite("HealthMetricHistoryViewModel")
struct HealthMetricHistoryViewModelTests {

    // MARK: - Helpers

    /// Build mock HRV entries going back N days with a linear increasing trend
    private func makeTrendingHRVEntries(count: Int, startValue: Double = 30.0, dailyIncrease: Double = 1.0) -> [HRVHistoryEntry] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let today = Date()
        return (0..<count).map { i in
            // i=0 is oldest (count-1 days ago), i=count-1 is today
            let daysAgo = count - 1 - i
            let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: today) ?? today
            return HRVHistoryEntry(
                id: "hrv-\(i)",
                date: formatter.string(from: date),
                avgMs: startValue + Double(i) * dailyIncrease
            )
        }
    }

    // MARK: - Initial State

    @Test("initial state is empty with no loading")
    @MainActor
    func initialStateIsEmpty() {
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: MockAPIClient.empty)
        #expect(vm.allHistory.isEmpty)
        #expect(vm.allSmoothedHistory.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
        #expect(vm.currentValue == nil)
        #expect(vm.trendSlope == nil)
    }

    // MARK: - Data Loading

    @Test("loadData populates allHistory from HRV API")
    @MainActor
    func loadDataPopulatesHRVHistory() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = Array(HRVHistoryEntry.mockEntries.prefix(10))
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)

        await vm.loadData()

        #expect(vm.allHistory.count == 10)
        #expect(vm.error == nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadData populates allHistory from RHR API")
    @MainActor
    func loadDataPopulatesRHRHistory() async {
        let mock = MockAPIClient.empty
        mock.mockRHRHistory = Array(RHRHistoryEntry.mockEntries.prefix(10))
        let vm = HealthMetricHistoryViewModel(.rhr, apiClient: mock)

        await vm.loadData()

        #expect(vm.allHistory.count == 10)
        #expect(vm.error == nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadData sets error on API failure")
    @MainActor
    func loadDataSetsErrorOnFailure() async {
        let mock = MockAPIClient.failing()
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)

        await vm.loadData()

        #expect(vm.error != nil)
        #expect(vm.allHistory.isEmpty)
        #expect(vm.isLoading == false)
    }

    @Test("loadData calculates smoothed history via 7-day SMA")
    @MainActor
    func loadDataCalculatesSmoothedHistory() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = Array(HRVHistoryEntry.mockEntries.prefix(14))
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)

        await vm.loadData()

        #expect(vm.allSmoothedHistory.count == vm.allHistory.count)
        #expect(!vm.allSmoothedHistory.isEmpty)
    }

    // MARK: - Range Filtering

    @Test("history filters by selectedRange")
    @MainActor
    func historyFiltersByRange() async {
        // 30 mock entries going back 30 days
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = HRVHistoryEntry.mockEntries  // 30 entries
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        vm.selectedRange = .sixMonths
        let sixMonthCount = vm.history.count
        #expect(sixMonthCount == 30)  // all 30 within 180 days

        vm.selectedRange = .oneWeek
        let oneWeekCount = vm.history.count
        #expect(oneWeekCount < sixMonthCount)
        #expect(oneWeekCount <= 8)  // at most 7-8 entries within 7 days
    }

    // MARK: - Computed Properties

    @Test("currentValue returns last point's value")
    @MainActor
    func currentValueReturnsLastPoint() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = makeTrendingHRVEntries(count: 5, startValue: 30.0, dailyIncrease: 1.0)
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        // allHistory is sorted ascending; last = today (index 4, value 30+4*1=34)
        #expect(vm.currentValue != nil)
        #expect(abs((vm.currentValue ?? 0) - 34.0) < 0.001)
    }

    @Test("trendSlope is nil with insufficient data")
    @MainActor
    func trendSlopeNilWithInsufficientData() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = Array(HRVHistoryEntry.mockEntries.prefix(5))
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        // 5 points → allSmoothedHistory.suffix(28) has 5 points → < 7 → trendSlope nil
        #expect(vm.trendSlope == nil)
    }

    @Test("trendSlope is computed with sufficient data")
    @MainActor
    func trendSlopeComputedWithSufficientData() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = makeTrendingHRVEntries(count: 30, startValue: 30.0, dailyIncrease: 0.5)
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        // 30 points → suffix(28)=28 points ≥ 7 → trendSlope computed
        #expect(vm.trendSlope != nil)
    }

    @Test("chartYDomain provides padded range")
    @MainActor
    func chartYDomainProvidesPadding() async {
        let mock = MockAPIClient.empty
        mock.mockHRVHistory = makeTrendingHRVEntries(count: 10, startValue: 35.0, dailyIncrease: 1.0)
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        let domain = vm.chartYDomain
        // Min value is 35.0, max is 44.0; domain should extend beyond those
        let historyMin = vm.history.map(\.value).min() ?? 0
        let historyMax = vm.history.map(\.value).max() ?? 0
        #expect(domain.lowerBound < historyMin)
        #expect(domain.upperBound > historyMax)
    }

    @Test("projectedTrendPoints are empty when no trend")
    @MainActor
    func projectedTrendPointsEmptyWhenNoTrend() async {
        let mock = MockAPIClient.empty
        // Only 3 entries → no trend computed
        mock.mockHRVHistory = Array(HRVHistoryEntry.mockEntries.prefix(3))
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        #expect(vm.projectedTrendPoints.isEmpty)
    }

    @Test("projectedTrendPoints extend 14 days when trend exists")
    @MainActor
    func projectedTrendPointsExtend14Days() async {
        let mock = MockAPIClient.empty
        // Strong increasing trend to ensure |slope| > 0.001
        mock.mockHRVHistory = makeTrendingHRVEntries(count: 30, startValue: 30.0, dailyIncrease: 1.0)
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: mock)
        await vm.loadData()

        // Should have 15 points: today + 14 future days
        #expect(vm.projectedTrendPoints.count == 15)
    }
}
