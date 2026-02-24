import Testing
@testable import Brad_OS
import BradOSCore
import Foundation

@Suite("WeightGoalViewModel")
struct WeightGoalViewModelTests {

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

    @Test("updateTrend requires at least 7 smoothed points")
    @MainActor
    func updateTrendRequiresSevenPoints() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.allSmoothedHistory = makeWeightPoints(startDate: fixedDate(2026, 2, 1), startWeight: 180, count: 6, dailyDelta: -0.2)
        vm.updateTrend()
        #expect(vm.trendSlope == nil)

        vm.allSmoothedHistory = makeWeightPoints(startDate: fixedDate(2026, 2, 1), startWeight: 180, count: 7, dailyDelta: -0.2)
        vm.updateTrend()
        #expect(vm.trendSlope != nil)
    }

    @Test("updatePrediction yields on-track predicted date when slope moves toward target")
    @MainActor
    func updatePredictionOnTrackWhenMovingTowardTarget() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "190"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 30)
        vm.allSmoothedHistory = makeWeightPoints(
            startDate: Date().addingTimeInterval(-13 * 60 * 60 * 24),
            startWeight: 205,
            count: 14,
            dailyDelta: -1
        )

        vm.updateTrend()
        vm.updatePrediction()

        #expect(vm.prediction?.predictedDate != nil)
        #expect(vm.prediction?.isOnTrack == true)
        #expect(vm.prediction?.daysRemaining != nil)
    }

    @Test("updatePrediction returns nil predictedDate when trend moves away from target")
    @MainActor
    func updatePredictionAwayFromTargetHasNilDate() {
        let vm = WeightGoalViewModel(apiClient: MockWeightGoalAPIClient())
        vm.targetWeight = "180"
        vm.targetDate = Date().addingTimeInterval(60 * 60 * 24 * 7)
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
