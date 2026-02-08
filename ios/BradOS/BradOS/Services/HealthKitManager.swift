import HealthKit
import Foundation

// MARK: - HealthKit Errors

enum HealthKitError: Error, LocalizedError {
    case notAvailable
    case notAuthorized
    case noData
    case queryFailed(Error)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device"
        case .notAuthorized:
            return "HealthKit authorization was denied"
        case .noData:
            return "No data available"
        case .queryFailed(let error):
            return "HealthKit query failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - HealthKitManager

/// Manages HealthKit data access for recovery tracking
@MainActor
class HealthKitManager: ObservableObject {

    // MARK: - Published Properties

    @Published var isAuthorized = false
    @Published var latestRecovery: RecoveryData?
    @Published var isLoading = false
    @Published var error: HealthKitError?

    // MARK: - Private Properties

    private let healthStore = HKHealthStore()

    private let readTypes: Set<HKObjectType> = [
        HKQuantityType(.heartRateVariabilitySDNN),
        HKQuantityType(.bodyMass),
        HKQuantityType(.restingHeartRate),
        HKQuantityType(.heartRate),
        HKCategoryType(.sleepAnalysis)
    ]

    // Cache baseline to avoid recalculating every time
    private var cachedBaseline: RecoveryBaseline?
    private var baselineLastUpdated: Date?

    // MARK: - Public Accessors

    /// Get cached baseline for sync (returns nil if not yet calculated)
    func getCachedBaseline() async -> RecoveryBaseline? {
        // If we have a recent cached baseline, return it
        if let cached = cachedBaseline {
            return cached
        }
        // Otherwise try to calculate it
        return try? await getOrUpdateBaseline()
    }

    // MARK: - Authorization

    /// Check if HealthKit is available on this device
    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    /// Request authorization to read health data
    func requestAuthorization() async throws {
        guard isHealthDataAvailable else {
            throw HealthKitError.notAvailable
        }

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - HRV Queries

    /// Fetch the most recent HRV reading
    func fetchLatestHRV() async throws -> Double? {
        let hrvType = HKQuantityType(.heartRateVariabilitySDNN)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: hrvType)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.first?.quantity.doubleValue(for: .secondUnit(with: .milli))
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Fetch HRV history for baseline calculation
    func fetchHRVHistory(days: Int) async throws -> [HRVReading] {
        let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date())
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: hrvType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)]
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.map { sample in
                HRVReading(
                    date: sample.endDate,
                    valueMs: sample.quantity.doubleValue(for: .secondUnit(with: .milli))
                )
            }
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - RHR Queries

    /// Fetch today's resting heart rate
    func fetchTodayRHR() async throws -> Double? {
        let rhrType = HKQuantityType(.restingHeartRate)
        let startOfDay = Calendar.current.startOfDay(for: Date())

        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date())
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: rhrType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.first?.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Fetch RHR history for baseline calculation
    func fetchRHRHistory(days: Int) async throws -> [RHRReading] {
        let rhrType = HKQuantityType(.restingHeartRate)
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date())
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: rhrType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)]
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.map { sample in
                RHRReading(
                    date: sample.endDate,
                    valueBpm: sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                )
            }
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - Weight Queries

    /// Fetch the most recent weight reading
    func fetchLatestWeight() async throws -> Double? {
        let weightType = HKQuantityType(.bodyMass)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: weightType)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.first?.quantity.doubleValue(for: .pound())
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - Workout Heart Rate Queries

    /// A single heart rate sample
    struct HeartRateSample: Equatable {
        let date: Date
        let bpm: Double
    }

    /// Fetch heart rate samples during a workout time window
    func fetchWorkoutHeartRate(
        startDate: Date,
        endDate: Date
    ) async throws -> [HeartRateSample] {
        let hrType = HKQuantityType(.heartRate)
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)

        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: hrType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.map { sample in
                HeartRateSample(
                    date: sample.startDate,
                    bpm: sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                )
            }
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Calculate average and max HR from HealthKit samples for a time window
    func calculateWorkoutHR(
        startDate: Date,
        endDate: Date
    ) async throws -> (avgHR: Double, maxHR: Double, sampleCount: Int)? {
        let samples = try await fetchWorkoutHeartRate(startDate: startDate, endDate: endDate)

        guard !samples.isEmpty else { return nil }

        let totalBpm = samples.reduce(0.0) { $0 + $1.bpm }
        let avgHR = totalBpm / Double(samples.count)
        let maxHR = samples.max(by: { $0.bpm < $1.bpm })?.bpm ?? avgHR

        return (avgHR: avgHR, maxHR: maxHR, sampleCount: samples.count)
    }

    /// Fetch the latest body weight in kilograms
    func fetchLatestWeightKg() async throws -> Double? {
        guard let lbs = try await fetchLatestWeight() else { return nil }
        return lbs * 0.453592
    }

    /// A single weight reading
    struct WeightReading {
        let date: Date
        let valueLbs: Double
    }

    /// Fetch weight history for a given number of days
    func fetchWeightHistory(days: Int) async throws -> [WeightReading] {
        let weightType = HKQuantityType(.bodyMass)
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date())
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: weightType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate)]
        )

        do {
            let results = try await descriptor.result(for: healthStore)
            return results.map { sample in
                WeightReading(
                    date: sample.endDate,
                    valueLbs: sample.quantity.doubleValue(for: .pound())
                )
            }
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - Sleep Queries

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

                switch HKCategoryValueSleepAnalysis(rawValue: sample.value) {
                case .inBed:
                    metrics.inBed += duration
                case .asleepCore:
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
                case .asleepUnspecified:
                    // Treat unspecified as core sleep for older data
                    metrics.core += duration
                    metrics.totalSleep += duration
                default:
                    break
                }
            }

            // If inBed wasn't explicitly tracked, estimate from total sleep + awake
            if metrics.inBed == 0 && metrics.totalSleep > 0 {
                metrics.inBed = metrics.totalSleep + metrics.awake
            }

            return metrics
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    // MARK: - Recovery Score Calculation

    /// Calculate complete recovery data
    func calculateRecoveryScore() async throws -> RecoveryData {
        isLoading = true
        defer { isLoading = false }

        // Fetch current values
        async let hrvTask = fetchLatestHRV()
        async let rhrTask = fetchTodayRHR()
        async let sleepTask = fetchSleepData(for: Date())

        let hrv = try await hrvTask
        let rhr = try await rhrTask
        let sleep = try await sleepTask

        // Get or update baseline
        let baseline = try await getOrUpdateBaseline()

        // Calculate recovery
        let recovery = RecoveryData.calculate(
            date: Date(),
            hrvMs: hrv ?? baseline.hrvMedian,  // Use baseline if no reading
            hrvBaseline: baseline,
            rhrBpm: rhr ?? baseline.rhrMedian,  // Use baseline if no reading
            sleepMetrics: sleep
        )

        latestRecovery = recovery
        return recovery
    }

    // MARK: - Baseline Management

    /// Get cached baseline or calculate new one
    private func getOrUpdateBaseline() async throws -> RecoveryBaseline {
        // Update baseline if more than 24 hours old
        let needsUpdate = baselineLastUpdated.map {
            Date().timeIntervalSince($0) > 86400
        } ?? true

        if let cached = cachedBaseline, !needsUpdate {
            return cached
        }

        // Fetch 60 days of history
        async let hrvHistory = fetchHRVHistory(days: 60)
        async let rhrHistory = fetchRHRHistory(days: 60)

        let hrvReadings = (try? await hrvHistory) ?? []
        let rhrReadings = (try? await rhrHistory) ?? []

        // Calculate baseline if we have data, otherwise use defaults
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

    /// Force refresh of baseline data
    func refreshBaseline() async throws -> RecoveryBaseline {
        cachedBaseline = nil
        baselineLastUpdated = nil
        return try await getOrUpdateBaseline()
    }

    // MARK: - Convenience Methods

    /// Refresh all recovery data
    func refresh() async {
        do {
            error = nil
            _ = try await calculateRecoveryScore()
        } catch let healthError as HealthKitError {
            error = healthError
        } catch {
            self.error = .queryFailed(error)
        }
    }
}
