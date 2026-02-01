import SwiftUI
import BradOSCore

/// Dashboard card displaying today's workout with proper states
struct WorkoutDashboardCard: View {
    let workout: Workout?
    let isLoading: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoading && workout == nil)
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoading && workout == nil {
            loadingState
        } else if let workout = workout {
            workoutContent(workout)
        } else {
            noWorkoutState
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.lifting)
                Text("Lifting")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            Text("Loading workout...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.lifting.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.lifting.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - No Workout State

    private var noWorkoutState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.textSecondary)
                Text("Lifting")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            Text("No workout scheduled for today.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Workout Content

    @ViewBuilder
    private func workoutContent(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Header with badge
            HStack {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.lifting)
                Text("Lifting")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                statusBadge(for: workout.status)
            }

            // Plan day name and details
            VStack(alignment: .leading, spacing: 4) {
                Text(workout.planDayName ?? "Workout")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text("Week \(workout.weekNumber) \u{2022} \(exerciseCount(workout)) exercises")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }

            // Progress indicator for in-progress workouts
            if workout.status == .inProgress {
                let progress = workoutProgress(workout)
                Text("Progress: \(progress.completed)/\(progress.total) sets")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }

            // Action button
            HStack {
                Spacer()
                actionButton(for: workout.status)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.lifting.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.lifting.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    @ViewBuilder
    private func statusBadge(for status: WorkoutStatus) -> some View {
        let config = badgeConfig(for: status)
        Text(config.label)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(config.color.opacity(0.2))
            .foregroundColor(config.color)
            .cornerRadius(Theme.CornerRadius.sm)
    }

    private func badgeConfig(for status: WorkoutStatus) -> (label: String, color: Color) {
        switch status {
        case .pending:
            return ("Ready", Theme.statusSkipped) // Gray
        case .inProgress:
            return ("In Progress", Theme.statusInProgress) // Yellow/Orange
        case .completed:
            return ("Completed", Theme.statusCompleted) // Green
        case .skipped:
            return ("Skipped", Theme.statusSkipped) // Gray
        }
    }

    @ViewBuilder
    private func actionButton(for status: WorkoutStatus) -> some View {
        HStack(spacing: 4) {
            Text(actionText(for: status))
                .font(.subheadline)
                .fontWeight(.medium)
            Image(systemName: "chevron.right")
                .font(.caption)
        }
        .foregroundColor(Theme.lifting)
    }

    private func actionText(for status: WorkoutStatus) -> String {
        switch status {
        case .pending:
            return "Start Workout"
        case .inProgress:
            return "Continue"
        case .completed, .skipped:
            return "View"
        }
    }

    private func exerciseCount(_ workout: Workout) -> Int {
        workout.exercises?.count ?? 0
    }

    private func workoutProgress(_ workout: Workout) -> (completed: Int, total: Int) {
        guard let exercises = workout.exercises else { return (0, 0) }
        let completed = exercises.reduce(0) { $0 + $1.completedSets }
        let total = exercises.reduce(0) { $0 + $1.totalSets }
        return (completed, total)
    }
}

// MARK: - Previews

#Preview("Loading") {
    WorkoutDashboardCard(
        workout: nil,
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("No Workout") {
    WorkoutDashboardCard(
        workout: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("Pending") {
    WorkoutDashboardCard(
        workout: Workout.mockTodayWorkout,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("In Progress") {
    var workout = Workout.mockTodayWorkout
    workout.status = .inProgress
    return WorkoutDashboardCard(
        workout: workout,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("Completed") {
    var workout = Workout.mockTodayWorkout
    workout.status = .completed
    return WorkoutDashboardCard(
        workout: workout,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
