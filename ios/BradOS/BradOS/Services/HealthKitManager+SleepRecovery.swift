import HealthKit
import Foundation
import BradOSCore

// MARK: - Sleep Queries

extension HealthKitManager {

    /// Fetch sleep data for a specific date (looks at previous night's sleep)
    func fetchSleepData(for date: Date) async throws -> SleepMetrics {
        let sleepType = HKCategoryType(.sleepAnalysis)

        // Sleep for a given date typically starts the evening before
        // Look from 6 PM previous day to noon of the given day
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let sleepWindowStart = calendar.date(byAdding: .hour, value: -6, to: startOfDay) ?? startOfDay
        let sleepWindowEnd = calendar.date(byAdding: .hour, value: 12, to: startOfDay) ?? date

        let predicate = HKQuery.predicateForSamples(withStart: sleepWindowStart, end: sleepWindowEnd)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: sleepType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )

        do {
            let samples = try await descriptor.result(for: healthStore)
            var metrics = SleepMetrics()
            for sample in samples {
                let duration = sample.endDate.timeIntervalSince(sample.startDate)
                Self.accumulateSleepSample(value: sample.value, duration: duration, into: &metrics)
            }

            if metrics.inBed == 0 && metrics.totalSleep > 0 {
                metrics.inBed = metrics.totalSleep + metrics.awake
            }
            return metrics
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Fetch sleep history for multiple nights, grouped by date.
    /// Uses 6 PM cutoff: samples after 6 PM are attributed to the next day's sleep.
    func fetchSleepHistory(days: Int) async throws -> [(date: String, metrics: SleepMetrics)] {
        let sleepType = HKCategoryType(.sleepAnalysis)
        let calendar = Calendar.current
        let now = Date()
        let startDate = calendar.date(byAdding: .day, value: -days, to: now) ?? now

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: now)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: sleepType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        dateFormatter.timeZone = .current

        do {
            let samples = try await descriptor.result(for: healthStore)
            let nightMetrics = groupSamplesIntoNights(
                samples, calendar: calendar, dateFormatter: dateFormatter
            )

            return nightMetrics.map { date, metrics in
                var adjusted = metrics
                if adjusted.inBed == 0 && adjusted.totalSleep > 0 {
                    adjusted.inBed = adjusted.totalSleep + adjusted.awake
                }
                return (date: date, metrics: adjusted)
            }.sorted { $0.date > $1.date }
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Accumulate a single sleep sample into metrics
    static func accumulateSleepSample(
        value: Int, duration: TimeInterval, into metrics: inout SleepMetrics
    ) {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed:
            metrics.inBed += duration
        case .asleepCore, .asleepUnspecified:
            metrics.core += duration
            metrics.totalSleep += duration
        case .asleepDeep:
            metrics.deep += duration
            metrics.totalSleep += duration
        case .asleepREM:
            metrics.rem += duration
            metrics.totalSleep += duration
        case .awake:
            metrics.awake += duration
        default:
            break
        }
    }

    /// Group sleep samples into nights using 6 PM cutoff
    private func groupSamplesIntoNights(
        _ samples: [HKCategorySample],
        calendar: Calendar,
        dateFormatter: DateFormatter
    ) -> [String: SleepMetrics] {
        var nightMetrics: [String: SleepMetrics] = [:]

        for sample in samples {
            let duration = sample.endDate.timeIntervalSince(sample.startDate)
            let startHour = calendar.component(.hour, from: sample.startDate)
            let nightDate: Date
            if startHour >= 18 {
                let startOfSampleDay = calendar.startOfDay(for: sample.startDate)
                nightDate = calendar.date(
                    byAdding: .day, value: 1, to: startOfSampleDay
                ) ?? sample.startDate
            } else {
                nightDate = calendar.startOfDay(for: sample.startDate)
            }
            let dateStr = dateFormatter.string(from: nightDate)

            var metrics = nightMetrics[dateStr] ?? SleepMetrics()
            Self.accumulateSleepSample(value: sample.value, duration: duration, into: &metrics)
            nightMetrics[dateStr] = metrics
        }

        return nightMetrics
    }
}

// MARK: - Recovery Score Calculation

extension HealthKitManager {

    /// Calculate complete recovery data
    func calculateRecoveryScore() async throws -> RecoveryData {
        isLoading = true
        defer { isLoading = false }

        async let hrvTask = fetchLatestHRV()
        async let rhrTask = fetchTodayRHR()
        async let sleepTask = fetchSleepData(for: Date())

        let hrv = try await hrvTask
        let rhr = try await rhrTask
        let sleep = try await sleepTask

        guard hrv != nil || rhr != nil else {
            throw HealthKitError.noData
        }

        let baseline = try await getOrUpdateBaseline()

        let recovery = RecoveryData.calculate(
            date: Date(),
            hrvMs: hrv ?? baseline.hrvMedian,
            hrvBaseline: baseline,
            rhrBpm: rhr ?? baseline.rhrMedian,
            sleepMetrics: sleep
        )

        return recovery
    }

    /// Get cached baseline or calculate new one
    func getOrUpdateBaseline() async throws -> RecoveryBaseline {
        let needsUpdate = baselineLastUpdated.map {
            Date().timeIntervalSince($0) > 86400
        } ?? true

        if let cached = cachedBaseline, !needsUpdate {
            return cached
        }

        async let hrvHistory = fetchHRVHistory(days: 60)
        async let rhrHistory = fetchRHRHistory(days: 60)

        let hrvReadings = (try? await hrvHistory) ?? []
        let rhrReadings = (try? await rhrHistory) ?? []

        let baseline: RecoveryBaseline
        if hrvReadings.count >= 7 && rhrReadings.count >= 7 {
            baseline = RecoveryBaseline.calculate(
                hrvReadings: hrvReadings.map(\.valueMs),
                rhrReadings: rhrReadings.map(\.valueBpm)
            )
        } else {
            baseline = .default
        }

        cachedBaseline = baseline
        baselineLastUpdated = Date()
        return baseline
    }

    /// Refresh all recovery data
    func refresh() async {
        do {
            _ = try await calculateRecoveryScore()
        } catch {
            // Silently handle refresh errors
        }
    }
}
