import SwiftUI
import BradOSCore

/// Card displaying a single week's workouts
struct WeekCard: View {
    let week: WeekSummary
    let isActiveWeek: Bool
    let hasInProgressWorkout: Bool
    @Binding var navigationPath: NavigationPath

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            weekHeader
            ForEach(week.workouts) { workout in
                workoutRow(workout)
            }
        }
        .glassCard()
        .overlay(
            RoundedRectangle(
                cornerRadius: Theme.CornerRadius.lg, style: .continuous
            )
            .stroke(
                isActiveWeek ? Theme.interactivePrimary : Theme.strokeSubtle,
                lineWidth: isActiveWeek ? 2 : 1
            )
        )
    }

    @ViewBuilder
    private var weekHeader: some View {
        HStack {
            Text(week.isDeload ? "Deload Week" : "Week \(week.weekNumber)")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(
                    isActiveWeek ? Theme.interactivePrimary : Theme.textPrimary
                )
                .monospacedDigit()

            if week.isComplete {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(Theme.success)
            }

            Spacer()

            if isActiveWeek {
                Text("Active")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textOnAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.interactivePrimary)
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: Theme.CornerRadius.sm,
                            style: .continuous
                        )
                    )
            }
        }
    }

    private func workoutStatusBadge(for status: WorkoutStatus) -> some View {
        Text(statusText(for: status))
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor(for: status).opacity(0.2))
            .foregroundColor(statusColor(for: status))
            .clipShape(
                RoundedRectangle(
                    cornerRadius: Theme.CornerRadius.sm,
                    style: .continuous
                )
            )
    }

    @ViewBuilder
    private func workoutRow(_ workout: WorkoutSummary) -> some View {
        let canStart = canStartWorkout(workout)
        let isTappable = workout.status == .inProgress
            || workout.status == .completed
            || (workout.status == .pending && canStart)

        HStack {
            Circle()
                .fill(statusColor(for: workout.status))
                .frame(width: 8, height: 8)

            Text(workout.dayName)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            workoutStatusBadge(for: workout.status)

            if isTappable {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .opacity(workout.status == .pending && !canStart ? 0.5 : 1.0)
        .onTapGesture {
            if isTappable {
                navigationPath.append(
                    WorkoutDestination(workoutId: workout.id)
                )
            }
        }
    }

    private func canStartWorkout(_ workout: WorkoutSummary) -> Bool {
        guard workout.status == .pending else { return true }
        return !hasInProgressWorkout
    }

    private func statusColor(for status: WorkoutStatus) -> Color {
        switch status {
        case .completed: return Theme.success
        case .skipped: return Theme.neutral
        case .inProgress: return Theme.warning
        case .pending: return Color.white.opacity(0.06)
        }
    }

    private func statusText(for status: WorkoutStatus) -> String {
        switch status {
        case .completed: return "Completed"
        case .skipped: return "Skipped"
        case .inProgress: return "In Progress"
        case .pending: return "Scheduled"
        }
    }
}

/// Card displaying a completed mesocycle
struct CompletedMesocycleCard: View {
    let mesocycle: Mesocycle

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(mesocycle.planName ?? "Mesocycle")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(dateRange)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                GenericBadge(
                    text: mesocycle.status == .completed
                        ? "Completed" : "Cancelled",
                    color: mesocycle.status == .completed
                        ? Theme.success : Theme.neutral
                )

                Text(
                    "\(mesocycle.completedWorkouts ?? 0)"
                    + "/\(mesocycle.totalWorkouts ?? 0) workouts"
                )
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .monospacedDigit()
            }
        }
        .glassCard()
    }

    private var dateRange: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let start = formatter.string(from: mesocycle.startDate)

        if let endDate = Calendar.current.date(
            byAdding: .weekOfYear, value: 7, to: mesocycle.startDate
        ) {
            let end = formatter.string(from: endDate)
            return "\(start) - \(end)"
        }
        return start
    }
}

/// Sheet for creating a new mesocycle
struct NewMesocycleSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPlan = Plan.mockPlans.first
    @State private var startDate = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan") {
                    Picker("Select Plan", selection: $selectedPlan) {
                        ForEach(Plan.mockPlans) { plan in
                            Text(plan.name).tag(plan as Plan?)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Start Date") {
                    DatePicker(
                        "Start Date",
                        selection: $startDate,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("New Mesocycle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Start") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(selectedPlan == nil)
                }
            }
        }
    }
}
