import SwiftUI
import UIKit
import BradOSCore

/// Full workout tracking view with API integration
struct WorkoutView: View {
    let workoutId: String
    @EnvironmentObject var appState: AppState
    @Environment(\.apiClient) var apiClient
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var watchWorkoutController: WatchWorkoutController

    // Workout state
    @State var workout: Workout?
    @State var isLoading = true
    @State var error: Error?

    // Action states
    @State var isStarting = false
    @State var isCompleting = false
    @State var isSkipping = false

    // Alerts
    @State var showingCompleteAlert = false
    @State var showingSkipAlert = false
    @State var showingStretchPrompt = false

    // Local edit state (set ID -> edited values)
    @State var localSetEdits: [String: SetEditState] = [:]

    // Full-screen timer overlay
    @State var showingTimerOverlay = false

    // Barcode wallet
    @State var showingBarcodeSheet = false
    @State var walletBarcodes: [Barcode] = []

    // Managers for persistence and timer
    @StateObject var stateManager = WorkoutStateManager()
    @StateObject var restTimer = RestTimerManager()

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
        .onReceive(NotificationCenter.default.publisher(for: .watchSetLogRequested)) { notification in
            guard let setId = notification.userInfo?["setId"] as? String,
                  let exerciseId = notification.userInfo?["exerciseId"] as? String,
                  let exercises = workout?.exercises,
                  let exercise = exercises.first(where: { $0.exerciseId == exerciseId }),
                  let set = exercise.sets.first(where: { $0.id == setId }),
                  set.status == .pending else { return }
            Task { await logSet(set, exercise: exercise) }
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

    var loadingContent: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading workout...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }

    func errorContent(_ error: Error) -> some View {
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

    var emptyContent: some View {
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

    func workoutContent(_ workout: Workout) -> some View {
        VStack(spacing: Theme.Spacing.space6) {
            // Header
            workoutHeader(workout)

            // Watch not connected hint
            if watchWorkoutController.isWatchPairedButUnreachable {
                HStack(spacing: 6) {
                    Image(systemName: "applewatch.slash")
                        .font(.caption2)
                    Text("Apple Watch not connected")
                        .font(.caption)
                }
                .foregroundColor(Theme.textTertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.space2)
            }

            // Exercises
            if let exercises = workout.exercises {
                exercisesSection(exercises, workoutStatus: workout.status)
            }
        }
        .padding(Theme.Spacing.space4)
        .padding(.bottom, bottomPadding(for: workout))
    }

    /// Calculate bottom padding based on floating UI elements
    func bottomPadding(for workout: Workout) -> CGFloat {
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
    func workoutHeader(_ workout: Workout) -> some View {
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

                if watchWorkoutController.isWorkoutActive && watchWorkoutController.currentHeartRate > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.caption)
                            .foregroundColor(.red)
                        Text("\(Int(watchWorkoutController.currentHeartRate))")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(Theme.textPrimary)
                            .monospacedDigit()
                            .contentTransition(.numericText())
                    }
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

    func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter.string(from: date)
    }

    // MARK: - Floating Action Buttons

    @ViewBuilder
    func floatingActionButtons(_ workout: Workout) -> some View {
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
    func exercisesSection(_ exercises: [WorkoutExercise], workoutStatus: WorkoutStatus) -> some View {
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
}
