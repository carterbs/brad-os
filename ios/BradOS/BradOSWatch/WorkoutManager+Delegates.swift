import HealthKit
import WatchConnectivity
import Foundation

// MARK: - WCSessionDelegate

extension WorkoutManager: WCSessionDelegate {

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
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
    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in
            await self.handleMessageWithReply(message, replyHandler: replyHandler)
        }
    }

    /// Handle messages without reply handler
    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        Task { @MainActor in
            if self.handleDataMessage(message) { return }

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
    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any]
    ) {
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

// MARK: - Message Handling Helpers

extension WorkoutManager {

    /// Process a received message and send a reply
    func handleMessageWithReply(
        _ message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) async {
        if handleDataMessage(message, replyHandler: replyHandler) { return }

        guard let commandString = message["command"] as? String,
              let command = WorkoutCommand(rawValue: commandString) else {
            replyHandler(["success": false, "error": "Invalid command"])
            return
        }

        switch command {
        case .start:
            do {
                try await startWorkout()
                replyHandler(["success": true])
            } catch {
                replyHandler(["success": false, "error": error.localizedDescription])
            }

        case .end:
            do {
                let summary = try await endWorkout()
                let summaryData = try JSONEncoder().encode(summary)
                replyHandler(["success": true, "summary": summaryData])
            } catch {
                replyHandler(["success": false, "error": error.localizedDescription])
            }
        }
    }

    /// Handle data-based messages (context, exercise update, rest timer). Returns true if handled.
    @discardableResult
    func handleDataMessage(
        _ message: [String: Any],
        replyHandler: (([String: Any]) -> Void)? = nil
    ) -> Bool {
        if let contextData = message[WCMessageKey.workoutContext] as? Data,
           let context = try? JSONDecoder().decode(WatchWorkoutContext.self, from: contextData) {
            workoutContext = context
            currentExerciseIndex = findCurrentExerciseIndex(in: context)
            replyHandler?(["received": true])
            return true
        }

        if let updateData = message[WCMessageKey.exerciseUpdate] as? Data,
           let update = try? JSONDecoder().decode(WatchExerciseUpdate.self, from: updateData) {
            applyExerciseUpdate(update)
            replyHandler?(["received": true])
            return true
        }

        if let timerData = message[WCMessageKey.restTimerEvent] as? Data,
           let event = try? JSONDecoder().decode(WatchRestTimerEvent.self, from: timerData) {
            handleRestTimerEvent(event)
            replyHandler?(["received": true])
            return true
        }

        return false
    }
}

#if !targetEnvironment(simulator)
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
#endif
