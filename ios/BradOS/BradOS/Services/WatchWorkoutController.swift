import HealthKit
import WatchConnectivity
import Foundation
import BradOSCore

// MARK: - Shared Types (iOS <-> WatchOS)

enum WorkoutCommand: String, Codable {
    case start
    case end
}

struct WatchWorkoutSummary: Codable {}

// MARK: - WatchWorkoutController

/// Controls workout session mirroring between iPhone and Apple Watch
/// Uses WatchConnectivity to send commands from iOS to Watch
/// The Watch receives commands and manages the actual workout session
@MainActor
class WatchWorkoutController: NSObject, ObservableObject {

    // MARK: - Published Properties

    @Published var isWorkoutActive = false
    @Published var currentHeartRate: Double = 0
    @Published var isWatchReachable = false
    @Published var isWatchPairedButUnreachable = false

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
            DebugLogger.info("WatchConnectivity not supported", attributes: ["source": "WatchWorkoutController"])
            return
        }

        wcSession = WCSession.default
        wcSession?.delegate = self
        wcSession?.activate()

        DebugLogger.info("WatchConnectivity session activating...", attributes: ["source": "WatchWorkoutController"])
    }

    // MARK: - Public Methods

    /// Check if we can send messages to Watch right now
    var canSendToWatch: Bool {
        guard let session = wcSession else { return false }
        return session.isReachable
    }

    /// Send start workout command to Apple Watch
    /// The Watch will receive this and start tracking heart rate, calories, etc.
    func startMirroredWorkout() async throws {
        let session = try validatedSession()

        let message = try buildCommandMessage(.start)

        // If Watch is reachable, send interactive message
        if session.isReachable {
            do {
                let reply = try await sendMessageAsync(
                    session: session, message: message
                )
                if let success = reply["success"] as? Bool, success {
                    isWorkoutActive = true
                } else {
                    let msg = reply["error"] as? String ?? "Unknown error"
                    throw WatchWorkoutError.watchRejectedCommand(msg)
                }
            } catch {
                throw WatchWorkoutError.messageFailed(error)
            }
        } else {
            session.transferUserInfo(message)
            isWorkoutActive = true
        }
    }

    /// Send end workout command to Apple Watch
    /// Watch will finish tracking and send back summary
    func endWorkout() async throws {
        guard let session = wcSession else {
            throw WatchWorkoutError.watchConnectivityNotAvailable
        }

        let message = try buildCommandMessage(.end)

        if session.isReachable {
            do {
                _ = try await sendMessageAsync(
                    session: session, message: message
                )
                isWorkoutActive = false
            } catch {
                throw WatchWorkoutError.messageFailed(error)
            }
        } else {
            session.transferUserInfo(message)
            isWorkoutActive = false
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

        DebugLogger.info("Workout cancelled", attributes: ["source": "WatchWorkoutController"])
    }

    // MARK: - Workout Context Methods

    /// Send full workout context to Watch for exercise display
    func sendWorkoutContext(from workout: Workout) {
        guard let session = wcSession, session.isReachable else { return }

        let context = WatchWorkoutContext()

        do {
            let data = try JSONEncoder().encode(context)
            let message: [String: Any] = [WCMessageKey.workoutContext: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                DebugLogger.error("Failed to send workout context: \(error)", attributes: ["source": "WatchWorkoutController"])
            })
        } catch {
            DebugLogger.error("Failed to encode workout context: \(error)", attributes: ["source": "WatchWorkoutController"])
        }
    }

    /// Send exercise update when a set is logged/skipped
    func sendExerciseUpdate(_ update: WatchExerciseUpdate) {
        guard let session = wcSession, session.isReachable else { return }

        do {
            let data = try JSONEncoder().encode(update)
            let message: [String: Any] = [WCMessageKey.exerciseUpdate: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                DebugLogger.error("Failed to send exercise update: \(error)", attributes: ["source": "WatchWorkoutController"])
            })
        } catch {
            DebugLogger.error("Failed to encode exercise update: \(error)", attributes: ["source": "WatchWorkoutController"])
        }
    }

    // MARK: - Private Helpers

    private func validatedSession() throws -> WCSession {
        guard let session = wcSession else {
            throw WatchWorkoutError.watchConnectivityNotAvailable
        }
        guard session.isPaired else {
            throw WatchWorkoutError.watchNotPaired
        }
        guard session.isWatchAppInstalled else {
            throw WatchWorkoutError.watchAppNotInstalled
        }
        return session
    }

    private func sendMessageAsync(
        session: WCSession,
        message: [String: Any]
    ) async throws -> [String: Any] {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
            session.sendMessage(
                message,
                replyHandler: { continuation.resume(returning: $0) },
                errorHandler: { continuation.resume(throwing: $0) }
            )
        }
    }

    private func buildCommandMessage(
        _ command: WorkoutCommand
    ) throws -> [String: Any] {
        let data = try JSONEncoder().encode(command)
        return [
            "command": command.rawValue,
            "data": data
        ]
    }

    /// Send rest timer event to Watch
    func sendRestTimerEvent(
        action: String,
        targetSeconds: Int? = nil,
        exerciseName: String? = nil
    ) {
        guard let session = wcSession, session.isReachable else { return }

        let event = WatchRestTimerEvent()

        do {
            let data = try JSONEncoder().encode(event)
            let message: [String: Any] = [WCMessageKey.restTimerEvent: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                DebugLogger.error("Failed to send rest timer event: \(error)", attributes: ["source": "WatchWorkoutController"])
            })
        } catch {
            DebugLogger.error("Failed to encode rest timer: \(error)", attributes: ["source": "WatchWorkoutController"])
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchWorkoutController: WCSessionDelegate {

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            if let error = error {
                DebugLogger.error("WCSession activation failed: \(error)", attributes: ["source": "WatchWorkoutController"])
                return
            }

            self.isWatchReachable = session.isReachable
            self.isWatchPairedButUnreachable = session.isPaired && !session.isReachable

            DebugLogger.info("WCSession activated:", attributes: ["source": "WatchWorkoutController"])
            DebugLogger.info("  - Paired: \(session.isPaired)")
            DebugLogger.info("  - Watch app installed: \(session.isWatchAppInstalled)")
            DebugLogger.info("  - Reachable: \(session.isReachable)")
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {
        DebugLogger.info("WCSession became inactive", attributes: ["source": "WatchWorkoutController"])
    }

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        DebugLogger.info("WCSession deactivated", attributes: ["source": "WatchWorkoutController"])
        // Reactivate for future use
        session.activate()
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isWatchReachable = session.isReachable
            self.isWatchPairedButUnreachable = session.isPaired && !session.isReachable
            #if DEBUG
            let reachable = session.isReachable
            DebugLogger.info("Watch reachability changed: \(reachable)", attributes: ["source": "WatchWorkoutController"])
            #endif
        }
    }

    /// Receive messages from Watch (e.g., workout summary, heart rate updates)
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            handleIncomingMessage(message)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
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
        if (message["summary"] as? Data) != nil {
            isWorkoutActive = false

            DebugLogger.info("Received workout summary from Watch", attributes: ["source": "WatchWorkoutController"])
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

            DebugLogger.info("Watch requested set log: \(request.setId)", attributes: ["source": "WatchWorkoutController"])
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
