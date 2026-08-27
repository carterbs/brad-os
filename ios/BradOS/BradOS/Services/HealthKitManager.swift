import HealthKit
import Foundation
import BradOSCore

protocol HealthKitObserverExecuting: AnyObject {
    func execute(_ query: HKQuery)
}

extension HKHealthStore: HealthKitObserverExecuting {}

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

    @Published var isAuthorized: Bool
    @Published var isLoading = false

    // MARK: - Private Properties

    let healthStore: HKHealthStore
    private let observerExecutor: HealthKitObserverExecuting

    private static let authorizationRequestedKey = "healthkit_authorization_requested"
    private static let cachedBaselineKey = "healthkit_cached_recovery_baseline"
    private static let baselineUpdatedKey = "healthkit_cached_recovery_baseline_updated"

    private let readTypes: Set<HKObjectType> = [
        HKQuantityType(.heartRateVariabilitySDNN),
        HKQuantityType(.bodyMass),
        HKQuantityType(.restingHeartRate),
        HKQuantityType(.heartRate),
        HKCategoryType(.sleepAnalysis)
    ]

    private let backgroundDeliveryTypes: [HKSampleType] = [
        HKQuantityType(.heartRateVariabilitySDNN),
        HKCategoryType(.sleepAnalysis),
        HKQuantityType(.restingHeartRate),
        HKQuantityType(.bodyMass)
    ]

    private var backgroundObserverQueries: [HKObserverQuery] = []

    // Cache baseline to avoid recalculating every time
    var cachedBaseline: RecoveryBaseline?
    var baselineLastUpdated: Date?

    // MARK: - Initialization

    init(
        healthStore: HKHealthStore = HKHealthStore(),
        observerExecutor: HealthKitObserverExecuting? = nil
    ) {
        self.healthStore = healthStore
        self.observerExecutor = observerExecutor ?? healthStore

        let defaults = UserDefaults.standard
        isAuthorized = defaults.bool(forKey: Self.authorizationRequestedKey)
        baselineLastUpdated = defaults.object(forKey: Self.baselineUpdatedKey) as? Date

        if let data = defaults.data(forKey: Self.cachedBaselineKey) {
            cachedBaseline = try? JSONDecoder().decode(RecoveryBaseline.self, from: data)
        }
    }

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
            markAuthorizationRequested()
            await enableBackgroundDelivery()
        } catch {
            throw HealthKitError.queryFailed(error)
        }
    }

    /// Starts and retains observer queries synchronously during app initialization.
    func registerBackgroundObservers(onUpdate: @escaping @MainActor () async -> Void) {
        guard isHealthDataAvailable else {
            HealthKitBackgroundLogger.warning("HealthKit unavailable; observers not registered")
            return
        }
        guard backgroundObserverQueries.isEmpty else {
            HealthKitBackgroundLogger.info("HealthKit observers already registered")
            return
        }

        HealthKitBackgroundLogger.info("Registering HealthKit background observers")
        backgroundObserverQueries = backgroundDeliveryTypes.map { sampleType in
            let query = makeBackgroundObserver(for: sampleType, onUpdate: onUpdate)
            observerExecutor.execute(query)
            return query
        }
        HealthKitBackgroundLogger.info(
            "Registered \(backgroundObserverQueries.count) HealthKit background observers"
        )
    }

    /// Reconciles authorization state and enables hourly delivery after observers exist.
    func prepareBackgroundDelivery() async {
        guard isHealthDataAvailable else { return }

        await refreshAuthorizationState()
        await enableBackgroundDelivery()
    }

    var registeredBackgroundObserverCount: Int {
        backgroundObserverQueries.count
    }

    /// Stores a calculated baseline for short background wakes.
    func cacheBaseline(_ baseline: RecoveryBaseline) {
        cachedBaseline = baseline
        baselineLastUpdated = Date()

        let defaults = UserDefaults.standard
        if let data = try? JSONEncoder().encode(baseline) {
            defaults.set(data, forKey: Self.cachedBaselineKey)
        }
        defaults.set(baselineLastUpdated, forKey: Self.baselineUpdatedKey)
    }

    // MARK: - Background Delivery

    private func refreshAuthorizationState() async {
        do {
            let status = try await authorizationRequestStatus()
            if status == .unnecessary {
                markAuthorizationRequested()
                HealthKitBackgroundLogger.info("HealthKit authorization state restored")
            } else {
                HealthKitBackgroundLogger.warning(
                    "HealthKit reports that authorization may still be required"
                )
            }
        } catch {
            HealthKitBackgroundLogger.error(
                "Authorization-state refresh failed: \(error.localizedDescription)"
            )
        }
    }

    private func authorizationRequestStatus() async throws -> HKAuthorizationRequestStatus {
        try await withCheckedThrowingContinuation { continuation in
            healthStore.getRequestStatusForAuthorization(toShare: [], read: readTypes) { status, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: status)
                }
            }
        }
    }

    private func markAuthorizationRequested() {
        isAuthorized = true
        UserDefaults.standard.set(true, forKey: Self.authorizationRequestedKey)
    }

    private func makeBackgroundObserver(
        for sampleType: HKSampleType,
        onUpdate: @escaping @MainActor () async -> Void
    ) -> HKObserverQuery {
        HKObserverQuery(sampleType: sampleType, predicate: nil) { _, completion, error in
            if let error {
                HealthKitBackgroundLogger.error(
                    "Observer error for \(sampleType.identifier): \(error.localizedDescription)"
                )
                completion()
                return
            }

            HealthKitBackgroundLogger.info("Observer fired for \(sampleType.identifier)")
            Task { @MainActor in
                defer {
                    HealthKitBackgroundLogger.info(
                        "Observer completed for \(sampleType.identifier)"
                    )
                    completion()
                }
                await onUpdate()
            }
        }
    }

    private func enableBackgroundDelivery() async {
        for sampleType in backgroundDeliveryTypes {
            do {
                try await enableBackgroundDelivery(for: sampleType)
                HealthKitBackgroundLogger.info(
                    "Enabled hourly delivery for \(sampleType.identifier)"
                )
            } catch {
                HealthKitBackgroundLogger.error(
                    "Failed to enable delivery for \(sampleType.identifier): \(error.localizedDescription)"
                )
            }
        }
    }

    private func enableBackgroundDelivery(for sampleType: HKSampleType) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.enableBackgroundDelivery(for: sampleType, frequency: .hourly) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: HealthKitError.notAuthorized)
                }
            }
        }
    }

    // MARK: - HRV Queries

    /// Fetch today's average HRV (all samples from last 24 hours, averaged).
    /// Falls back to the single most recent sample if no samples exist in the last 24 hours.
    func fetchLatestHRV() async throws -> Double? {
        let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
        let oneDayAgo = Calendar.current.date(byAdding: .hour, value: -24, to: Date()) ?? Date()

        // First try: get all samples from the last 24 hours and average them
        let predicate = HKQuery.predicateForSamples(withStart: oneDayAgo, end: Date())
        let recentDescriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: hrvType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)]
        )

        do {
            let results = try await recentDescriptor.result(for: healthStore)
            if !results.isEmpty {
                let values = results.map { $0.quantity.doubleValue(for: .secondUnit(with: .milli)) }
                return values.reduce(0, +) / Double(values.count)
            }

            // Fallback: get the single most recent sample (any date)
            let latestDescriptor = HKSampleQueryDescriptor(
                predicates: [.quantitySample(type: hrvType)],
                sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
                limit: 1
            )
            let latest = try await latestDescriptor.result(for: healthStore)
            return latest.first?.quantity.doubleValue(for: .secondUnit(with: .milli))
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
}
