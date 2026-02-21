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
    @Published var workoutContext: WatchWorkoutContext?
    @Published var currentExerciseIndex: Int = 0
    @Published var restTimerActive: Bool = false
    @Published var restTimerTarget: Int = 0
    @Published var restTimerElapsed: Int = 0
    @Published var restExerciseName: String?

    // MARK: - Private Properties

    private let healthStore = HKHealthStore()
    #if !targetEnvironment(simulator)
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    #endif
    var startDate: Date?
    var elapsedTimer: Timer?
    var restTimer: Timer?
    var wcSession: WCSession?

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

        #if !targetEnvironment(simulator)
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

            let workoutStartDate = Date()
            startDate = workoutStartDate
            session?.startActivity(with: workoutStartDate)
            try await builder?.beginCollection(at: workoutStartDate)
        } catch {
            throw error
        }
        #else
        startDate = Date()
        #endif

        isWorkoutActive = true
        startElapsedTimer()
        sendStateToiPhone()

        #if DEBUG
        print("[WorkoutManager] Workout started")
        #endif
    }

    #if !targetEnvironment(simulator)
    /// Start a workout with a specific configuration (for mirrored sessions)
    func startWorkout(with configuration: HKWorkoutConfiguration) async throws {
        // Reset state
        heartRate = 0
        maxHeartRate = 0
        activeCalories = 0
        elapsedTime = 0

        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            builder = session?.associatedWorkoutBuilder()

            session?.delegate = self
            builder?.delegate = self

            builder?.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )

            let workoutStartDate = Date()
            startDate = workoutStartDate
            session?.startActivity(with: workoutStartDate)
            try await builder?.beginCollection(at: workoutStartDate)

            isWorkoutActive = true
            startElapsedTimer()
            sendStateToiPhone()

            #if DEBUG
            print("[WorkoutManager] Mirrored workout started")
            #endif
        } catch {
            throw error
        }
    }
    #endif

    /// End the workout and send summary back to iOS
    func endWorkout() async throws -> WatchWorkoutSummary {
        #if !targetEnvironment(simulator)
        guard let builder = builder,
              let session = session else {
            throw NSError(domain: "WorkoutManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "No active workout to end"])
        }

        let endDate = Date()

        // Stop activity
        session.stopActivity(with: endDate)

        // End collection and finish workout
        try await builder.endCollection(at: endDate)
        _ = try await builder.finishWorkout()
        #endif

        // Calculate summary
        let summary = WatchWorkoutSummary()

        #if !targetEnvironment(simulator)
        // End session
        session.end()
        self.session = nil
        self.builder = nil
        #endif

        // Clean up
        stopElapsedTimer()
        isWorkoutActive = false
        workoutContext = nil
        currentExerciseIndex = 0
        dismissRestTimer()

        // Send summary to iPhone
        sendSummaryToiPhone(summary)

        #if DEBUG
        print("[WorkoutManager] Workout ended - Duration: \(elapsedTime)s, Calories: \(activeCalories)")
        #endif

        return summary
    }
}
