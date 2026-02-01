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
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.lifting)

            Text("Loading workout...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - No Workout State

    private var noWorkoutState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("No workout scheduled for today.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Workout Content

    @ViewBuilder
    private func workoutContent(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header with badge
            HStack {
                cardHeaderIcon(color: Theme.lifting)
                Text("Lifting")
                    .font(.title3)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                statusBadge(for: workout.status)
            }

            // Plan day name and details
            VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                Text(workout.planDayName ?? "Workout")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text("Week \(workout.weekNumber) \u{2022} \(exerciseCount(workout)) exercises")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .monospacedDigit()
            }

            // Progress indicator for in-progress workouts
            if workout.status == .inProgress {
                let progress = workoutProgress(workout)
                Text("Progress: \(progress.completed)/\(progress.total) sets")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .monospacedDigit()
            }

            // Action link
            HStack {
                Spacer()
                actionLink(for: workout.status)
            }
        }
        .glassCard()
        .auroraGlow(Theme.lifting)
    }

    // MARK: - Card Header

    private func cardHeader(iconColor: Color) -> some View {
        HStack {
            cardHeaderIcon(color: iconColor)
            Text("Lifting")
                .font(.title3)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private func cardHeaderIcon(color: Color) -> some View {
        Image(systemName: "dumbbell.fill")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(color)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    @ViewBuilder
    private func statusBadge(for status: WorkoutStatus) -> some View {
        let config = badgeConfig(for: status)
        Text(config.label)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, Theme.Spacing.space1)
            .background(config.color.opacity(0.2))
            .foregroundColor(config.color)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    private func badgeConfig(for status: WorkoutStatus) -> (label: String, color: Color) {
        switch status {
        case .pending:
            return ("Ready", Theme.neutral)
        case .inProgress:
            return ("In Progress", Theme.warning)
        case .completed:
            return ("Completed", Theme.success)
        case .skipped:
            return ("Skipped", Theme.neutral)
        }
    }

    @ViewBuilder
    private func actionLink(for status: WorkoutStatus) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Text(actionText(for: status))
                .font(.callout.weight(.semibold))
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
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("No Workout") {
    WorkoutDashboardCard(
        workout: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Pending") {
    WorkoutDashboardCard(
        workout: Workout.mockTodayWorkout,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
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
    .background(AuroraBackground())
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
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
