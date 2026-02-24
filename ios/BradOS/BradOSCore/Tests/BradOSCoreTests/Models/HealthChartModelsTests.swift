import Testing
import Foundation
@testable import BradOSCore

@Suite("HealthChartModels")
struct HealthChartModelsTests {

    // MARK: - HealthChartRange

    @Test("HealthChartRange.days returns correct values")
    func healthChartRangeDays() {
        #expect(HealthChartRange.oneWeek.days == 7)
        #expect(HealthChartRange.twoWeeks.days == 14)
        #expect(HealthChartRange.oneMonth.days == 30)
        #expect(HealthChartRange.sixMonths.days == 180)
        #expect(HealthChartRange.oneYear.days == 365)
    }

    @Test("HealthChartRange raw values are display strings")
    func healthChartRangeRawValues() {
        #expect(HealthChartRange.oneWeek.rawValue == "1W")
        #expect(HealthChartRange.twoWeeks.rawValue == "2W")
        #expect(HealthChartRange.oneMonth.rawValue == "1M")
        #expect(HealthChartRange.sixMonths.rawValue == "6M")
        #expect(HealthChartRange.oneYear.rawValue == "1Y")
    }

    @Test("HealthChartRange.allCases has 5 cases")
    func healthChartRangeAllCases() {
        #expect(HealthChartRange.allCases.count == 5)
    }

    // MARK: - calculateSMA

    @Test("calculateSMA with window=3 computes rolling average")
    func smaWindow3() {
        let today = Date()
        let points = (0..<5).map { i in
            HealthMetricChartPoint(
                date: Calendar.current.date(byAdding: .day, value: i, to: today) ?? today,
                value: Double((i + 1) * 10)  // 10, 20, 30, 40, 50
            )
        }

        let result = calculateSMA(points: points, window: 3)
        #expect(result.count == 5)
        // index 0: window=[10], avg=10
        #expect(abs(result[0].value - 10.0) < 0.001)
        // index 1: window=[10,20], avg=15
        #expect(abs(result[1].value - 15.0) < 0.001)
        // index 2: window=[10,20,30], avg=20
        #expect(abs(result[2].value - 20.0) < 0.001)
        // index 3: window=[20,30,40], avg=30
        #expect(abs(result[3].value - 30.0) < 0.001)
        // index 4: window=[30,40,50], avg=40
        #expect(abs(result[4].value - 40.0) < 0.001)
    }

    @Test("calculateSMA returns original points when fewer than 2")
    func smaFewerThanTwoPoints() {
        let point = HealthMetricChartPoint(date: Date(), value: 42.0)
        let result = calculateSMA(points: [point], window: 7)
        #expect(result.count == 1)
        #expect(abs(result[0].value - 42.0) < 0.001)
    }

    @Test("calculateSMA returns empty for empty input")
    func smaEmptyInput() {
        let result = calculateSMA(points: [], window: 7)
        #expect(result.isEmpty)
    }

    @Test("calculateSMA window=1 returns original values")
    func smaWindowOne() {
        let today = Date()
        let points = [
            HealthMetricChartPoint(date: today, value: 10.0),
            HealthMetricChartPoint(date: Calendar.current.date(byAdding: .day, value: 1, to: today) ?? today, value: 20.0),
            HealthMetricChartPoint(date: Calendar.current.date(byAdding: .day, value: 2, to: today) ?? today, value: 30.0)
        ]
        let result = calculateSMA(points: points, window: 1)
        #expect(result.count == 3)
        #expect(abs(result[0].value - 10.0) < 0.001)
        #expect(abs(result[1].value - 20.0) < 0.001)
        #expect(abs(result[2].value - 30.0) < 0.001)
    }

    // MARK: - linearRegressionSlope

    @Test("linearRegressionSlope for perfectly increasing data")
    func regressionSlopeIncreasing() {
        // 2 points, 1 day apart, value increases by 2 → slope = 2.0/day
        let day0 = Date()
        let day1 = Calendar.current.date(byAdding: .day, value: 1, to: day0) ?? day0
        let points = [
            HealthMetricChartPoint(date: day0, value: 10.0),
            HealthMetricChartPoint(date: day1, value: 12.0)
        ]
        let slope = linearRegressionSlope(points: points)
        #expect(abs(slope - 2.0) < 0.001)
    }

    @Test("linearRegressionSlope for flat data returns ~0")
    func regressionSlopeFlat() {
        let today = Date()
        let points = (0..<3).map { i in
            HealthMetricChartPoint(
                date: Calendar.current.date(byAdding: .day, value: i, to: today) ?? today,
                value: 5.0
            )
        }
        let slope = linearRegressionSlope(points: points)
        #expect(abs(slope) < 0.001)
    }

    @Test("linearRegressionSlope for decreasing data returns negative")
    func regressionSlopeDecreasing() {
        // 3 points over 2 days decreasing by 1.5/day
        let today = Date()
        let points = [
            HealthMetricChartPoint(date: today, value: 10.0),
            HealthMetricChartPoint(
                date: Calendar.current.date(byAdding: .day, value: 1, to: today) ?? today,
                value: 8.5
            ),
            HealthMetricChartPoint(
                date: Calendar.current.date(byAdding: .day, value: 2, to: today) ?? today,
                value: 7.0
            )
        ]
        let slope = linearRegressionSlope(points: points)
        #expect(abs(slope - (-1.5)) < 0.001)
    }

    @Test("linearRegressionSlope returns 0 for empty input")
    func regressionSlopeEmptyInput() {
        let slope = linearRegressionSlope(points: [])
        #expect(slope == 0.0)
    }

    @Test("linearRegressionSlope returns 0 for single point")
    func regressionSlopeSinglePoint() {
        let point = HealthMetricChartPoint(date: Date(), value: 5.0)
        let slope = linearRegressionSlope(points: [point])
        #expect(slope == 0.0)
    }

    // MARK: - parseDatePoints

    @Test("parseDatePoints converts date strings to sorted points")
    func parseDatePointsSorted() {
        let items: [(dateString: String, value: Double)] = [
            (dateString: "2026-02-03", value: 3.0),
            (dateString: "2026-02-01", value: 1.0),
            (dateString: "2026-02-02", value: 2.0)
        ]
        let result = parseDatePoints(items)
        #expect(result.count == 3)
        // Should be sorted ascending by date
        #expect(abs(result[0].value - 1.0) < 0.001)
        #expect(abs(result[1].value - 2.0) < 0.001)
        #expect(abs(result[2].value - 3.0) < 0.001)
    }

    @Test("parseDatePoints deduplicates by date keeping one per date")
    func parseDatePointsDeduplicates() {
        let items: [(dateString: String, value: Double)] = [
            (dateString: "2026-02-01", value: 1.0),
            (dateString: "2026-02-01", value: 2.0),  // duplicate date
            (dateString: "2026-02-02", value: 3.0)
        ]
        let result = parseDatePoints(items)
        #expect(result.count == 2)  // deduplicated to 1 per date
    }

    @Test("parseDatePoints skips invalid date strings")
    func parseDatePointsSkipsInvalid() {
        let items: [(dateString: String, value: Double)] = [
            (dateString: "not-a-date", value: 1.0),
            (dateString: "2026-02-01", value: 2.0),
            (dateString: "", value: 3.0)
        ]
        let result = parseDatePoints(items)
        #expect(result.count == 1)
        #expect(abs(result[0].value - 2.0) < 0.001)
    }

    @Test("parseDatePoints returns empty for empty input")
    func parseDatePointsEmpty() {
        let result = parseDatePoints([])
        #expect(result.isEmpty)
    }
}
