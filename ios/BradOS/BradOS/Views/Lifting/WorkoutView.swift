import SwiftUI

/// Full workout tracking view with API integration
struct WorkoutView: View {
    let workoutId: Int
    @Environment(\.apiClient) private var apiClient
    @Environment(\.dismiss) private var dismiss

    // Workout state
    @State private var workout: Workout?
    @State private var isLoading = true
    @State private var error: Error?

    // Action states
    @State private var isStarting = false
    @State private var isCompleting = false
    @State private var isSkipping = false

    // Alerts
    @State private var showingCompleteAlert = false
    @State private var showingSkipAlert = false

    // Local edit state (set ID -> edited values)
    @State private var localSetEdits: [Int: SetEditState] = [:]

    // Rest timer state
    @State private var activeRestTimer: RestTimerState?

    // State manager for persistence
    @StateObject private var stateManager = WorkoutStateManager()

    var body: some View {
        ZStack {
            ScrollView {
                if isLoading {
                    loadingContent
                } else if let error = error {
                    errorContent(error)
                } else if let workout = workout {
                    workoutContent(workout)
                } else {
                    emptyContent
                }
            }
            .background(Theme.background)

            // Rest Timer Overlay
            if let timer = activeRestTimer {
                VStack {
                    Spacer()
                    RestTimerView(state: timer) {
                        dismissRestTimer()
                    }
                }
            }
        }
        .navigationTitle(workout?.planDayName ?? "Workout")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadWorkout()
        }
        .refreshable {
            await loadWorkout()
        }
        .alert("Complete Workout?", isPresented: $showingCompleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Complete") {
                Task { await completeWorkout() }
            }
        } message: {
            let pendingSets = workout?.exercises?.reduce(0) { total, exercise in
                total + exercise.sets.filter { $0.status == .pending }.count
            } ?? 0
            if pendingSets > 0 {
                Text("You have \(pendingSets) sets remaining. Complete anyway?")
            } else {
                Text("Great work! Mark this workout as complete?")
            }
        }
        .alert("Skip Workout?", isPresented: $showingSkipAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Skip", role: .destructive) {
                Task { await skipWorkout() }
            }
        } message: {
            Text("This workout will be marked as skipped.")
        }
    }

    // MARK: - Content Views

    private var loadingContent: some View {
        VStack(spacing: Theme.Spacing.md) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading workout...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private func errorContent(_ error: Error) -> some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(Theme.error)

            Text("Failed to load workout")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Retry") {
                Task { await loadWorkout() }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(Theme.Spacing.lg)
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private var emptyContent: some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 48))
                .foregroundColor(Theme.textSecondary)

            Text("Workout not found")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private func workoutContent(_ workout: Workout) -> some View {
        VStack(spacing: Theme.Spacing.lg) {
            // Header
            workoutHeader(workout)

            // Action Buttons
            actionButtons(workout)

            // Exercises
            if let exercises = workout.exercises {
                exercisesSection(exercises, workoutStatus: workout.status)
            }
        }
        .padding(Theme.Spacing.md)
        .padding(.bottom, activeRestTimer != nil ? 100 : 0)
    }

    // MARK: - Header

    @ViewBuilder
    private func workoutHeader(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(workout.planDayName ?? "Workout")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text(formattedDate(workout.scheduledDate))
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer()

                StatusBadge(status: workout.status)
            }

            if workout.weekNumber == 7 {
                GenericBadge(text: "Deload Week", color: Theme.warning)
            } else {
                GenericBadge(text: "Week \(workout.weekNumber)", color: Theme.accent)
            }
        }
        .padding(Theme.Spacing.md)
        .cardStyle()
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter.string(from: date)
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private func actionButtons(_ workout: Workout) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            switch workout.status {
            case .pending:
                Button(action: { Task { await startWorkout() } }) {
                    HStack {
                        if isStarting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "play.fill")
                        }
                        Text("Start Workout")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isStarting)

                Button(action: { showingSkipAlert = true }) {
                    Text("Skip")
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isSkipping)

            case .inProgress:
                Button(action: { showingCompleteAlert = true }) {
                    HStack {
                        if isCompleting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "checkmark")
                        }
                        Text("Complete")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isCompleting)

                Button(action: { showingSkipAlert = true }) {
                    Text("Skip")
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isSkipping)

            case .completed, .skipped:
                EmptyView()
            }
        }
    }

    // MARK: - Exercises Section

    @ViewBuilder
    private func exercisesSection(_ exercises: [WorkoutExercise], workoutStatus: WorkoutStatus) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Exercises")

            ForEach(exercises) { exercise in
                ExerciseCard(
                    exercise: exercise,
                    workoutId: workoutId,
                    isEditable: workoutStatus == .inProgress,
                    localEdits: localSetEditsForExercise(exercise.exerciseId),
                    onSetEdited: { setId, weight, reps in
                        updateLocalEdit(setId: setId, weight: weight, reps: reps)
                        cascadeWeight(setId: setId, weight: weight, in: exercise)
                    },
                    onLogSet: { set in
                        Task { await logSet(set, exercise: exercise) }
                    },
                    onUnlogSet: { set in
                        Task { await unlogSet(set) }
                    },
                    onSkipSet: { set in
                        Task { await skipSet(set) }
                    },
                    onAddSet: {
                        Task { await addSet(exerciseId: exercise.exerciseId) }
                    },
                    onRemoveSet: {
                        Task { await removeSet(exerciseId: exercise.exerciseId) }
                    }
                )
            }
        }
    }

    // MARK: - Data Loading

    private func loadWorkout() async {
        isLoading = true
        error = nil

        do {
            workout = try await apiClient.getWorkout(id: workoutId)

            // Restore local state if available
            if let state = stateManager.loadState(), state.workoutId == workoutId {
                restoreLocalState(from: state)
            }
        } catch {
            self.error = error
            #if DEBUG
            print("[WorkoutView] Failed to load workout: \(error)")
            #endif
        }

        isLoading = false
    }

    private func restoreLocalState(from state: StoredWorkoutState) {
        // Restore pending edits
        for (setId, edit) in state.pendingEdits {
            localSetEdits[setId] = SetEditState(
                weight: edit.weight ?? 0,
                reps: edit.reps ?? 0
            )
        }

        // Restore timer if still valid
        if let timerState = state.activeTimer {
            let elapsed = Int(Date().timeIntervalSince(timerState.startedAt))
            // Only restore if within 5 minutes of target
            if elapsed < timerState.targetSeconds + 300 {
                activeRestTimer = RestTimerState(
                    targetSeconds: timerState.targetSeconds,
                    startedAt: timerState.startedAt
                )
            }
        }
    }

    // MARK: - Workout Actions

    private func startWorkout() async {
        isStarting = true

        do {
            workout = try await apiClient.startWorkout(id: workoutId)
            stateManager.initializeForWorkout(workoutId: workoutId)
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to start workout: \(error)")
            #endif
        }

        isStarting = false
    }

    private func completeWorkout() async {
        isCompleting = true

        do {
            workout = try await apiClient.completeWorkout(id: workoutId)
            stateManager.clearState()
            dismissRestTimer()
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to complete workout: \(error)")
            #endif
        }

        isCompleting = false
    }

    private func skipWorkout() async {
        isSkipping = true

        do {
            workout = try await apiClient.skipWorkout(id: workoutId)
            stateManager.clearState()
            dismissRestTimer()
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to skip workout: \(error)")
            #endif
        }

        isSkipping = false
    }

    // MARK: - Set Actions

    private func logSet(_ set: WorkoutSet, exercise: WorkoutExercise) async {
        let editState = localSetEdits[set.id]
        let weight = editState?.weight ?? set.targetWeight
        let reps = Int(editState?.reps ?? Double(set.targetReps))

        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .completed, actualWeight: weight, actualReps: reps)

        // Persist to state manager
        stateManager.updateSet(setId: set.id, reps: reps, weight: weight, status: .completed)

        // Start rest timer
        startRestTimer(targetSeconds: exercise.restSeconds, exerciseId: set.exerciseId, setNumber: set.setNumber)

        do {
            _ = try await apiClient.logSet(id: set.id, actualReps: reps, actualWeight: weight)
            // Remove from local edits after successful log
            localSetEdits.removeValue(forKey: set.id)
            stateManager.removePendingEdit(setId: set.id)
        } catch {
            // Rollback on failure
            updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)
            #if DEBUG
            print("[WorkoutView] Failed to log set: \(error)")
            #endif
        }
    }

    private func unlogSet(_ set: WorkoutSet) async {
        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)

        do {
            _ = try await apiClient.unlogSet(id: set.id)
        } catch {
            // Rollback
            updateSetInWorkout(
                setId: set.id,
                status: .completed,
                actualWeight: set.actualWeight,
                actualReps: set.actualReps
            )
            #if DEBUG
            print("[WorkoutView] Failed to unlog set: \(error)")
            #endif
        }
    }

    private func skipSet(_ set: WorkoutSet) async {
        // Optimistic update
        updateSetInWorkout(setId: set.id, status: .skipped, actualWeight: nil, actualReps: nil)

        do {
            _ = try await apiClient.skipSet(id: set.id)
        } catch {
            // Rollback
            updateSetInWorkout(setId: set.id, status: .pending, actualWeight: nil, actualReps: nil)
            #if DEBUG
            print("[WorkoutView] Failed to skip set: \(error)")
            #endif
        }
    }

    private func addSet(exerciseId: Int) async {
        do {
            let result = try await apiClient.addSet(workoutId: workoutId, exerciseId: exerciseId)
            if let newSet = result.currentWorkoutSet {
                appendSetToExercise(exerciseId: exerciseId, set: newSet)
            }
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to add set: \(error)")
            #endif
        }
    }

    private func removeSet(exerciseId: Int) async {
        do {
            _ = try await apiClient.removeSet(workoutId: workoutId, exerciseId: exerciseId)
            removeLastPendingSetFromExercise(exerciseId: exerciseId)
        } catch {
            #if DEBUG
            print("[WorkoutView] Failed to remove set: \(error)")
            #endif
        }
    }

    // MARK: - Local State Helpers

    private func localSetEditsForExercise(_ exerciseId: Int) -> [Int: SetEditState] {
        guard let exercises = workout?.exercises,
              let exercise = exercises.first(where: { $0.exerciseId == exerciseId }) else {
            return [:]
        }
        let setIds = Set(exercise.sets.map { $0.id })
        return localSetEdits.filter { setIds.contains($0.key) }
    }

    private func updateLocalEdit(setId: Int, weight: Double, reps: Int) {
        localSetEdits[setId] = SetEditState(weight: weight, reps: Double(reps))
        stateManager.updatePendingEdit(setId: setId, weight: weight, reps: reps)
    }

    private func cascadeWeight(setId: Int, weight: Double, in exercise: WorkoutExercise) {
        guard let setIndex = exercise.sets.firstIndex(where: { $0.id == setId }) else { return }
        let currentSet = exercise.sets[setIndex]

        // Update subsequent pending sets with the same weight
        for subsequentSet in exercise.sets where subsequentSet.setNumber > currentSet.setNumber {
            if subsequentSet.status == .pending {
                let existingEdit = localSetEdits[subsequentSet.id]
                localSetEdits[subsequentSet.id] = SetEditState(
                    weight: weight,
                    reps: existingEdit?.reps ?? Double(subsequentSet.targetReps)
                )
                stateManager.updatePendingEdit(
                    setId: subsequentSet.id,
                    weight: weight,
                    reps: existingEdit?.reps != nil ? Int(existingEdit!.reps) : nil
                )
            }
        }
    }

    private func updateSetInWorkout(setId: Int, status: SetStatus, actualWeight: Double?, actualReps: Int?) {
        guard var workout = workout,
              var exercises = workout.exercises else { return }

        for exerciseIndex in exercises.indices {
            if let setIndex = exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setId }) {
                exercises[exerciseIndex].sets[setIndex].status = status
                exercises[exerciseIndex].sets[setIndex].actualWeight = actualWeight
                exercises[exerciseIndex].sets[setIndex].actualReps = actualReps

                // Update completed count
                exercises[exerciseIndex].completedSets = exercises[exerciseIndex].sets.filter { $0.status == .completed }.count
                break
            }
        }

        workout.exercises = exercises
        self.workout = workout
    }

    private func appendSetToExercise(exerciseId: Int, set: WorkoutSet) {
        guard var workout = workout,
              var exercises = workout.exercises,
              let exerciseIndex = exercises.firstIndex(where: { $0.exerciseId == exerciseId }) else { return }

        exercises[exerciseIndex].sets.append(set)
        exercises[exerciseIndex].totalSets += 1
        workout.exercises = exercises
        self.workout = workout
    }

    private func removeLastPendingSetFromExercise(exerciseId: Int) {
        guard var workout = workout,
              var exercises = workout.exercises,
              let exerciseIndex = exercises.firstIndex(where: { $0.exerciseId == exerciseId }) else { return }

        // Find last pending set
        if let lastPendingIndex = exercises[exerciseIndex].sets.lastIndex(where: { $0.status == .pending }) {
            let removedSetId = exercises[exerciseIndex].sets[lastPendingIndex].id
            exercises[exerciseIndex].sets.remove(at: lastPendingIndex)
            exercises[exerciseIndex].totalSets -= 1
            localSetEdits.removeValue(forKey: removedSetId)
        }

        workout.exercises = exercises
        self.workout = workout
    }

    // MARK: - Rest Timer

    private func startRestTimer(targetSeconds: Int, exerciseId: Int, setNumber: Int) {
        let startedAt = Date()
        activeRestTimer = RestTimerState(targetSeconds: targetSeconds, startedAt: startedAt)

        // Persist timer state
        let timerState = StoredTimerState(
            startedAt: startedAt,
            targetSeconds: targetSeconds,
            exerciseId: exerciseId,
            setNumber: setNumber
        )
        stateManager.saveTimerState(timerState)
    }

    private func dismissRestTimer() {
        activeRestTimer = nil
        stateManager.clearTimerState()
    }
}

/// Local state for editing a set before logging
struct SetEditState: Equatable {
    var weight: Double
    var reps: Double
}

/// Card displaying an exercise with its sets
struct ExerciseCard: View {
    let exercise: WorkoutExercise
    let workoutId: Int
    let isEditable: Bool
    let localEdits: [Int: SetEditState]
    let onSetEdited: (Int, Double, Int) -> Void
    let onLogSet: (WorkoutSet) -> Void
    let onUnlogSet: (WorkoutSet) -> Void
    let onSkipSet: (WorkoutSet) -> Void
    let onAddSet: () -> Void
    let onRemoveSet: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
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
                    color: completedSets == exercise.totalSets ? Theme.success : Theme.accent
                )
            }

            Divider()
                .background(Theme.border)

            // Sets
            VStack(spacing: Theme.Spacing.sm) {
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

                ForEach(exercise.sets, id: \.id) { set in
                    SetRow(
                        set: set,
                        isEditable: isEditable,
                        localEdit: localEdits[set.id],
                        onEdited: { weight, reps in
                            onSetEdited(set.id, weight, reps)
                        },
                        onLog: { onLogSet(set) },
                        onUnlog: { onUnlogSet(set) },
                        onSkip: { onSkipSet(set) }
                    )
                }
            }

            // Add/Remove Set Buttons
            if isEditable {
                HStack(spacing: Theme.Spacing.md) {
                    Button(action: onAddSet) {
                        HStack {
                            Image(systemName: "plus")
                            Text("Add Set")
                        }
                        .font(.subheadline)
                        .foregroundColor(Theme.accent)
                    }

                    Spacer()

                    if canRemoveSet {
                        Button(action: onRemoveSet) {
                            HStack {
                                Image(systemName: "minus")
                                Text("Remove Set")
                            }
                            .font(.subheadline)
                            .foregroundColor(Theme.error)
                        }
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    private var completedSets: Int {
        exercise.sets.filter { $0.status == .completed }.count
    }

    private var canRemoveSet: Bool {
        // Can only remove if there's more than one set and at least one is pending
        exercise.sets.count > 1 && exercise.sets.contains { $0.status == .pending }
    }
}

/// Row displaying a single set with edit and action capabilities
struct SetRow: View {
    let set: WorkoutSet
    let isEditable: Bool
    let localEdit: SetEditState?
    let onEdited: (Double, Int) -> Void
    let onLog: () -> Void
    let onUnlog: () -> Void
    let onSkip: () -> Void

    @State private var weightText: String = ""
    @State private var repsText: String = ""
    @State private var showingActions = false

    var body: some View {
        HStack {
            // Set number with status indicator
            ZStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 28, height: 28)

                Text("\(set.setNumber)")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(set.status == .pending ? Theme.textPrimary : .white)
            }
            .frame(width: 40)

            // Weight input
            TextField("Weight", text: $weightText)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .padding(Theme.Spacing.sm)
                .background(inputBackground)
                .cornerRadius(Theme.CornerRadius.sm)
                .disabled(!canEdit)
                .frame(maxWidth: .infinity)
                .onChange(of: weightText) { _, newValue in
                    if let weight = Double(newValue) {
                        onEdited(weight, Int(repsText) ?? set.targetReps)
                    }
                }

            // Reps input
            TextField("Reps", text: $repsText)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .padding(Theme.Spacing.sm)
                .background(inputBackground)
                .cornerRadius(Theme.CornerRadius.sm)
                .disabled(!canEdit)
                .frame(maxWidth: .infinity)
                .onChange(of: repsText) { _, newValue in
                    if let reps = Int(newValue) {
                        onEdited(Double(weightText) ?? set.targetWeight, reps)
                    }
                }

            // Action button
            actionButton
        }
        .opacity(set.status == .skipped ? 0.5 : (set.status == .completed ? 0.8 : 1))
        .onAppear {
            initializeTextFields()
        }
        .confirmationDialog("Set Actions", isPresented: $showingActions) {
            if set.status == .completed {
                Button("Unlog Set") { onUnlog() }
            } else if set.status == .pending {
                Button("Skip Set", role: .destructive) { onSkip() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var statusColor: Color {
        switch set.status {
        case .completed: return Theme.success
        case .skipped: return Theme.statusSkipped
        case .pending: return Theme.backgroundTertiary
        }
    }

    private var inputBackground: Color {
        set.status == .pending ? Theme.backgroundTertiary : Theme.backgroundSecondary
    }

    private var canEdit: Bool {
        isEditable && set.status == .pending
    }

    @ViewBuilder
    private var actionButton: some View {
        if set.status == .pending && isEditable {
            Button(action: onLog) {
                Image(systemName: "circle")
                    .font(.title2)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(width: 44)
        } else if set.status == .completed {
            Button(action: { showingActions = true }) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(Theme.success)
            }
            .frame(width: 44)
        } else if set.status == .skipped {
            Image(systemName: "forward.fill")
                .font(.caption)
                .foregroundColor(Theme.statusSkipped)
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
        } else if set.status == .completed {
            weightText = formatWeight(set.actualWeight ?? set.targetWeight)
            repsText = "\(set.actualReps ?? set.targetReps)"
        } else {
            weightText = formatWeight(set.targetWeight)
            repsText = "\(set.targetReps)"
        }
    }

    private func formatWeight(_ weight: Double) -> String {
        if weight.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(weight))"
        }
        return String(format: "%.1f", weight)
    }
}

/// Rest timer state
struct RestTimerState {
    let targetSeconds: Int
    let startedAt: Date

    var elapsedSeconds: Int {
        Int(Date().timeIntervalSince(startedAt))
    }

    var remainingSeconds: Int {
        max(0, targetSeconds - elapsedSeconds)
    }

    var isComplete: Bool {
        elapsedSeconds >= targetSeconds
    }
}

/// Rest timer overlay view
struct RestTimerView: View {
    let state: RestTimerState
    let onDismiss: () -> Void

    @State private var elapsedSeconds: Int = 0
    @State private var timer: Timer?

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Rest Timer")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)

                Text(formattedTime)
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(isComplete ? Theme.success : Theme.textPrimary)
                    .monospacedDigit()
            }

            Spacer()

            if isComplete {
                Text("Ready!")
                    .font(.headline)
                    .foregroundColor(Theme.success)
            }

            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                .stroke(isComplete ? Theme.success : Theme.accent, lineWidth: 2)
        )
        .padding(Theme.Spacing.md)
        .shadow(color: .black.opacity(0.3), radius: 10)
        .onAppear {
            startTimer()
        }
        .onDisappear {
            timer?.invalidate()
        }
    }

    private var isComplete: Bool {
        elapsedSeconds >= state.targetSeconds
    }

    private var formattedTime: String {
        let displaySeconds: Int
        if isComplete {
            // Show overtime
            displaySeconds = elapsedSeconds - state.targetSeconds
        } else {
            displaySeconds = state.targetSeconds - elapsedSeconds
        }
        let minutes = displaySeconds / 60
        let seconds = displaySeconds % 60
        let prefix = isComplete ? "+" : ""
        return "\(prefix)\(minutes):\(String(format: "%02d", seconds))"
    }

    private func startTimer() {
        elapsedSeconds = state.elapsedSeconds
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            elapsedSeconds = state.elapsedSeconds
        }
    }
}

#Preview {
    NavigationStack {
        WorkoutView(workoutId: 1)
    }
    .environment(\.apiClient, MockAPIClient())
    .preferredColorScheme(.dark)
}
