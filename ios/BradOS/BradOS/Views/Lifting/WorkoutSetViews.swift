import SwiftUI
import BradOSCore

/// Local state for editing a set before logging
struct SetEditState: Equatable {
    var weight: Double
    var reps: Double
}

/// Indicates which field was edited (for cascading)
enum EditedField {
    case weight
    case reps
}

/// Card displaying an exercise with its sets
struct ExerciseCard: View {
    let exercise: WorkoutExercise
    let workoutId: String
    let isEditable: Bool
    let localEdits: [String: SetEditState]
    let onSetEdited: (String, Double, Int, EditedField) -> Void
    let onLogSet: (WorkoutSet) -> Void
    let onUnlogSet: (WorkoutSet) -> Void
    let onSkipSet: (WorkoutSet) -> Void
    let onAddSet: () -> Void
    let onRemoveSet: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.exerciseName)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Text("Rest: \(exercise.formattedRestTime)")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer()

                GenericBadge(
                    text: "\(completedSets)/\(exercise.totalSets) sets",
                    color: completedSets == exercise.totalSets ? Theme.success : Theme.interactivePrimary
                )
            }

            Divider()
                .background(Theme.divider)

            // Sets
            VStack(spacing: Theme.Spacing.space2) {
                // Header row
                HStack {
                    Text("Set")
                        .frame(width: 40)
                    Text("Weight")
                        .frame(maxWidth: .infinity)
                    Text("Reps")
                        .frame(maxWidth: .infinity)
                    Text("")
                        .frame(width: 44)
                }
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

                // Warm-up sets (visual reminder, non-interactive)
                if !exercise.warmupSets.isEmpty {
                    ForEach(exercise.warmupSets) { warmup in
                        WarmupSetRow(warmupSet: warmup)
                    }

                    Divider()
                        .background(Theme.divider)
                        .padding(.vertical, 2)
                }

                ForEach(exercise.sets, id: \.id) { workoutSet in
                    SetRow(
                        workoutSet: workoutSet,
                        isEditable: isEditable,
                        canLog: canLogSet(workoutSet),
                        localEdit: localEdits[workoutSet.id],
                        onEdited: { weight, reps, editedField in
                            onSetEdited(workoutSet.id, weight, reps, editedField)
                        },
                        onLog: { onLogSet(workoutSet) },
                        onUnlog: { onUnlogSet(workoutSet) },
                        onSkip: { onSkipSet(workoutSet) }
                    )
                }
            }

            // Add/Remove Set Buttons
            if isEditable {
                HStack(spacing: Theme.Spacing.space4) {
                    Button(action: onAddSet) {
                        HStack {
                            Image(systemName: "plus")
                            Text("Add Set")
                        }
                        .font(.subheadline)
                        .foregroundColor(Theme.interactivePrimary)
                    }

                    Spacer()

                    if canRemoveSet {
                        Button(action: onRemoveSet) {
                            HStack {
                                Image(systemName: "minus")
                                Text("Remove Set")
                            }
                            .font(.subheadline)
                            .foregroundColor(Theme.destructive)
                        }
                    }
                }
            }
        }
        .glassCard()
    }

    private var completedSets: Int {
        exercise.sets.filter { $0.status == .completed }.count
    }

    private var canRemoveSet: Bool {
        // Can only remove if there's more than one set and at least one is pending
        exercise.sets.count > 1 && exercise.sets.contains { $0.status == .pending }
    }

    /// Determines if a set can be logged - only the first pending set can be logged
    private func canLogSet(_ workoutSet: WorkoutSet) -> Bool {
        guard workoutSet.status == .pending else { return false }
        // Find the first pending set number
        let firstPendingSetNumber = exercise.sets
            .filter { $0.status == .pending }
            .map { $0.setNumber }
            .min()
        return workoutSet.setNumber == firstPendingSetNumber
    }
}

/// Row displaying a single set with edit and action capabilities
struct SetRow: View {
    let workoutSet: WorkoutSet
    let isEditable: Bool
    let canLog: Bool
    let localEdit: SetEditState?
    let onEdited: (Double, Int, EditedField) -> Void
    let onLog: () -> Void
    let onUnlog: () -> Void
    let onSkip: () -> Void

    @State private var weightText: String = ""
    @State private var repsText: String = ""
    @State private var showingActions = false
    // Track if user is actively editing to avoid overwriting their input with cascaded values
    @State private var isUserEditingWeight = false
    @State private var isUserEditingReps = false

    var body: some View {
        HStack {
            // Set number with status indicator
            ZStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 28, height: 28)

                Text("\(workoutSet.setNumber)")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(workoutSet.status == .pending ? Theme.textPrimary : Theme.textOnAccent)
                    .monospacedDigit()
            }
            .frame(width: 40)

            // Weight input
            TextField("Weight", text: $weightText, onEditingChanged: { editing in
                isUserEditingWeight = editing
            })
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .monospacedDigit()
                .padding(Theme.Spacing.space2)
                .frame(height: Theme.Dimensions.inputHeight)
                .background(inputBackground)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                .disabled(!canEdit)
                .frame(maxWidth: .infinity)
                .onChange(of: weightText) { _, newValue in
                    if isUserEditingWeight, let weight = Double(newValue) {
                        onEdited(weight, Int(repsText) ?? workoutSet.targetReps, .weight)
                    }
                }

            // Reps input
            TextField("Reps", text: $repsText, onEditingChanged: { editing in
                isUserEditingReps = editing
            })
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .monospacedDigit()
                .padding(Theme.Spacing.space2)
                .frame(height: Theme.Dimensions.inputHeight)
                .background(inputBackground)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                .disabled(!canEdit)
                .frame(maxWidth: .infinity)
                .onChange(of: repsText) { _, newValue in
                    if isUserEditingReps, let reps = Int(newValue) {
                        onEdited(Double(weightText) ?? workoutSet.targetWeight, reps, .reps)
                    }
                }

            // Action button
            actionButton
        }
        .opacity(workoutSet.status == .skipped ? 0.5 : (workoutSet.status == .completed ? 0.8 : 1))
        .onAppear {
            initializeTextFields()
        }
        .onChange(of: localEdit) { _, newEdit in
            // Update text fields when localEdit changes externally (from cascading)
            // Only update if user is not actively editing this field
            if let edit = newEdit {
                if !isUserEditingWeight {
                    weightText = formatWeight(edit.weight)
                }
                if !isUserEditingReps {
                    repsText = "\(Int(edit.reps))"
                }
            }
        }
        .confirmationDialog("Set Actions", isPresented: $showingActions) {
            if workoutSet.status == .completed {
                Button("Unlog Set") { onUnlog() }
            } else if workoutSet.status == .pending {
                Button("Skip Set", role: .destructive) { onSkip() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var statusColor: Color {
        switch workoutSet.status {
        case .completed: return Theme.success
        case .skipped: return Theme.neutral
        case .pending: return Color.white.opacity(0.06)
        }
    }

    private var inputBackground: Color {
        workoutSet.status == .pending ? Color.white.opacity(0.06) : Color.clear
    }

    private var canEdit: Bool {
        isEditable && workoutSet.status == .pending
    }

    @ViewBuilder
    private var actionButton: some View {
        if workoutSet.status == .pending && isEditable && canLog {
            Button(action: onLog) {
                Image(systemName: "circle")
                    .font(.title2)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(width: 44)
        } else if workoutSet.status == .pending && isEditable && !canLog {
            // Show disabled circle for pending sets that can't be logged yet
            Image(systemName: "circle")
                .font(.title2)
                .foregroundColor(Theme.textSecondary.opacity(0.3))
                .frame(width: 44)
        } else if workoutSet.status == .completed {
            Button(action: { showingActions = true }) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(Theme.success)
            }
            .frame(width: 44)
        } else if workoutSet.status == .skipped {
            Image(systemName: "forward.fill")
                .font(.caption)
                .foregroundColor(Theme.neutral)
                .frame(width: 44)
        } else {
            Spacer()
                .frame(width: 44)
        }
    }

    private func initializeTextFields() {
        // Use local edit if available, otherwise use actual (for completed) or target values
        if let edit = localEdit {
            weightText = formatWeight(edit.weight)
            repsText = "\(Int(edit.reps))"
        } else if workoutSet.status == .completed {
            weightText = formatWeight(workoutSet.actualWeight ?? workoutSet.targetWeight)
            repsText = "\(workoutSet.actualReps ?? workoutSet.targetReps)"
        } else {
            weightText = formatWeight(workoutSet.targetWeight)
            repsText = "\(workoutSet.targetReps)"
        }
    }

    private func formatWeight(_ weight: Double) -> String {
        if weight.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(weight))"
        }
        return String(format: "%.1f", weight)
    }
}

/// Row displaying a warm-up set (non-interactive visual reminder)
struct WarmupSetRow: View {
    let warmupSet: WarmupSet

    var body: some View {
        HStack {
            // "W" badge instead of set number
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.06))
                    .frame(width: 28, height: 28)

                Text("W")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(width: 40)

            // Weight (read-only)
            Text(formatWeight(warmupSet.targetWeight))
                .frame(maxWidth: .infinity)
                .padding(Theme.Spacing.space2)
                .monospacedDigit()

            // Reps (read-only)
            Text("\(warmupSet.targetReps)")
                .frame(maxWidth: .infinity)
                .padding(Theme.Spacing.space2)
                .monospacedDigit()

            // Empty action column
            Spacer()
                .frame(width: 44)
        }
        .font(.subheadline)
        .foregroundColor(Theme.textSecondary)
        .opacity(0.6)
    }

    private func formatWeight(_ weight: Double) -> String {
        if weight.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(weight))"
        }
        return String(format: "%.1f", weight)
    }
}

#Preview {
    NavigationStack {
        WorkoutView(workoutId: "1")
    }
    .environment(\.apiClient, MockAPIClient())
    .preferredColorScheme(.dark)
    .background(AuroraBackground().ignoresSafeArea())
}
