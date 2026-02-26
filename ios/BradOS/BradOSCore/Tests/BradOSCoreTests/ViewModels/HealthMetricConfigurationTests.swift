import Testing
import Foundation
@testable import BradOSCore

@Suite("HealthMetricConfiguration")
struct HealthMetricConfigurationTests {

    @Test("HRV metric exposes expected UI metadata")
    func hrvMetricMetadata() {
        let metric = HealthMetric.hrv

        #expect(metric.navigationTitle == "HRV History")
        #expect(metric.currentSectionTitle == "Current HRV")
        #expect(metric.trendTitle == "HRV Trend")
        #expect(metric.icon == "waveform.path.ecg")
        #expect(metric.unit == "ms")
        #expect(metric.noDataText == "No HRV data")
        #expect(metric.chartLabel == "HRV")
        #expect(metric.iconBeforeValue == false)
        #expect(metric.errorMessage == "Failed to load HRV history")
        #expect(metric.defaultYRange.min == 20)
        #expect(metric.defaultYRange.max == 60)
    }

    @Test("RHR metric exposes expected UI metadata")
    func rhrMetricMetadata() {
        let metric = HealthMetric.rhr

        #expect(metric.navigationTitle == "RHR History")
        #expect(metric.currentSectionTitle == "Current RHR")
        #expect(metric.trendTitle == "RHR Trend")
        #expect(metric.icon == "heart.fill")
        #expect(metric.unit == "bpm")
        #expect(metric.noDataText == "No RHR data")
        #expect(metric.chartLabel == "RHR")
        #expect(metric.iconBeforeValue == true)
        #expect(metric.errorMessage == "Failed to load RHR history")
        #expect(metric.defaultYRange.min == 50)
        #expect(metric.defaultYRange.max == 80)
    }

    @Test("chartYDomain uses default metric range when no data exists")
    @MainActor
    func chartYDomainDefaultsWithoutData() {
        let hrvVM = HealthMetricHistoryViewModel(.hrv, apiClient: MockAPIClient.empty)
        let rhrVM = HealthMetricHistoryViewModel(.rhr, apiClient: MockAPIClient.empty)

        let hrvRange = hrvVM.chartYDomain
        let rhrRange = rhrVM.chartYDomain

        #expect(abs(hrvRange.lowerBound - 18.0) < 0.001)
        #expect(abs(hrvRange.upperBound - 62.0) < 0.001)
        #expect(abs(rhrRange.lowerBound - 47.0) < 0.001)
        #expect(abs(rhrRange.upperBound - 83.0) < 0.001)
    }

    @Test("projectedTrendPoints returns empty when slope magnitude is tiny")
    @MainActor
    func projectedTrendEmptyForFlatSlope() {
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: MockAPIClient.empty)
        vm.allSmoothedHistory = [
            HealthMetricChartPoint(date: Date(), value: 42.0)
        ]
        vm.trendSlope = 0.001

        #expect(vm.projectedTrendPoints.isEmpty)
    }

    @Test("projectedTrendPoints extrapolates 14 days from final smoothed point")
    @MainActor
    func projectedTrendBuildsDeterministicForecast() {
        let vm = HealthMetricHistoryViewModel(.hrv, apiClient: MockAPIClient.empty)
        let baseDate = Date()
        vm.allSmoothedHistory = [
            HealthMetricChartPoint(date: baseDate, value: 40.0)
        ]
        vm.trendSlope = 0.5

        let projected = vm.projectedTrendPoints

        #expect(projected.count == 15)
        #expect(abs(projected[0].value - 40.0) < 0.001)
        #expect(abs(projected[14].value - 47.0) < 0.001)

        let dayDelta = Calendar.current.dateComponents([.day], from: projected[0].date, to: projected[14].date).day
        #expect(dayDelta == 14)
    }

    @Test("RHR loadData maps API avgBpm into chart points")
    @MainActor
    func rhrLoadDataMapsValues() async {
        let mock = MockAPIClient.empty
        mock.mockRHRHistory = [
            RHRHistoryEntry(id: "r-1", date: "2026-02-19", avgBpm: 58),
            RHRHistoryEntry(id: "r-2", date: "2026-02-20", avgBpm: 55),
            RHRHistoryEntry(id: "r-3", date: "2026-02-21", avgBpm: 53),
        ]

        let vm = HealthMetricHistoryViewModel(.rhr, apiClient: mock)
        await vm.loadData()

        #expect(vm.error == nil)
        #expect(vm.allHistory.count == 3)
        #expect(abs(vm.allHistory[0].value - 58.0) < 0.001)
        #expect(abs(vm.allHistory[2].value - 53.0) < 0.001)
        #expect(abs((vm.currentValue ?? 0) - 53.0) < 0.001)
    }

    @Test("RHR loadData surfaces metric-specific error copy on API failure")
    @MainActor
    func rhrLoadDataErrorMessage() async {
        let mock = MockAPIClient.failing()
        let vm = HealthMetricHistoryViewModel(.rhr, apiClient: mock)

        await vm.loadData()

        #expect(vm.error == "Failed to load RHR history")
        #expect(vm.isLoading == false)
    }
}
