import HealthKit
import WatchConnectivity
import Foundation
import BradOSCore

// MARK: - Shared Types (iOS <-> WatchOS)

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

// MARK: - WatchWorkoutController

/// Controls workout session mirroring between iPhone and Apple Watch
/// Uses WatchConnectivity to send commands from iOS to Watch
/// The Watch receives commands and manages the actual workout session
@MainActor
class WatchWorkoutController: NSObject, ObservableObject {

    // MARK: - Published Properties

    @Published var isWorkoutActive = false
    @Published var workoutSummary: WatchWorkoutSummary?
    @Published var currentHeartRate: Double = 0
    @Published var error: Error?
    @Published var isWatchReachable = false

    // MARK: - Private Properties

    private var wcSession: WCSession?

    // MARK: - Initialization

    override init() {
        super.init()
        setupWatchConnectivity()
    }

    // MARK: - WatchConnectivity Setup

    private func setupWatchConnectivity() {
        guard WCSession.isSupported() else {
            #if DEBUG
            print("[WatchWorkoutController] WatchConnectivity not supported")
            #endif
            return
        }

        wcSession = WCSession.default
        wcSession?.delegate = self
        wcSession?.activate()

        #if DEBUG
        print("[WatchWorkoutController] WatchConnectivity session activating...")
        #endif
    }

    // MARK: - Public Methods

    /// Check if Watch is paired and app is installed
    var isWatchAppAvailable: Bool {
        guard let session = wcSession else { return false }
        return session.isPaired && session.isWatchAppInstalled
    }

    /// Check if we can send messages to Watch right now
    var canSendToWatch: Bool {
        guard let session = wcSession else { return false }
        return session.isReachable
    }

    /// Send start workout command to Apple Watch
    /// The Watch will receive this and start tracking heart rate, calories, etc.
    func startMirroredWorkout() async throws {
        guard let session = wcSession else {
            throw WatchWorkoutError.watchConnectivityNotAvailable
        }

        guard session.isPaired else {
            throw WatchWorkoutError.watchNotPaired
        }

        guard session.isWatchAppInstalled else {
            throw WatchWorkoutError.watchAppNotInstalled
        }

        // Clear any previous state
        workoutSummary = nil
        error = nil

        let command = WorkoutCommand.start
        let data = try JSONEncoder().encode(command)
        let message: [String: Any] = [
            "command": command.rawValue,
            "data": data
        ]

        // If Watch is reachable, send interactive message
        if session.isReachable {
            do {
                let reply = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
                    session.sendMessage(message, replyHandler: { reply in
                        continuation.resume(returning: reply)
                    }, errorHandler: { error in
                        continuation.resume(throwing: error)
                    })
                }

                // Check reply for success
                if let success = reply["success"] as? Bool, success {
                    isWorkoutActive = true
                    #if DEBUG
                    print("[WatchWorkoutController] Watch confirmed workout started")
                    #endif
                } else {
                    let errorMessage = reply["error"] as? String ?? "Unknown error"
                    throw WatchWorkoutError.watchRejectedCommand(errorMessage)
                }

            } catch {
                self.error = error
                throw WatchWorkoutError.messageFailed(error)
            }
        } else {
            // Watch not reachable - try to use transferUserInfo for background delivery
            session.transferUserInfo(message)
            isWorkoutActive = true // Optimistic - Watch will start when it wakes

            #if DEBUG
            print("[WatchWorkoutController] Watch not reachable, queued command for background delivery")
            #endif
        }
    }

    /// Send end workout command to Apple Watch
    /// Watch will finish tracking and send back summary
    func endWorkout() async throws {
        guard let session = wcSession else {
            throw WatchWorkoutError.watchConnectivityNotAvailable
        }

        let command = WorkoutCommand.end
        let data = try JSONEncoder().encode(command)
        let message: [String: Any] = [
            "command": command.rawValue,
            "data": data
        ]

        if session.isReachable {
            do {
                let reply = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
                    session.sendMessage(message, replyHandler: { reply in
                        continuation.resume(returning: reply)
                    }, errorHandler: { error in
                        continuation.resume(throwing: error)
                    })
                }

                // Parse summary from reply
                if let summaryData = reply["summary"] as? Data,
                   let summary = try? JSONDecoder().decode(WatchWorkoutSummary.self, from: summaryData) {
                    workoutSummary = summary
                    isWorkoutActive = false

                    #if DEBUG
                    print("[WatchWorkoutController] Received workout summary:")
                    print("  - Avg HR: \(summary.avgHeartRate) BPM")
                    print("  - Max HR: \(summary.maxHeartRate) BPM")
                    print("  - Calories: \(summary.activeCalories) kcal")
                    print("  - Duration: \(summary.totalDuration) sec")
                    #endif
                } else {
                    isWorkoutActive = false
                    #if DEBUG
                    print("[WatchWorkoutController] Workout ended, no summary received")
                    #endif
                }

            } catch {
                self.error = error
                throw WatchWorkoutError.messageFailed(error)
            }
        } else {
            // Queue for background delivery
            session.transferUserInfo(message)
            isWorkoutActive = false

            #if DEBUG
            print("[WatchWorkoutController] Watch not reachable, queued end command for background delivery")
            #endif
        }
    }

    /// Cancel the workout without waiting for summary
    func cancelWorkout() {
        isWorkoutActive = false

        // Try to notify watch, but don't wait for response
        if let session = wcSession, session.isReachable {
            let message: [String: Any] = ["command": WorkoutCommand.end.rawValue]
            session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        }

        #if DEBUG
        print("[WatchWorkoutController] Workout cancelled")
        #endif
    }

    // MARK: - Workout Context Methods

    /// Send full workout context to Watch for exercise display
    func sendWorkoutContext(from workout: Workout) {
        guard let session = wcSession, session.isReachable,
              let exercises = workout.exercises else { return }

        let watchExercises = exercises.map { exercise in
            WatchExerciseInfo(
                exerciseId: exercise.exerciseId,
                name: exercise.exerciseName,
                totalSets: exercise.totalSets,
                completedSets: exercise.completedSets,
                restSeconds: exercise.restSeconds,
                sets: exercise.sets.map { set in
                    WatchSetInfo(
                        setId: set.id,
                        setNumber: set.setNumber,
                        targetReps: set.targetReps,
                        targetWeight: set.targetWeight,
                        status: set.status.rawValue
                    )
                }
            )
        }

        let context = WatchWorkoutContext(
            workoutId: workout.id,
            dayName: workout.planDayName ?? "Workout",
            weekNumber: workout.weekNumber,
            exercises: watchExercises
        )

        do {
            let data = try JSONEncoder().encode(context)
            let message: [String: Any] = [WCMessageKey.workoutContext: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                #if DEBUG
                print("[WatchWorkoutController] Failed to send workout context: \(error)")
                #endif
            })
        } catch {
            #if DEBUG
            print("[WatchWorkoutController] Failed to encode workout context: \(error)")
            #endif
        }
    }

    /// Send exercise update when a set is logged/skipped
    func sendExerciseUpdate(exerciseId: String, setId: String, newStatus: String, actualReps: Int?, actualWeight: Double?, completedSets: Int) {
        guard let session = wcSession, session.isReachable else { return }

        let update = WatchExerciseUpdate(
            exerciseId: exerciseId,
            setId: setId,
            newStatus: newStatus,
            actualReps: actualReps,
            actualWeight: actualWeight,
            completedSets: completedSets
        )

        do {
            let data = try JSONEncoder().encode(update)
            let message: [String: Any] = [WCMessageKey.exerciseUpdate: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                #if DEBUG
                print("[WatchWorkoutController] Failed to send exercise update: \(error)")
                #endif
            })
        } catch {
            #if DEBUG
            print("[WatchWorkoutController] Failed to encode exercise update: \(error)")
            #endif
        }
    }

    /// Send rest timer event to Watch
    func sendRestTimerEvent(action: String, targetSeconds: Int? = nil, exerciseName: String? = nil) {
        guard let session = wcSession, session.isReachable else { return }

        let event = WatchRestTimerEvent(
            action: action,
            targetSeconds: targetSeconds,
            exerciseName: exerciseName
        )

        do {
            let data = try JSONEncoder().encode(event)
            let message: [String: Any] = [WCMessageKey.restTimerEvent: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                #if DEBUG
                print("[WatchWorkoutController] Failed to send rest timer event: \(error)")
                #endif
            })
        } catch {
            #if DEBUG
            print("[WatchWorkoutController] Failed to encode rest timer event: \(error)")
            #endif
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchWorkoutController: WCSessionDelegate {

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            if let error = error {
                self.error = error
                #if DEBUG
                print("[WatchWorkoutController] WCSession activation failed: \(error)")
                #endif
                return
            }

            self.isWatchReachable = session.isReachable

            #if DEBUG
            print("[WatchWorkoutController] WCSession activated:")
            print("  - Paired: \(session.isPaired)")
            print("  - Watch app installed: \(session.isWatchAppInstalled)")
            print("  - Reachable: \(session.isReachable)")
            #endif
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {
        #if DEBUG
        print("[WatchWorkoutController] WCSession became inactive")
        #endif
    }

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        #if DEBUG
        print("[WatchWorkoutController] WCSession deactivated")
        #endif
        // Reactivate for future use
        session.activate()
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isWatchReachable = session.isReachable
            #if DEBUG
            print("[WatchWorkoutController] Watch reachability changed: \(session.isReachable)")
            #endif
        }
    }

    /// Receive messages from Watch (e.g., workout summary, heart rate updates)
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            handleIncomingMessage(message)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in
            handleIncomingMessage(message)
            replyHandler(["received": true])
        }
    }

    @MainActor
    private func handleIncomingMessage(_ message: [String: Any]) {
        // Handle heart rate updates
        if let heartRate = message["heartRate"] as? Double {
            currentHeartRate = heartRate
        }

        // Handle workout summary
        if let summaryData = message["summary"] as? Data,
           let summary = try? JSONDecoder().decode(WatchWorkoutSummary.self, from: summaryData) {
            workoutSummary = summary
            isWorkoutActive = false

            #if DEBUG
            print("[WatchWorkoutController] Received workout summary from Watch")
            #endif
        }

        // Handle workout state changes
        if let isActive = message["isWorkoutActive"] as? Bool {
            isWorkoutActive = isActive
        }

        // Handle set log request from Watch
        if let requestData = message[WCMessageKey.setLogRequest] as? Data,
           let request = try? JSONDecoder().decode(WatchSetLogRequest.self, from: requestData) {
            NotificationCenter.default.post(
                name: .watchSetLogRequested,
                object: nil,
                userInfo: ["setId": request.setId, "exerciseId": request.exerciseId]
            )

            #if DEBUG
            print("[WatchWorkoutController] Watch requested set log: \(request.setId)")
            #endif
        }
    }
}

// MARK: - Errors

enum WatchWorkoutError: Error, LocalizedError {
    case watchConnectivityNotAvailable
    case watchNotPaired
    case watchAppNotInstalled
    case watchNotReachable
    case messageFailed(Error)
    case watchRejectedCommand(String)

    var errorDescription: String? {
        switch self {
        case .watchConnectivityNotAvailable:
            return "Watch Connectivity is not available on this device"
        case .watchNotPaired:
            return "No Apple Watch is paired with this iPhone"
        case .watchAppNotInstalled:
            return "The Brad OS Watch app is not installed on your Apple Watch"
        case .watchNotReachable:
            return "Apple Watch is not reachable. Make sure it's nearby and unlocked."
        case .messageFailed(let error):
            return "Failed to communicate with Watch: \(error.localizedDescription)"
        case .watchRejectedCommand(let reason):
            return "Watch rejected command: \(reason)"
        }
    }
}
