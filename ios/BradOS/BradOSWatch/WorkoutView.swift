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
        VStack(spacing: 8) {
            // Header
            Text("Lifting")
                .font(.headline)
                .foregroundStyle(.secondary)

            // Heart Rate (main focus)
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

            // Stats row
            HStack(spacing: 16) {
                // Calories
                VStack(spacing: 2) {
                    Text("\(Int(workoutManager.activeCalories))")
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .contentTransition(.numericText())

                    Text("CAL")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                // Duration
                VStack(spacing: 2) {
                    Text(workoutManager.formattedElapsedTime)
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.semibold)
                        .monospacedDigit()

                    Text("TIME")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                // Max HR
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

#Preview("Active Workout") {
    ActiveWorkoutView()
        .environmentObject(previewWorkoutManager(active: true))
}

#Preview("Waiting") {
    WaitingView()
}

// Preview helper
private func previewWorkoutManager(active: Bool) -> WorkoutManager {
    let manager = WorkoutManager()
    if active {
        Task { @MainActor in
            manager.isWorkoutActive = true
            manager.heartRate = 128
            manager.maxHeartRate = 142
            manager.activeCalories = 156
            manager.elapsedTime = 1847 // ~30 min
        }
    }
    return manager
}
