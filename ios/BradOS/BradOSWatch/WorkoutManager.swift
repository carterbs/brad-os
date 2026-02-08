import HealthKit
import WatchKit
import WatchConnectivity
import Foundation

// MARK: - Shared Types (must match iOS definitions)

enum WorkoutCommand: String, Codable {
    case start
    case end
}

struct WatchWorkoutSummary: Codable {
    let avgHeartRate: Double
    let maxHeartRate: Double
    let activeCalories: Double
    let totalDuration: TimeInterval
}

// MARK: - WorkoutManager

/// Manages workout sessions on Apple Watch
/// Receives commands from iPhone via WatchConnectivity and tracks heart rate, calories, duration
@MainActor
class WorkoutManager: NSObject, ObservableObject {

    // MARK: - Published Properties

    @Published var heartRate: Double = 0
    @Published var maxHeartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var elapsedTime: TimeInterval = 0
    @Published var isWorkoutActive = false
    @Published var error: Error?

    // MARK: - Private Properties

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startDate: Date?
    private var elapsedTimer: Timer?
    private var wcSession: WCSession?

    // MARK: - Initialization

    override init() {
        super.init()
        setupWatchConnectivity()
        requestHealthKitAuthorization()
    }

    // MARK: - Setup

    private func setupWatchConnectivity() {
        guard WCSession.isSupported() else { return }

        wcSession = WCSession.default
        wcSession?.delegate = self
        wcSession?.activate()

        #if DEBUG
        print("[WorkoutManager] WatchConnectivity session activating...")
        #endif
    }

    private func requestHealthKitAuthorization() {
        let typesToRead: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned)
        ]

        let typesToWrite: Set<HKSampleType> = [
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType.workoutType()
        ]

        healthStore.requestAuthorization(toShare: typesToWrite, read: typesToRead) { success, error in
            if let error = error {
                #if DEBUG
                print("[WorkoutManager] HealthKit authorization failed: \(error)")
                #endif
            } else {
                #if DEBUG
                print("[WorkoutManager] HealthKit authorized: \(success)")
                #endif
            }
        }
    }

    // MARK: - Public Methods

    /// Start a strength training workout
    func startWorkout() async throws {
        // Reset state
        heartRate = 0
        maxHeartRate = 0
        activeCalories = 0
        elapsedTime = 0
        error = nil

        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor

        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            builder = session?.associatedWorkoutBuilder()

            session?.delegate = self
            builder?.delegate = self

            // Set up live data source for heart rate, calories, etc.
            builder?.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: config
            )

            startDate = Date()
            session?.startActivity(with: startDate!)
            try await builder?.beginCollection(at: startDate!)

            isWorkoutActive = true

            // Start elapsed time timer
            startElapsedTimer()

            // Notify iPhone that workout started
            sendStateToiPhone()

            #if DEBUG
            print("[WorkoutManager] Workout started")
            #endif

        } catch {
            self.error = error
            throw error
        }
    }

    /// Start a workout with a specific configuration (for mirrored sessions)
    func startWorkout(with configuration: HKWorkoutConfiguration) async throws {
        // Reset state
        heartRate = 0
        maxHeartRate = 0
        activeCalories = 0
        elapsedTime = 0
        error = nil

        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            builder = session?.associatedWorkoutBuilder()

            session?.delegate = self
            builder?.delegate = self

            builder?.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )

            startDate = Date()
            session?.startActivity(with: startDate!)
            try await builder?.beginCollection(at: startDate!)

            isWorkoutActive = true
            startElapsedTimer()
            sendStateToiPhone()

            #if DEBUG
            print("[WorkoutManager] Mirrored workout started")
            #endif

        } catch {
            self.error = error
            throw error
        }
    }

    /// End the workout and send summary back to iOS
    func endWorkout() async throws -> WatchWorkoutSummary {
        guard let builder = builder,
              let session = session else {
            throw WorkoutError.noActiveWorkout
        }

        let endDate = Date()

        // Stop activity
        session.stopActivity(with: endDate)

        // End collection and finish workout
        try await builder.endCollection(at: endDate)
        _ = try await builder.finishWorkout()

        // Calculate summary
        let summary = WatchWorkoutSummary(
            avgHeartRate: heartRate,
            maxHeartRate: maxHeartRate,
            activeCalories: activeCalories,
            totalDuration: elapsedTime
        )

        // End session
        session.end()

        // Clean up
        stopElapsedTimer()
        self.session = nil
        self.builder = nil
        isWorkoutActive = false

        // Send summary to iPhone
        sendSummaryToiPhone(summary)

        #if DEBUG
        print("[WorkoutManager] Workout ended - Duration: \(elapsedTime)s, Calories: \(activeCalories)")
        #endif

        return summary
    }

    /// Cancel workout without saving
    func cancelWorkout() {
        session?.end()
        stopElapsedTimer()
        session = nil
        builder = nil
        isWorkoutActive = false
        sendStateToiPhone()

        #if DEBUG
        print("[WorkoutManager] Workout cancelled")
        #endif
    }

    // MARK: - Timer

    private func startElapsedTimer() {
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, let startDate = self.startDate else { return }
                self.elapsedTime = Date().timeIntervalSince(startDate)
            }
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }

    /// Format elapsed time as MM:SS
    var formattedElapsedTime: String {
        let minutes = Int(elapsedTime) / 60
        let seconds = Int(elapsedTime) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    // MARK: - iPhone Communication

    private func sendStateToiPhone() {
        guard let session = wcSession, session.isReachable else { return }

        let message: [String: Any] = [
            "isWorkoutActive": isWorkoutActive,
            "heartRate": heartRate
        ]

        session.sendMessage(message, replyHandler: nil, errorHandler: { error in
            #if DEBUG
            print("[WorkoutManager] Failed to send state to iPhone: \(error)")
            #endif
        })
    }

    private func sendSummaryToiPhone(_ summary: WatchWorkoutSummary) {
        guard let session = wcSession else { return }

        do {
            let summaryData = try JSONEncoder().encode(summary)
            let message: [String: Any] = [
                "summary": summaryData,
                "isWorkoutActive": false
            ]

            if session.isReachable {
                session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                    #if DEBUG
                    print("[WorkoutManager] Failed to send summary to iPhone: \(error)")
                    #endif
                })
            } else {
                // Use transferUserInfo for background delivery
                session.transferUserInfo(message)
            }
        } catch {
            #if DEBUG
            print("[WorkoutManager] Failed to encode summary: \(error)")
            #endif
        }
    }

    private func sendHeartRateToiPhone() {
        guard let session = wcSession, session.isReachable else { return }

        let message: [String: Any] = ["heartRate": heartRate]
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }
}

// MARK: - Errors

enum WorkoutError: Error, LocalizedError {
    case noActiveWorkout
    case healthKitNotAvailable

    var errorDescription: String? {
        switch self {
        case .noActiveWorkout:
            return "No active workout to end"
        case .healthKitNotAvailable:
            return "HealthKit is not available"
        }
    }
}

// MARK: - WCSessionDelegate

extension WorkoutManager: WCSessionDelegate {

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        #if DEBUG
        Task { @MainActor in
            if let error = error {
                print("[WorkoutManager] WCSession activation failed: \(error)")
            } else {
                print("[WorkoutManager] WCSession activated: \(activationState.rawValue)")
            }
        }
        #endif
    }

    /// Receive commands from iPhone
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in
            guard let commandString = message["command"] as? String,
                  let command = WorkoutCommand(rawValue: commandString) else {
                replyHandler(["success": false, "error": "Invalid command"])
                return
            }

            switch command {
            case .start:
                do {
                    try await self.startWorkout()
                    replyHandler(["success": true])
                } catch {
                    replyHandler(["success": false, "error": error.localizedDescription])
                }

            case .end:
                do {
                    let summary = try await self.endWorkout()
                    let summaryData = try JSONEncoder().encode(summary)
                    replyHandler(["success": true, "summary": summaryData])
                } catch {
                    replyHandler(["success": false, "error": error.localizedDescription])
                }
            }
        }
    }

    /// Handle messages without reply handler
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            guard let commandString = message["command"] as? String,
                  let command = WorkoutCommand(rawValue: commandString) else {
                return
            }

            switch command {
            case .start:
                try? await self.startWorkout()
            case .end:
                _ = try? await self.endWorkout()
            }
        }
    }

    /// Handle queued user info from iPhone (background delivery)
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        Task { @MainActor in
            guard let commandString = userInfo["command"] as? String,
                  let command = WorkoutCommand(rawValue: commandString) else {
                return
            }

            switch command {
            case .start:
                try? await self.startWorkout()
            case .end:
                _ = try? await self.endWorkout()
            }
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            #if DEBUG
            print("[WorkoutManager] Session state: \(fromState.rawValue) -> \(toState.rawValue)")
            #endif

            switch toState {
            case .stopped:
                if self.isWorkoutActive {
                    _ = try? await self.endWorkout()
                }
            default:
                break
            }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor in
            self.error = error
            self.isWorkoutActive = false
            self.stopElapsedTimer()

            #if DEBUG
            print("[WorkoutManager] Workout session failed: \(error)")
            #endif
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        Task { @MainActor in
            for type in collectedTypes {
                guard let quantityType = type as? HKQuantityType else { continue }

                let statistics = workoutBuilder.statistics(for: quantityType)

                switch quantityType {
                case HKQuantityType(.heartRate):
                    let unit = HKUnit.count().unitDivided(by: .minute())
                    if let value = statistics?.mostRecentQuantity()?.doubleValue(for: unit) {
                        self.heartRate = value
                        if value > self.maxHeartRate {
                            self.maxHeartRate = value
                        }
                        // Periodically send heart rate to iPhone
                        self.sendHeartRateToiPhone()
                    }

                case HKQuantityType(.activeEnergyBurned):
                    let unit = HKUnit.kilocalorie()
                    if let value = statistics?.sumQuantity()?.doubleValue(for: unit) {
                        self.activeCalories = value
                    }

                default:
                    break
                }
            }
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        #if DEBUG
        Task { @MainActor in
            print("[WorkoutManager] Collected workout event")
        }
        #endif
    }
}
