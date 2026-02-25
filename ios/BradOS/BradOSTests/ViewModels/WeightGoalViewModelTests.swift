import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("WeightGoalViewModel")
struct WeightGoalViewModelTests {

    private let tolerance = 0.001

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

    private func makeWeightPoints(
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

    private func makePiecewiseWeightPoints(
        startDate: Date,
        startWeight: Double,
        firstSegmentCount: Int,
        firstSegmentDelta: Double,
        secondSegmentCount: Int,
        secondSegmentDelta: Double
    ) -> [WeightChartPoint] {
        var points: [WeightChartPoint] = []

        points.append(
            contentsOf: makeWeightPoints(
                startDate: startDate,
                startWeight: startWeight,
                count: firstSegmentCount,
                dailyDelta: firstSegmentDelta
            )
        )

        let secondStartWeight = startWeight + (firstSegmentDelta * Double(firstSegmentCount))
        let secondStartDate = Calendar.current.date(
            byAdding: .day,
            value: firstSegmentCount,
            to: startDate
        ) ?? startDate

        points.append(
            contentsOf: makeWeightPoints(
                startDate: secondStartDate,
                startWeight: secondStartWeight,
                count: secondSegmentCount,
                dailyDelta: secondSegmentDelta
            )
        )

        return points
    }

    private func assertNear(_ actual: Double, _ expected: Double) {
        #expect(abs(actual - expected) < tolerance)
    }

    @Test("updateTrend requires at least 7 smoothed points")
    @MainActor
    func updateTrendRequiresSevenPoints() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 2, 1),
            startWeight: 180,
            count: 6,
            dailyDelta: -0.2
        )
        vm.updateTrend()
        #expect(vm.trendSlope == nil)

        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 2, 1),
            startWeight: 180,
            count: 7,
            dailyDelta: -0.2
        )
        vm.updateTrend()
        #expect(vm.trendSlope != nil)
    }

    @Test("updateTrend computes expected negative slope from linear data")
    @MainActor
    func updateTrendComputesExpectedNegativeSlopeFromLinearData() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 220,
            count: 30,
            dailyDelta: -0.4
        )

        vm.updateTrend()

        #expect(vm.trendSlope != nil)
        assertNear(vm.trendSlope ?? 0, -0.4)
    }

    @Test("updateTrend uses only the most recent 28 points")
    @MainActor
    func updateTrendUsesOnlyMostRecent28Points() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.allSmoothedHistory = makePiecewiseWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 210,
            firstSegmentCount: 20,
            firstSegmentDelta: 0.3,
            secondSegmentCount: 28,
            secondSegmentDelta: -0.2
        )

        vm.updateTrend()

        #expect(vm.trendSlope != nil)
        assertNear(vm.trendSlope ?? 0, -0.2)
    }

    @Test("updatePrediction computes daysRemaining and weeklyRate for loss goal")
    @MainActor
    func updatePredictionComputesDaysRemainingAndWeeklyRateForLossGoal() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "176"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 30)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 190,
            count: 14,
            dailyDelta: -0.5
        )

        vm.updateTrend()
        vm.updatePrediction()

        #expect(vm.prediction != nil)
        #expect(vm.prediction?.predictedDate != nil)
        #expect(vm.prediction?.isOnTrack == true)
        #expect(vm.prediction?.daysRemaining == 15)
        assertNear(vm.prediction?.weeklyRateLbs ?? 0, -3.5)
    }

    @Test("updatePrediction supports gain goals when trend is positive")
    @MainActor
    func updatePredictionSupportsGainGoalsWhenTrendIsPositive() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "180"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 45)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 170,
            count: 14,
            dailyDelta: 0.5
        )

        vm.updateTrend()
        vm.updatePrediction()

        #expect(vm.prediction != nil)
        #expect(vm.prediction?.predictedDate != nil)
        #expect(vm.prediction?.isOnTrack == true)
        #expect(vm.prediction?.daysRemaining == 7)
        assertNear(vm.prediction?.weeklyRateLbs ?? 0, 3.5)
    }

    @Test("updatePrediction fallback path works when trendSlope is nil but >=3 points exist")
    @MainActor
    func updatePredictionFallbackPathWorksWhenTrendSlopeIsNilButHasThreeToSixPoints() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "210"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 30)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 220,
            count: 6,
            dailyDelta: -0.5
        )

        #expect(vm.trendSlope == nil)

        vm.updatePrediction()

        #expect(vm.prediction != nil)
        #expect(vm.prediction?.predictedDate != nil)
        #expect(vm.prediction?.isOnTrack == true)
        #expect(vm.prediction?.daysRemaining == 15)
        assertNear(vm.prediction?.weeklyRateLbs ?? 0, -3.5)
    }

    @Test("updatePrediction returns not-on-track when slope is near zero")
    @MainActor
    func updatePredictionReturnsNotOnTrackWhenSlopeIsNearZero() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "170"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 30)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 180,
            count: 14,
            dailyDelta: -0.0005
        )

        vm.updatePrediction()

        #expect(vm.prediction?.predictedDate == nil)
        #expect(vm.prediction?.daysRemaining == nil)
        #expect(vm.prediction?.isOnTrack == false)
        assertNear(vm.prediction?.weeklyRateLbs ?? 0, -0.0035)
    }

    @Test("updatePrediction returns nil predictedDate when trend moves away from target")
    @MainActor
    func updatePredictionAwayFromTargetHasNilDate() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "180"
        vm.targetDate = fixedDate(2026, 3, 1)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: fixedDate(2026, 2, 1),
            startWeight: 200,
            count: 14,
            dailyDelta: 0.5
        )

        vm.updateTrend()
        vm.updatePrediction()

        #expect(vm.prediction?.predictedDate == nil)
        #expect(vm.prediction?.isOnTrack == false)
    }

    @Test("loadData hydrates existing goal into target fields")
    @MainActor
    func loadDataHydratesExistingGoalIntoTargetFields() async {
        let mock = MockWeightGoalAPIClient()
        mock.latestWeightResult = .success(
            WeightHistoryEntry(id: "latest", date: "2026-05-01", weightLbs: 181)
        )
        mock.weightHistoryResult = .success(makeWeightEntries(
            startDate: fixedDate(2026, 1, 1),
            startWeight: 190,
            count: 4,
            dailyDelta: -0.5
        ))
        mock.weightGoalResult = .success(
            WeightGoalResponse(
                targetWeightLbs: 179,
                targetDate: "2026-08-01",
                startWeightLbs: 190,
                startDate: "2026-01-01"
            )
        )

        let vm = WeightGoalViewModel(apiClient: mock)
        await vm.loadData()

        #expect(vm.existingGoal != nil)
        #expect(vm.targetWeight == "179")
        #expect(isoDateString(vm.targetDate) == "2026-08-01")
        #expect(vm.currentWeight == 181)
        #expect(mock.getWeightGoalCallCount == 1)
        #expect(mock.lastWeightHistoryDays == 365)
    }

    @Test("saveGoal sends formatted payload for new goal baseline")
    @MainActor
    func saveGoalSendsFormattedPayloadForNewGoalBaseline() async {
        let mock = MockWeightGoalAPIClient()
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.currentWeight = 210
        vm.targetWeight = "180"
        vm.targetDate = fixedDate(2026, 5, 1)
        let expectedStartDate = isoDateString(Date())

        await vm.saveGoal()

        #expect(mock.saveWeightGoalCallCount == 1)
        #expect(mock.lastSaveWeightGoalRequest?.targetWeightLbs == 180)
        #expect(mock.lastSaveWeightGoalRequest?.targetDate == "2026-05-01")
        #expect(mock.lastSaveWeightGoalRequest?.startWeightLbs == 210)
        #expect(mock.lastSaveWeightGoalRequest?.startDate == expectedStartDate)
        #expect(vm.saveSuccess == true)
    }

    @Test("saveGoal reuses existing start baseline when updating goal")
    @MainActor
    func saveGoalReusesExistingStartBaselineWhenUpdatingGoal() async {
        let mock = MockWeightGoalAPIClient()
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.existingGoal = WeightGoalResponse(
            targetWeightLbs: 178,
            targetDate: "2026-06-01",
            startWeightLbs: 185,
            startDate: "2026-01-01"
        )
        vm.currentWeight = 190
        vm.targetWeight = "175"
        vm.targetDate = fixedDate(2026, 7, 1)

        await vm.saveGoal()

        #expect(mock.saveWeightGoalCallCount == 1)
        #expect(mock.lastSaveWeightGoalRequest?.startWeightLbs == 185)
        #expect(mock.lastSaveWeightGoalRequest?.startDate == "2026-01-01")
        #expect(vm.saveSuccess == true)
    }

    @Test("saveGoal no-ops for non-numeric target")
    @MainActor
    func saveGoalNoOpsForNonNumericTarget() async {
        let mock = MockWeightGoalAPIClient()
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.currentWeight = 190
        vm.targetWeight = "abc"
        vm.targetDate = fixedDate(2026, 6, 1)

        await vm.saveGoal()

        #expect(mock.saveWeightGoalCallCount == 0)
        #expect(vm.saveSuccess == false)
    }

    @Test("saveGoal no-ops for no current weight")
    @MainActor
    func saveGoalNoOpsForNoCurrentWeightOrHistory() async {
        let mock = MockWeightGoalAPIClient()
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.targetWeight = "180"
        vm.targetDate = fixedDate(2026, 6, 1)
        vm.currentWeight = nil
        vm.allSmoothedHistory = []

        await vm.saveGoal()

        #expect(mock.saveWeightGoalCallCount == 0)
        #expect(vm.saveSuccess == false)
    }

    @Test("saveGoal success stores existingGoal and sets saveSuccess")
    @MainActor
    func saveGoalSuccessStoresGoalAndSetsFlag() async {
        let expectedGoal = WeightGoalResponse(
            targetWeightLbs: 178,
            targetDate: "2026-04-01",
            startWeightLbs: 190,
            startDate: "2026-02-01"
        )
        let mock = MockWeightGoalAPIClient()
        mock.saveWeightGoalResult = .success(expectedGoal)
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.currentWeight = 190
        vm.targetWeight = "178"
        vm.targetDate = fixedDate(2026, 4, 1)

        await vm.saveGoal()

        #expect(vm.saveSuccess == true)
        #expect(vm.existingGoal?.targetWeightLbs == expectedGoal.targetWeightLbs)
        #expect(vm.error == nil)
    }

    @Test("saveGoal failure sets error and leaves saveSuccess false")
    @MainActor
    func saveGoalFailureSetsError() async {
        let mock = MockWeightGoalAPIClient()
        mock.saveWeightGoalResult = .failure(APIError.internalError("Goal failed"))
        let vm = WeightGoalViewModel(apiClient: mock)
        vm.currentWeight = 190
        vm.targetWeight = "178"
        vm.targetDate = fixedDate(2026, 4, 1)

        await vm.saveGoal()

        #expect(vm.saveSuccess == false)
        #expect(vm.error != nil)
        #expect(vm.existingGoal == nil)
    }
}
