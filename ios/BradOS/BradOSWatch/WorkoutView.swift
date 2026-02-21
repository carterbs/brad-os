import SwiftUI

/// Main view for the Watch app showing workout status
struct WorkoutView: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    var body: some View {
        if workoutManager.isWorkoutActive {
            ActiveWorkoutView()
                .environmentObject(workoutManager)
        } else {
            WaitingView()
        }
    }
}

// MARK: - Active Workout View

struct ActiveWorkoutView: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    var body: some View {
        if workoutManager.workoutContext != nil {
            ContextualWorkoutView()
                .environmentObject(workoutManager)
        } else {
            BasicWorkoutView()
                .environmentObject(workoutManager)
        }
    }
}

// MARK: - Contextual Workout View (with exercise data from iPhone)

struct ContextualWorkoutView: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    var body: some View {
        TabView {
            // Tab 1: Exercise + HR
            ExerciseTab()
                .environmentObject(workoutManager)

            // Tab 2: Stats
            StatsTab()
                .environmentObject(workoutManager)
        }
        .tabViewStyle(.verticalPage)
    }
}

// MARK: - Exercise Tab

struct ExerciseTab: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    private var context: WatchWorkoutContext? {
        workoutManager.workoutContext
    }

    private var currentExercise: WatchExerciseInfo? {
        guard let context = context,
              workoutManager.currentExerciseIndex < context.exercises.count else { return nil }
        return context.exercises[workoutManager.currentExerciseIndex]
    }

    private var nextPendingSet: WatchSetInfo? {
        currentExercise?.sets.first(where: { $0.status == "pending" })
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Day name header
                Text(context?.dayName ?? "Workout")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Current exercise
                if let exercise = currentExercise {
                    VStack(spacing: 4) {
                        Text(exercise.name)
                            .font(.headline)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)

                        Text("\(exercise.completedSets)/\(exercise.totalSets) sets")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    // Next set target
                    if let nextSet = nextPendingSet {
                        HStack(spacing: 4) {
                            Text(formatWeight(nextSet.targetWeight))
                                .font(.system(.title3, design: .rounded))
                                .fontWeight(.bold)
                            Text("lbs")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("×")
                                .foregroundStyle(.secondary)
                            Text("\(nextSet.targetReps)")
                                .font(.system(.title3, design: .rounded))
                                .fontWeight(.bold)
                            Text("reps")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)

                        // Log Set button
                        Button {
                            workoutManager.requestSetLog(
                                setId: nextSet.setId,
                                exerciseId: exercise.exerciseId
                            )
                        } label: {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Log Set")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    } else {
                        // All sets done for this exercise
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Complete")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Heart rate (compact)
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.caption2)
                        .foregroundColor(.red)
                    Text("\(Int(workoutManager.heartRate))")
                        .font(.system(.body, design: .rounded))
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    Text("BPM")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 4)
            }
            .padding(.horizontal)
        }
        .overlay {
            // Rest timer overlay
            if workoutManager.restTimerActive {
                RestTimerOverlayWatch()
                    .environmentObject(workoutManager)
            }
        }
    }

    private func formatWeight(_ weight: Double) -> String {
        if weight.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(weight))"
        }
        return String(format: "%.1f", weight)
    }
}

// MARK: - Rest Timer Overlay (Watch)

struct RestTimerOverlayWatch: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    private var remainingSeconds: Int {
        max(0, workoutManager.restTimerTarget - workoutManager.restTimerElapsed)
    }

    private var isComplete: Bool {
        workoutManager.restTimerElapsed >= workoutManager.restTimerTarget
    }

    private var progress: Double {
        guard workoutManager.restTimerTarget > 0 else { return 0 }
        return Double(workoutManager.restTimerElapsed) / Double(workoutManager.restTimerTarget)
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.85)
                .ignoresSafeArea()

            VStack(spacing: 8) {
                if let name = workoutManager.restExerciseName {
                    Text(name)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if isComplete {
                    Text("Go!")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.green)
                } else {
                    Text(formatTime(remainingSeconds))
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                }

                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.2), lineWidth: 4)
                    Circle()
                        .trim(from: 0, to: min(progress, 1.0))
                        .stroke(
                            isComplete ? Color.green : Color.blue,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 1), value: progress)
                }
                .frame(width: 60, height: 60)

                Text("Rest")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func formatTime(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        if mins > 0 {
            return String(format: "%d:%02d", mins, secs)
        }
        return "\(secs)"
    }
}

// MARK: - Stats Tab

struct StatsTab: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    var body: some View {
        VStack(spacing: 12) {
            // Calories (large)
            VStack(spacing: 2) {
                Text("\(Int(workoutManager.activeCalories))")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .contentTransition(.numericText())

                Text("CALORIES")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            // Duration + Max HR (side by side)
            HStack(spacing: 20) {
                VStack(spacing: 2) {
                    Text(workoutManager.formattedElapsedTime)
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .monospacedDigit()

                    Text("TIME")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 2) {
                    Text("\(Int(workoutManager.maxHeartRate))")
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .contentTransition(.numericText())

                    Text("MAX HR")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }
}

// MARK: - Basic Workout View (no context from iPhone)

struct BasicWorkoutView: View {
    @EnvironmentObject var workoutManager: WorkoutManager

    var body: some View {
        VStack(spacing: 8) {
            Text("Lifting")
                .font(.headline)
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.title3)
                    .foregroundColor(.red)

                Text("\(Int(workoutManager.heartRate))")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                    .contentTransition(.numericText())

                Text("BPM")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 16) {
                VStack(spacing: 2) {
                    Text("\(Int(workoutManager.activeCalories))")
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .contentTransition(.numericText())

                    Text("CAL")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 2) {
                    Text(workoutManager.formattedElapsedTime)
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .monospacedDigit()

                    Text("TIME")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 2) {
                    Text("\(Int(workoutManager.maxHeartRate))")
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .contentTransition(.numericText())

                    Text("MAX")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }
}

// MARK: - Waiting View

struct WaitingView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)

            Text("Waiting for workout...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text("Start a workout from your iPhone")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

// MARK: - Previews

#Preview("Active Workout with Context") {
    ContextualWorkoutView()
        .environmentObject(previewWorkoutManagerWithContext())
}

#Preview("Active Workout Basic") {
    BasicWorkoutView()
        .environmentObject(previewWorkoutManager(active: true))
}

#Preview("Waiting") {
    WaitingView()
}

// Preview helpers
@MainActor
private func previewWorkoutManager(active: Bool) -> WorkoutManager {
    let manager = WorkoutManager()
    if active {
        Task { @MainActor in
            manager.isWorkoutActive = true
            manager.heartRate = 128
            manager.maxHeartRate = 142
            manager.activeCalories = 156
            manager.elapsedTime = 1847
        }
    }
    return manager
}

@MainActor
private func previewWorkoutManagerWithContext() -> WorkoutManager {
    let manager = WorkoutManager()
    Task { @MainActor in
        manager.isWorkoutActive = true
        manager.heartRate = 132
        manager.maxHeartRate = 148
        manager.activeCalories = 203
        manager.elapsedTime = 2100
        manager.workoutContext = makePreviewContext()
        manager.currentExerciseIndex = 0
    }
    return manager
}

private func makePreviewContext() -> WatchWorkoutContext {
    WatchWorkoutContext(
        dayName: "Push Day",
        exercises: [
            WatchExerciseInfo(
                exerciseId: "ex-1",
                name: "Bench Press",
                totalSets: 3,
                completedSets: 1,
                sets: [
                    WatchSetInfo(setId: "s1", targetReps: 10, targetWeight: 135, status: "completed"),
                    WatchSetInfo(setId: "s2", targetReps: 10, targetWeight: 135, status: "pending"),
                    WatchSetInfo(setId: "s3", targetReps: 10, targetWeight: 135, status: "pending")
                ]
            ),
            WatchExerciseInfo(
                exerciseId: "ex-2",
                name: "Overhead Press",
                totalSets: 3,
                completedSets: 0,
                sets: [
                    WatchSetInfo(setId: "s4", targetReps: 8, targetWeight: 95, status: "pending"),
                    WatchSetInfo(setId: "s5", targetReps: 8, targetWeight: 95, status: "pending"),
                    WatchSetInfo(setId: "s6", targetReps: 8, targetWeight: 95, status: "pending")
                ]
            )
        ]
    )
}
