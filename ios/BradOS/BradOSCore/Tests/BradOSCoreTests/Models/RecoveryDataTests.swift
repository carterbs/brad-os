import Testing
import Foundation
@testable import BradOSCore

@Suite("RecoveryData")
struct RecoveryDataTests {

    // MARK: - RecoveryState displayName

    @Test("RecoveryState displayName returns correct strings")
    func recoveryStateDisplayName() {
        #expect(RecoveryState.ready.displayName == "Ready")
        #expect(RecoveryState.moderate.displayName == "Moderate")
        #expect(RecoveryState.recover.displayName == "Recover")
    }

    @Test("RecoveryState raw values are correct for Codable")
    func recoveryStateRawValues() {
        #expect(RecoveryState.ready.rawValue == "ready")
        #expect(RecoveryState.moderate.rawValue == "moderate")
        #expect(RecoveryState.recover.rawValue == "recover")
    }

    @Test("RecoveryState CaseIterable has 3 cases")
    func recoveryStateCaseIterable() {
        #expect(RecoveryState.allCases.count == 3)
    }

    // MARK: - RecoveryData.calculate — Score & State

    @Test("calculate returns ready state for above-baseline HRV and good sleep")
    func calculateReadyState() {
        // HRV=50 (+1σ above median=40), RHR=55 (5 below median=60), perfect sleep
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(
            inBed: 28800,       // 8h
            totalSleep: 27000,  // 7.5h
            core: 13500,
            deep: 5400,         // 20% of 7.5h
            rem: 6750,
            awake: 1800
        )
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 50.0,
            hrvBaseline: baseline,
            rhrBpm: 55.0,
            sleepMetrics: sleep
        )
        // hrvScore=75, rhrScore=75, sleepScore=100 → total=Int(52.5+15+10)=77
        #expect(result.state == .ready)
        #expect(result.score >= 70)
    }

    @Test("calculate returns moderate state for near-baseline values")
    func calculateModerateState() {
        // HRV=40 (exactly baseline), RHR=62 (slightly elevated), decent sleep
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(
            inBed: 28800,       // 8h
            totalSleep: 25200,  // 7h
            core: 12600,
            deep: 3780,         // 15% of 7h
            rem: 6300,
            awake: 3600
        )
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 40.0,
            hrvBaseline: baseline,
            rhrBpm: 62.0,
            sleepMetrics: sleep
        )
        // hrvScore=50, rhrScore=40, sleepScore=100 → total=Int(35+8+10)=53
        #expect(result.state == .moderate)
        #expect(result.score >= 50)
        #expect(result.score < 70)
    }

    @Test("calculate returns recover state for well-below-baseline HRV")
    func calculateRecoverState() {
        // HRV=15 (far below baseline), RHR=75 (very elevated), poor sleep
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(
            inBed: 21600,       // 6h
            totalSleep: 18000,  // 5h
            core: 9000,
            deep: 1800,         // 10% of 5h
            rem: 4500,
            awake: 3600
        )
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 15.0,
            hrvBaseline: baseline,
            rhrBpm: 75.0,
            sleepMetrics: sleep
        )
        // hrvScore=0, rhrScore=0, sleepScore≈77.98 → total=Int(0+0+7.798)=7
        #expect(result.state == .recover)
        #expect(result.score < 50)
    }

    @Test("calculate score is clamped 0-100")
    func calculateScoreClamped() {
        // Extreme HRV above baseline → score still ≤ 100
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(
            inBed: 32400,       // 9h
            totalSleep: 30600,  // 8.5h
            core: 15300,
            deep: 6120,         // 20%
            rem: 7650,
            awake: 1800
        )
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 200.0,       // extreme HRV
            hrvBaseline: baseline,
            rhrBpm: 40.0,       // very low RHR
            sleepMetrics: sleep
        )
        #expect(result.score <= 100)
        #expect(result.score >= 0)
    }

    // MARK: - RecoveryData.calculate — Component Values

    @Test("calculate hrvVsBaseline is percentage difference from median")
    func calculateHrvVsBaseline() {
        // HRV=48, median=40 → (48-40)/40*100 = 20%
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 48.0,
            hrvBaseline: baseline,
            rhrBpm: 60.0,
            sleepMetrics: sleep
        )
        #expect(abs(result.hrvVsBaseline - 20.0) < 0.001)
    }

    @Test("calculate rhrVsBaseline is BPM difference from median")
    func calculateRhrVsBaseline() {
        // RHR=65, median=60 → 65-60 = 5.0
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 40.0,
            hrvBaseline: baseline,
            rhrBpm: 65.0,
            sleepMetrics: sleep
        )
        #expect(abs(result.rhrVsBaseline - 5.0) < 0.001)
    }

    @Test("calculate converts sleep totalSleep seconds to hours")
    func calculateSleepSecondsToHours() {
        // totalSleep=7.5*3600=27000 → sleepHours=7.5
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 30000, totalSleep: 27000, core: 0, deep: 0, rem: 0, awake: 0)
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 40.0,
            hrvBaseline: baseline,
            rhrBpm: 60.0,
            sleepMetrics: sleep
        )
        #expect(abs(result.sleepHours - 7.5) < 0.001)
    }

    // MARK: - RecoveryData.calculate — Edge Cases

    @Test("calculate handles zero stddev baseline gracefully")
    func calculateZeroStdDev() {
        // stdDev=0 → should not crash, hrvDelta defaults to 0
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 0.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 50.0,
            hrvBaseline: baseline,
            rhrBpm: 60.0,
            sleepMetrics: sleep
        )
        // hrvDelta=0 → hrvScore=50 (no divide by zero crash)
        #expect(result.score >= 0)
        #expect(result.score <= 100)
    }

    @Test("calculate handles zero median baseline gracefully")
    func calculateZeroMedian() {
        // median=0 → should not crash (no divide-by-zero in hrvVsBaseline)
        let baseline = RecoveryBaseline(hrvMedian: 0.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        let result = RecoveryData.calculate(
            date: Date(),
            hrvMs: 40.0,
            hrvBaseline: baseline,
            rhrBpm: 60.0,
            sleepMetrics: sleep
        )
        // hrvVsBaseline = 0 (guarded by median > 0 check)
        #expect(result.hrvVsBaseline == 0.0)
        #expect(result.score >= 0)
    }

    // MARK: - RecoveryBaseline

    @Test("RecoveryBaseline.calculate computes median and stddev")
    func baselineCalculateMedianAndStdDev() {
        let hrv = [30.0, 35.0, 40.0, 45.0, 50.0]
        let rhr = [55.0, 58.0, 60.0, 62.0, 65.0]
        let baseline = RecoveryBaseline.calculate(hrvReadings: hrv, rhrReadings: rhr)
        // sorted median: hrv[2]=40, rhr[2]=60
        #expect(baseline.hrvMedian == 40.0)
        #expect(baseline.rhrMedian == 60.0)
        // stddev of [30,35,40,45,50]: mean=40, variance=250/4=62.5, stddev≈7.906
        #expect(baseline.hrvStdDev > 0)
    }

    @Test("RecoveryBaseline.calculate with empty arrays returns zeros")
    func baselineCalculateEmptyArrays() {
        let baseline = RecoveryBaseline.calculate(hrvReadings: [], rhrReadings: [])
        #expect(baseline.hrvMedian == 0)
        #expect(baseline.rhrMedian == 0)
        #expect(baseline.hrvStdDev == 0)
    }

    @Test("RecoveryBaseline.calculate with single value returns that value")
    func baselineCalculateSingleValue() {
        let baseline = RecoveryBaseline.calculate(hrvReadings: [42.0], rhrReadings: [58.0])
        #expect(baseline.hrvMedian == 42.0)
        #expect(baseline.rhrMedian == 58.0)
        #expect(baseline.hrvStdDev == 0)
    }

    @Test("RecoveryBaseline.default returns documented values")
    func baselineDefault() {
        let baseline = RecoveryBaseline.default
        #expect(baseline.hrvMedian == 36.0)
        #expect(baseline.hrvStdDev == 15.0)
        #expect(baseline.rhrMedian == 60.0)
    }

    // MARK: - SleepMetrics

    @Test("SleepMetrics efficiency is totalSleep/inBed percentage")
    func sleepMetricsEfficiency() {
        // inBed=8h=28800, totalSleep=7h=25200 → 87.5%
        let metrics = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        #expect(abs(metrics.efficiency - 87.5) < 0.001)
    }

    @Test("SleepMetrics efficiency is 0 when inBed is 0")
    func sleepMetricsEfficiencyZeroInBed() {
        let metrics = SleepMetrics(inBed: 0, totalSleep: 25200, core: 0, deep: 0, rem: 0, awake: 0)
        #expect(metrics.efficiency == 0.0)
    }

    @Test("SleepMetrics deepPercent is deep/totalSleep percentage")
    func sleepMetricsDeepPercent() {
        // totalSleep=7h=25200, deep=1.4h=5040 → 20%
        let metrics = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 5040, rem: 0, awake: 0)
        #expect(abs(metrics.deepPercent - 20.0) < 0.001)
    }

    @Test("SleepMetrics deepPercent is 0 when totalSleep is 0")
    func sleepMetricsDeepPercentZeroSleep() {
        let metrics = SleepMetrics(inBed: 0, totalSleep: 0, core: 0, deep: 3600, rem: 0, awake: 0)
        #expect(metrics.deepPercent == 0.0)
    }

    @Test("SleepMetrics default initializer has all zeros")
    func sleepMetricsDefaultInit() {
        let metrics = SleepMetrics()
        #expect(metrics.inBed == 0)
        #expect(metrics.totalSleep == 0)
        #expect(metrics.core == 0)
        #expect(metrics.deep == 0)
        #expect(metrics.rem == 0)
        #expect(metrics.awake == 0)
    }

    // MARK: - Codable Round-Trip

    @Test("RecoveryData encodes and decodes correctly")
    func recoveryDataCodableRoundTrip() throws {
        let baseline = RecoveryBaseline(hrvMedian: 40.0, hrvStdDev: 10.0, rhrMedian: 60.0)
        let sleep = SleepMetrics(inBed: 28800, totalSleep: 25200, core: 0, deep: 3780, rem: 0, awake: 0)
        let original = RecoveryData.calculate(
            date: Date(),
            hrvMs: 45.0,
            hrvBaseline: baseline,
            rhrBpm: 58.0,
            sleepMetrics: sleep
        )

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(RecoveryData.self, from: data)

        #expect(decoded.score == original.score)
        #expect(decoded.state == original.state)
        #expect(abs(decoded.hrvMs - original.hrvMs) < 0.001)
    }

    @Test("RecoveryBaseline encodes and decodes correctly")
    func recoveryBaselineCodableRoundTrip() throws {
        let original = RecoveryBaseline(hrvMedian: 38.5, hrvStdDev: 12.3, rhrMedian: 57.0)

        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(RecoveryBaseline.self, from: data)

        #expect(decoded == original)
    }
}
