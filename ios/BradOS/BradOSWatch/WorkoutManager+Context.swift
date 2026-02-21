import WatchKit
import WatchConnectivity
import Foundation

// MARK: - Workout Context

extension WorkoutManager {

    /// Apply an exercise update from iPhone (set logged/skipped)
    func applyExerciseUpdate(_ update: WatchExerciseUpdate) {
        guard var context = workoutContext else { return }

        if let exerciseIndex = context.exercises.firstIndex(where: { $0.exerciseId == update.exerciseId }) {
            context.exercises[exerciseIndex].completedSets = update.completedSets

            if let setIndex = context.exercises[exerciseIndex].sets.firstIndex(where: { $0.setId == update.setId }) {
                context.exercises[exerciseIndex].sets[setIndex].status = update.newStatus
            }

            workoutContext = context
            currentExerciseIndex = findCurrentExerciseIndex(in: context)
        }
    }

    /// Handle rest timer event from iPhone
    func handleRestTimerEvent(_ event: WatchRestTimerEvent) {
        if event.action == "start", let target = event.targetSeconds {
            restTimerActive = true
            restTimerTarget = target
            restTimerElapsed = 0
            restExerciseName = event.exerciseName

            restTimer?.invalidate()

            restTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self = self else { return }
                    self.restTimerElapsed += 1

                    if self.restTimerElapsed >= self.restTimerTarget {
                        self.restTimerComplete()
                    }
                }
            }
        } else if event.action == "dismiss" {
            dismissRestTimer()
        }
    }

    /// Send a set log request to iPhone
    func requestSetLog(setId: String, exerciseId: String) {
        guard let session = wcSession, session.isReachable else { return }

        let request = WatchSetLogRequest(setId: setId)

        do {
            let data = try JSONEncoder().encode(request)
            let message: [String: Any] = [WCMessageKey.setLogRequest: data]
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                #if DEBUG
                print("[WorkoutManager] Failed to send set log request: \(error)")
                #endif
            })
        } catch {
            #if DEBUG
            print("[WorkoutManager] Failed to encode set log request: \(error)")
            #endif
        }
    }

    /// Find the index of the first exercise with pending sets
    func findCurrentExerciseIndex(in context: WatchWorkoutContext) -> Int {
        for (index, exercise) in context.exercises.enumerated()
        where exercise.sets.contains(where: { $0.status == "pending" }) {
            return index
        }
        return max(0, context.exercises.count - 1)
    }

    func restTimerComplete() {
        restTimer?.invalidate()
        restTimer = nil
        restTimerActive = false

        WKInterfaceDevice.current().play(.notification)
    }

    func dismissRestTimer() {
        restTimer?.invalidate()
        restTimer = nil
        restTimerActive = false
        restTimerElapsed = 0
        restTimerTarget = 0
        restExerciseName = nil
    }
}

// MARK: - Timer

extension WorkoutManager {

    func startElapsedTimer() {
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, let startDate = self.startDate else { return }
                self.elapsedTime = Date().timeIntervalSince(startDate)
            }
        }
    }

    func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }

    /// Format elapsed time as MM:SS
    var formattedElapsedTime: String {
        let minutes = Int(elapsedTime) / 60
        let seconds = Int(elapsedTime) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - iPhone Communication

extension WorkoutManager {

    func sendStateToiPhone() {
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

    func sendSummaryToiPhone(_ summary: WatchWorkoutSummary) {
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
                session.transferUserInfo(message)
            }
        } catch {
            #if DEBUG
            print("[WorkoutManager] Failed to encode summary: \(error)")
            #endif
        }
    }
}
