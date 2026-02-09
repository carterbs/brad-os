import SwiftUI
import UIKit
import BradOSCore

/// Full workout tracking view with API integration
struct WorkoutView: View {
    let workoutId: String
    @EnvironmentObject var appState: AppState
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
    @State private var showingStretchPrompt = false

    // Local edit state (set ID -> edited values)
    @State private var localSetEdits: [String: SetEditState] = [:]

    // Full-screen timer overlay
    @State private var showingTimerOverlay = false

    // Barcode wallet
    @State private var showingBarcodeSheet = false
    @State private var walletBarcodes: [Barcode] = []

    // Managers for persistence and timer
    @StateObject private var stateManager = WorkoutStateManager()
    @StateObject private var restTimer = RestTimerManager()

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

            // Floating action buttons at bottom
            if let workout = workout {
                VStack {
                    Spacer()
                    floatingActionButtons(workout)
                }
            }

            // Rest Timer Bar (compact, above floating buttons)
            if restTimer.isActive && !showingTimerOverlay {
                VStack {
                    Spacer()
                    RestTimerBar(
                        elapsedSeconds: restTimer.elapsedSeconds,
                        targetSeconds: restTimer.targetSeconds,
                        isComplete: restTimer.isComplete,
                        onTap: { showingTimerOverlay = true },
                        onDismiss: { dismissRestTimer() }
                    )
                    .padding(.bottom, workout?.status == .inProgress || workout?.status == .pending ? 80 : 0)
                }
            }

            // Rest Timer Overlay (full screen)
            if showingTimerOverlay && restTimer.isActive {
                RestTimerOverlay(
                    elapsedSeconds: restTimer.elapsedSeconds,
                    targetSeconds: restTimer.targetSeconds,
                    isComplete: restTimer.isComplete,
                    onDismiss: { showingTimerOverlay = false }
                )
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            restTimer.handleForeground()
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle(workout?.planDayName ?? "Workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            if !walletBarcodes.isEmpty {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingBarcodeSheet = true }) {
                        Image(systemName: "barcode")
                            .foregroundColor(Theme.textPrimary)
                    }
                }
            }
        }
        .sheet(isPresented: $showingBarcodeSheet) {
            BarcodeDisplaySheet(barcodes: walletBarcodes)
        }
        .task {
            // Load barcodes silently for quick access
            do {
                walletBarcodes = try await apiClient.getBarcodes()
            } catch {
                // Non-critical — barcode access is secondary to the workout
            }
        }
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
        .alert("Time to Stretch?", isPresented: $showingStretchPrompt) {
            Button("Not Now", role: .cancel) {}
            Button("Start Stretch") {
                appState.isShowingLiftingContext = false
                appState.isShowingStretch = true
            }
        } message: {
            Text("Stretching after a workout helps with recovery. Start a stretch session?")
        }
    }

    // MARK: - Content Views

    private var loadingContent: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading workout...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private func errorContent(_ error: Error) -> some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: Theme.Typography.iconLG))
                .foregroundColor(Theme.destructive)

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
        .padding(Theme.Spacing.space6)
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private var emptyContent: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "questionmark.circle")
                .font(.system(size: Theme.Typography.iconLG))
                .foregroundColor(Theme.textSecondary)

            Text("Workout not found")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    private func workoutContent(_ workout: Workout) -> some View {
        VStack(spacing: Theme.Spacing.space6) {
            // Header
            workoutHeader(workout)

            // Exercises
            if let exercises = workout.exercises {
                exercisesSection(exercises, workoutStatus: workout.status)
            }
        }
        .padding(Theme.Spacing.space4)
        .padding(.bottom, bottomPadding(for: workout))
    }

    /// Calculate bottom padding based on floating UI elements
    private func bottomPadding(for workout: Workout) -> CGFloat {
        var padding: CGFloat = 0

        // Add space for floating action buttons (button height + padding + safe area)
        if workout.status == .pending || workout.status == .inProgress {
            padding += 120
        }

        // Add space for rest timer bar
        if restTimer.isActive {
            padding += 80
        }

        return padding
    }

    // MARK: - Header

    @ViewBuilder
    private func workoutHeader(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(workout.planDayName ?? "Workout")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    // Show today's date if workout is in progress, otherwise scheduled date
                    Text(formattedDate(workout.status == .inProgress ? Date() : workout.scheduledDate))
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer()

                StatusBadge(status: workout.status)
            }

            if workout.weekNumber == 7 {
                GenericBadge(text: "Deload Week", color: Theme.warning)
            } else {
                GenericBadge(text: "Week \(workout.weekNumber)", color: Theme.interactivePrimary)
            }
        }
        .glassCard()
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter.string(from: date)
    }

    // MARK: - Floating Action Buttons

    @ViewBuilder
    private func floatingActionButtons(_ workout: Workout) -> some View {
        switch workout.status {
        case .pending:
            HStack(spacing: Theme.Spacing.space4) {
                Button(action: { Task { await startWorkout() } }) {
                    HStack {
                        if isStarting {
                            ProgressView()
                                .tint(Theme.textOnAccent)
                        } else {
                            Image(systemName: "play.fill")
                        }
                        Text("Start Workout")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.space2)
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(isStarting)

                Button(action: { showingSkipAlert = true }) {
                    Text("Skip")
                        .padding(.horizontal, Theme.Spacing.space4)
                        .padding(.vertical, Theme.Spacing.space2)
                }
                .buttonStyle(GlassSecondaryButtonStyle())
                .disabled(isSkipping)
            }
            .padding(.horizontal, Theme.Spacing.space4)
            .padding(.bottom, Theme.Spacing.space4)

        case .inProgress:
            HStack(spacing: Theme.Spacing.space4) {
                Button(action: { showingCompleteAlert = true }) {
                    HStack {
                        if isCompleting {
                            ProgressView()
                                .tint(Theme.textOnAccent)
                        } else {
                            Image(systemName: "checkmark")
                        }
                        Text("Complete")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.space2)
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(isCompleting)

                Button(action: { showingSkipAlert = true }) {
                    Text("Skip")
                        .padding(.horizontal, Theme.Spacing.space4)
                        .padding(.vertical, Theme.Spacing.space2)
                }
                .buttonStyle(GlassSecondaryButtonStyle())
                .disabled(isSkipping)
            }
            .padding(.horizontal, Theme.Spacing.space4)
            .padding(.bottom, Theme.Spacing.space4)

        case .completed, .skipped:
            EmptyView()
        }
    }


    // MARK: - Exercises Section

    @ViewBuilder
    private func exercisesSection(_ exercises: [WorkoutExercise], workoutStatus: WorkoutStatus) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Exercises")

            ForEach(exercises) { exercise in
                ExerciseCard(
                    exercise: exercise,
                    workoutId: workoutId,
                    isEditable: workoutStatus == .inProgress,
                    localEdits: localSetEditsForExercise(exercise.exerciseId),
                    onSetEdited: { setId, weight, reps, editedField in
                        updateLocalEdit(setId: setId, weight: weight, reps: reps)
                        cascadeValue(setId: setId, weight: weight, reps: reps, editedField: editedField, in: exercise)
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

            // Handle state based on workout status
            if let workout = workout {
                if workout.status == .inProgress {
                    // Restore local state if available and matches this workout
                    if let state = stateManager.loadState(), state.workoutId == workoutId {
                        restoreLocalState(from: state)
                        // Sync with server - remove edits for already-completed sets
                        syncStateWithServer()
                    } else {
                        // No local state but workout is in progress - initialize fresh
                        stateManager.initializeForWorkout(workoutId: workoutId)
                    }
                } else if workout.status == .completed || workout.status == .skipped {
                    // Workout is finished - clear any stale local state
                    if stateManager.hasStateForWorkout(workoutId: workoutId) {
                        stateManager.clearState()
                        restTimer.dismiss()
                    }
                }
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
                reps: Double(edit.reps ?? 0)
            )
        }

        // Restore timer if still valid
        if let timerState = state.activeTimer {
            let elapsed = Int(Date().timeIntervalSince(timerState.startedAt))
            // Only restore if within 5 minutes of target
            if elapsed < timerState.targetSeconds + 300 {
                restTimer.restore(
                    startedAt: timerState.startedAt,
                    targetSeconds: timerState.targetSeconds,
                    exerciseId: timerState.exerciseId,
                    setNumber: timerState.setNumber
                )
            }
        }
    }

    /// Sync local state with server - server is source of truth for completed sets
    private func syncStateWithServer() {
        guard let workout = workout,
              let exercises = workout.exercises else { return }

        // Server is source of truth for completed sets
        // Remove local edits for sets that are already completed/skipped on server
        for exercise in exercises {
            for set in exercise.sets {
                if set.status == .completed || set.status == .skipped {
                    // Remove from pending edits - server has final values
                    localSetEdits.removeValue(forKey: set.id)
                    stateManager.removePendingEdit(setId: set.id)
                }
            }
        }
    }

    // MARK: - Workout Actions

    private func startWorkout() async {
        isStarting = true

        do {
            // Start the workout - this returns minimal workout data without exercises
            _ = try await apiClient.startWorkout(id: workoutId)
            stateManager.initializeForWorkout(workoutId: workoutId)
            // Reload the full workout to get exercises
            await loadWorkout()
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
            // Preserve planDayName since the complete API doesn't return it
            let existingPlanDayName = workout?.planDayName
            var completedWorkout = try await apiClient.completeWorkout(id: workoutId)
            completedWorkout.planDayName = existingPlanDayName
            workout = completedWorkout
            stateManager.clearState()
            dismissRestTimer()
            showingStretchPrompt = true
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
            // Preserve planDayName since the skip API doesn't return it
            let existingPlanDayName = workout?.planDayName
            var skippedWorkout = try await apiClient.skipWorkout(id: workoutId)
            skippedWorkout.planDayName = existingPlanDayName
            workout = skippedWorkout
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

    private func addSet(exerciseId: String) async {
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

    private func removeSet(exerciseId: String) async {
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

    private func localSetEditsForExercise(_ exerciseId: String) -> [String: SetEditState] {
        guard let exercises = workout?.exercises,
              let exercise = exercises.first(where: { $0.exerciseId == exerciseId }) else {
            return [:]
        }
        let setIds = Set(exercise.sets.map { $0.id })
        return localSetEdits.filter { setIds.contains($0.key) }
    }

    private func updateLocalEdit(setId: String, weight: Double, reps: Int) {
        localSetEdits[setId] = SetEditState(weight: weight, reps: Double(reps))
        stateManager.updatePendingEdit(setId: setId, weight: weight, reps: reps)
    }

    private func cascadeValue(setId: String, weight: Double, reps: Int, editedField: EditedField, in exercise: WorkoutExercise) {
        guard let setIndex = exercise.sets.firstIndex(where: { $0.id == setId }) else { return }
        let currentSet = exercise.sets[setIndex]

        // Update subsequent pending sets with the edited value
        for subsequentSet in exercise.sets where subsequentSet.setNumber > currentSet.setNumber {
            if subsequentSet.status == .pending {
                let existingEdit = localSetEdits[subsequentSet.id]

                // Cascade only the field that was edited, preserve the other
                let newWeight: Double
                let newReps: Double

                switch editedField {
                case .weight:
                    newWeight = weight
                    newReps = existingEdit?.reps ?? Double(subsequentSet.targetReps)
                case .reps:
                    newWeight = existingEdit?.weight ?? subsequentSet.targetWeight
                    newReps = Double(reps)
                }

                localSetEdits[subsequentSet.id] = SetEditState(
                    weight: newWeight,
                    reps: newReps
                )
                stateManager.updatePendingEdit(
                    setId: subsequentSet.id,
                    weight: newWeight,
                    reps: Int(newReps)
                )
            }
        }
    }

    private func updateSetInWorkout(setId: String, status: SetStatus, actualWeight: Double?, actualReps: Int?) {
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

    private func appendSetToExercise(exerciseId: String, set: WorkoutSet) {
        guard var workout = workout,
              var exercises = workout.exercises,
              let exerciseIndex = exercises.firstIndex(where: { $0.exerciseId == exerciseId }) else { return }

        exercises[exerciseIndex].sets.append(set)
        exercises[exerciseIndex].totalSets += 1
        workout.exercises = exercises
        self.workout = workout
    }

    private func removeLastPendingSetFromExercise(exerciseId: String) {
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

    private func startRestTimer(targetSeconds: Int, exerciseId: String, setNumber: Int) {
        restTimer.start(
            targetSeconds: targetSeconds,
            exerciseId: exerciseId,
            setNumber: setNumber
        )

        // Persist timer state
        let timerState = StoredTimerState(
            startedAt: Date(),
            targetSeconds: targetSeconds,
            exerciseId: exerciseId,
            setNumber: setNumber
        )
        stateManager.saveTimerState(timerState)
    }

    private func dismissRestTimer() {
        restTimer.dismiss()
        stateManager.clearTimerState()
        showingTimerOverlay = false
    }
}

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
