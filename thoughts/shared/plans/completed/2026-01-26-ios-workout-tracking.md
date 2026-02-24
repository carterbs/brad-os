# iOS Workout Tracking Implementation Plan

## Overview

Implement the workout tracking feature for the native iOS app, enabling users to view their active mesocycle, track scheduled workouts, log sets with weight/reps, and use rest timers between sets. The iOS app consumes the existing server API - all data management (plans, mesocycles, exercises) is handled via the web app.

## Current State Analysis

### iOS App Structure

**Models exist and match API** (`ios/BradOS/BradOS/Models/`):
- `Exercise.swift:4-20` - Exercise entity with `weightIncrement`
- `Plan.swift:4-45` - Plan with nested `PlanDay` and `PlanDayExercise`
- `Mesocycle.swift:12-50` - Mesocycle with computed `isDeloadWeek`, `progressPercentage`
- `Workout.swift:12-111` - Workout with nested `WorkoutExercise` and `WorkoutSet`
- All models have `CodingKeys` for snake_case JSON mapping

**UI exists but uses mock data**:
- `MesoView.swift:8` - `@State private var activeMesocycle: Mesocycle? = Mesocycle.mockActiveMesocycle`
- `WorkoutView.swift:6` - `@State private var workout: Workout? = Workout.mockTodayWorkout`
- `TodayDashboardView.swift:8` - `@State private var todayWorkout: Workout? = Workout.mockTodayWorkout`

**WorkoutView has placeholder logging UI** (`WorkoutView.swift:294-359`):
- Set rows with weight/reps TextFields
- Checkbox for logging completion
- Rest timer overlay at lines 377-445

**No networking layer**:
- No `URLSession`, `URLRequest`, or async/await networking code
- `Services/` directory mentioned in README but empty

### Server API (Existing Endpoints)

**Mesocycle**:
- `GET /api/mesocycles/active` → `MesocycleWithDetails` (weeks, workouts, progress)

**Workout**:
- `GET /api/workouts/today` → `WorkoutWithExercises` (sets grouped by exercise)
- `GET /api/workouts/:id` → `WorkoutWithExercises`
- `PUT /api/workouts/:id/start` → Updates status to `in_progress`, sets `started_at`
- `PUT /api/workouts/:id/complete` → Updates status to `completed`, sets `completed_at`
- `PUT /api/workouts/:id/skip` → Updates status to `skipped`

**Workout Sets**:
- `PUT /api/workout-sets/:id/log` → Body: `{ actual_reps, actual_weight }`, sets status to `completed`
- `PUT /api/workout-sets/:id/skip` → Sets status to `skipped`
- `PUT /api/workout-sets/:id/unlog` → Resets to `pending`, clears actual values
- `POST /api/workouts/:workoutId/exercises/:exerciseId/sets/add` → Adds set to exercise
- `DELETE /api/workouts/:workoutId/exercises/:exerciseId/sets/remove` → Removes last pending set

### Web App Patterns (Reference)

**localStorage persistence** (`packages/client/src/hooks/useLocalStorage.ts:16-25`):
```typescript
StoredWorkoutState {
  workoutId: number,
  sets: Record<setId, { actual_reps, actual_weight, status }>,
  pendingEdits: Record<setId, { weight?, reps? }>,
  lastUpdated: string
}
```

**Timestamp-based rest timer** (`packages/client/src/hooks/useRestTimer.ts:64-70`):
- Stores `startedAt` timestamp, calculates elapsed from `Date.now() - startedAt`
- Survives tab backgrounding via visibility change listener
- Timer state persisted to localStorage for crash recovery

**Weight cascading**: When user edits weight on set N, automatically update sets N+1, N+2, etc.

## Desired End State

1. **Mesocycle View**: Shows active mesocycle with week cards, progress indicator, current week highlighted
2. **Today Dashboard**: Shows today's scheduled workout with exercise list
3. **Workout Execution**: Full set logging with:
   - Start/complete/skip workout actions
   - Per-set weight/reps input with validation
   - Checkbox to log completion (triggers rest timer)
   - Weight cascading to subsequent sets
   - Visual distinction for completed/pending/skipped sets
4. **Rest Timer**: Counts down from exercise's `restSeconds`, plays audio on completion, supports background
5. **State Recovery**: In-progress workout survives app termination, resumes on relaunch

## Key Discoveries

1. **Models already aligned**: iOS models match API response structure - minimal mapping needed
2. **WorkoutView UI exists**: Set logging UI is built, just needs API wiring
3. **Rest timer pattern**: Web uses timestamp-based calculation for background resilience - same pattern needed in iOS
4. **Optimistic updates**: Web updates UI immediately, syncs to server - iOS should follow same pattern
5. **Dynamic progression**: Server calculates targets when workout starts (`PUT /start` triggers `persistDynamicProgressionToSets`)

## What We're NOT Doing

- Plan creation/editing (web only)
- Mesocycle creation (web only)
- Exercise library management (web only)
- Push notification registration (separate feature)
- Apple Watch integration (future phase)
- Offline mode with full sync (server required)

---

## Implementation Approach

The implementation follows a bottom-up approach: data layer first, then display, then interaction, then polish.

---

## Phase 1: Data Layer

### Overview
Create API service layer to fetch and mutate workout data. Assumes a generic API client exists (provided separately).

### Changes Required

**New File: `ios/BradOS/BradOS/Services/WorkoutAPIService.swift`**
```swift
// Service wrapping workout-related API calls
// Dependencies: APIClient (provided separately)

protocol WorkoutAPIServiceProtocol {
    func getActiveMesocycle() async throws -> MesocycleWithDetails?
    func getTodaysWorkout() async throws -> Workout?
    func getWorkout(id: Int) async throws -> Workout
    func startWorkout(id: Int) async throws -> Workout
    func completeWorkout(id: Int) async throws -> Workout
    func skipWorkout(id: Int) async throws -> Workout
    func logSet(id: Int, actualReps: Int, actualWeight: Double) async throws -> WorkoutSet
    func skipSet(id: Int) async throws -> WorkoutSet
    func unlogSet(id: Int) async throws -> WorkoutSet
    func addSet(workoutId: Int, exerciseId: Int) async throws -> ModifySetCountResult
    func removeSet(workoutId: Int, exerciseId: Int) async throws -> ModifySetCountResult
}
```

**New File: `ios/BradOS/BradOS/Services/WorkoutStateManager.swift`**
```swift
// Manages in-progress workout state persistence
// Uses UserDefaults or file storage

struct StoredWorkoutState: Codable {
    let workoutId: Int
    var sets: [Int: StoredSetState]  // setId -> state
    var pendingEdits: [Int: PendingEdit]  // setId -> uncommitted edits
    var lastUpdated: Date
}

struct StoredSetState: Codable {
    let actualReps: Int
    let actualWeight: Double
    let status: SetStatus
}

struct PendingEdit: Codable {
    var weight: Double?
    var reps: Int?
}

class WorkoutStateManager: ObservableObject {
    func saveState(_ state: StoredWorkoutState)
    func loadState() -> StoredWorkoutState?
    func clearState()
    func updateSet(setId: Int, reps: Int, weight: Double, status: SetStatus)
    func updatePendingEdit(setId: Int, weight: Double?, reps: Int?)
    func getPendingEdit(setId: Int) -> PendingEdit?
}
```

**Update: `ios/BradOS/BradOS/Models/Workout.swift`**
- Add `MesocycleWithDetails` type (lines after existing Mesocycle):
```swift
struct MesocycleWithDetails: Identifiable, Codable {
    let id: Int
    let planId: Int
    var startDate: Date
    var currentWeek: Int
    var status: MesocycleStatus
    var planName: String
    var weeks: [WeekSummary]
    var totalWorkouts: Int
    var completedWorkouts: Int
}

struct WeekSummary: Codable, Hashable {
    let weekNumber: Int
    let isDeload: Bool
    var workouts: [WorkoutSummary]
    var totalWorkouts: Int
    var completedWorkouts: Int
    var skippedWorkouts: Int
}

struct WorkoutSummary: Identifiable, Codable, Hashable {
    let id: Int
    let scheduledDate: Date
    let status: WorkoutStatus
    let planDayName: String
}
```

- Add `ModifySetCountResult` type:
```swift
struct ModifySetCountResult: Codable {
    let currentWorkoutSet: WorkoutSet?
    let futureWorkoutsAffected: Int
    let futureSetsModified: Int
}
```

### Success Criteria
- [ ] `WorkoutAPIService` compiles and conforms to protocol
- [ ] `WorkoutStateManager` can save/load/clear state from UserDefaults
- [ ] All new types have proper `CodingKeys` for snake_case mapping
- [ ] Unit tests pass for state manager serialization

### Confirmation Gate
Verify API service can be instantiated and state manager round-trips data correctly before proceeding.

---

## Phase 2: Mesocycle & Workout Display

### Overview
Connect MesoView and TodayDashboardView to live API data instead of mock data.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Lifting/MesoView.swift`**

Replace mock data initialization (line 8):
```swift
// Before
@State private var activeMesocycle: Mesocycle? = Mesocycle.mockActiveMesocycle

// After
@State private var activeMesocycle: MesocycleWithDetails?
@State private var isLoading = true
@State private var error: Error?
```

Add data fetching:
```swift
.task {
    await loadActiveMesocycle()
}

private func loadActiveMesocycle() async {
    isLoading = true
    do {
        activeMesocycle = try await workoutService.getActiveMesocycle()
    } catch {
        self.error = error
    }
    isLoading = false
}
```

Update week cards section (lines 100-232) to use `activeMesocycle.weeks` array with proper status indicators.

**Update: `ios/BradOS/BradOS/Views/TodayDashboardView.swift`**

Replace mock data (line 8):
```swift
// Before
@State private var todayWorkout: Workout? = Workout.mockTodayWorkout

// After
@State private var todayWorkout: Workout?
@State private var isLoading = true
```

Add data fetching:
```swift
.task {
    await loadTodaysWorkout()
}

private func loadTodaysWorkout() async {
    isLoading = true
    todayWorkout = try? await workoutService.getTodaysWorkout()
    isLoading = false
}
```

Update `TodayWorkoutCard` (lines 127-207) to show loading/empty states.

**Update: `ios/BradOS/BradOS/Views/Lifting/LiftingTabView.swift`**

Inject service via environment or dependency injection:
```swift
@StateObject private var workoutService = WorkoutAPIService()
```

### Success Criteria
- [ ] MesoView shows "No active mesocycle" when none exists
- [ ] MesoView shows week cards with correct completion counts from API
- [ ] TodayDashboardView shows today's workout from API
- [ ] TodayDashboardView shows "No workout scheduled" on rest days
- [ ] Loading indicators display while fetching
- [ ] Pull-to-refresh triggers data reload

### Confirmation Gate
Verify both views display live data from a running server with an active mesocycle.

---

## Phase 3: Workout Execution

### Overview
Implement the core workout tracking flow: start workout, log sets, complete workout.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`**

**State management** (replace lines 4-12):
```swift
@State private var workout: Workout?
@State private var isLoading = true
@State private var isSaving = false
@StateObject private var stateManager = WorkoutStateManager()

// Track local edits before committing
@State private var localSetEdits: [Int: (weight: Double, reps: Int)] = [:]
```

**Fetch workout on appear**:
```swift
.task {
    await loadWorkout()
    restoreLocalState()
}

private func loadWorkout() async {
    isLoading = true
    workout = try? await workoutService.getWorkout(id: workoutId)
    isLoading = false
}

private func restoreLocalState() {
    guard let stored = stateManager.loadState(),
          stored.workoutId == workoutId else { return }
    // Apply stored edits to local state
    for (setId, edit) in stored.pendingEdits {
        localSetEdits[setId] = (edit.weight ?? 0, edit.reps ?? 0)
    }
}
```

**Start workout action** (update lines 112-120):
```swift
private func startWorkout() async {
    guard let id = workout?.id else { return }
    do {
        workout = try await workoutService.startWorkout(id: id)
        stateManager.saveState(StoredWorkoutState(
            workoutId: id,
            sets: [:],
            pendingEdits: [:],
            lastUpdated: Date()
        ))
    } catch {
        // Show error alert
    }
}
```

**Log set action** (update checkbox handler around line 340):
```swift
private func logSet(_ set: WorkoutSet) async {
    let weight = localSetEdits[set.id]?.weight ?? set.targetWeight
    let reps = localSetEdits[set.id]?.reps ?? set.targetReps

    // Optimistic update
    updateSetLocally(set.id, status: .completed, weight: weight, reps: reps)
    stateManager.updateSet(setId: set.id, reps: Int(reps), weight: weight, status: .completed)

    // Start rest timer
    startRestTimer(for: set)

    do {
        let updated = try await workoutService.logSet(
            id: set.id,
            actualReps: Int(reps),
            actualWeight: weight
        )
        // Confirm update
    } catch {
        // Rollback optimistic update
        updateSetLocally(set.id, status: .pending, weight: nil, reps: nil)
    }
}
```

**Weight cascading** (new function):
```swift
private func onWeightChanged(for set: WorkoutSet, newWeight: Double) {
    guard let workout = workout,
          let exerciseIndex = workout.exercises?.firstIndex(where: { $0.exerciseId == set.exerciseId }),
          let exercise = workout.exercises?[exerciseIndex] else { return }

    // Update this set and all subsequent pending sets
    for subsequentSet in exercise.sets where subsequentSet.setNumber >= set.setNumber {
        if subsequentSet.status == .pending {
            localSetEdits[subsequentSet.id] = (
                weight: newWeight,
                reps: localSetEdits[subsequentSet.id]?.reps ?? Double(subsequentSet.targetReps)
            )
        }
    }

    // Persist pending edits
    for (setId, edit) in localSetEdits {
        stateManager.updatePendingEdit(setId: setId, weight: edit.weight, reps: Int(edit.reps))
    }
}
```

**Complete workout action** (update lines 130-150):
```swift
private func completeWorkout() async {
    guard let id = workout?.id else { return }
    isSaving = true
    do {
        workout = try await workoutService.completeWorkout(id: id)
        stateManager.clearState()
        // Navigate back or show completion
    } catch {
        // Show error
    }
    isSaving = false
}
```

**Set row UI** (update lines 294-359):
- Bind TextField values to `localSetEdits[set.id]`
- Call `onWeightChanged` when weight field changes
- Show actual values for completed sets, target values for pending
- Disable inputs for completed/skipped sets

### Success Criteria
- [ ] "Start Workout" button calls API and updates status to in_progress
- [ ] Logging a set calls API with actual_reps and actual_weight
- [ ] Weight change cascades to subsequent pending sets
- [ ] "Complete Workout" calls API and clears local state
- [ ] Skipping a set calls skip API
- [ ] Unlogging a completed set reverts to pending
- [ ] Visual distinction between pending (gray), completed (green), skipped (yellow) sets

### Confirmation Gate
Complete a full workout flow: start → log all sets → complete. Verify data persists in database.

---

## Phase 4: Rest Timer

### Overview
Implement between-set rest timer with audio notification and background support.

### Changes Required

**New File: `ios/BradOS/BradOS/Services/RestTimerManager.swift`**
```swift
import AVFoundation
import UserNotifications

class RestTimerManager: ObservableObject {
    @Published var isActive = false
    @Published var elapsedSeconds: Int = 0
    @Published var targetSeconds: Int = 0
    @Published var isComplete = false

    private var startedAt: Date?
    private var timer: Timer?
    private var audioPlayer: AVAudioPlayer?

    var remainingSeconds: Int {
        max(0, targetSeconds - elapsedSeconds)
    }

    var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        return Double(elapsedSeconds) / Double(targetSeconds)
    }

    func start(targetSeconds: Int) {
        self.targetSeconds = targetSeconds
        self.startedAt = Date()
        self.elapsedSeconds = 0
        self.isComplete = false
        self.isActive = true

        scheduleLocalNotification(in: targetSeconds)
        startTimer()
    }

    func dismiss() {
        stopTimer()
        cancelNotification()
        isActive = false
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    private func tick() {
        guard let startedAt = startedAt else { return }
        elapsedSeconds = Int(Date().timeIntervalSince(startedAt))

        if elapsedSeconds >= targetSeconds && !isComplete {
            isComplete = true
            playCompletionSound()
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    // Recalculate on foreground (handles background)
    func handleForeground() {
        guard isActive, let startedAt = startedAt else { return }
        elapsedSeconds = Int(Date().timeIntervalSince(startedAt))
        if elapsedSeconds >= targetSeconds {
            isComplete = true
        }
    }

    private func playCompletionSound() {
        // Play system sound or custom audio
        AudioServicesPlaySystemSound(1007) // Standard "tweet" sound
    }

    private func scheduleLocalNotification(in seconds: Int) {
        let content = UNMutableNotificationContent()
        content.title = "Rest Complete"
        content.body = "Time for your next set!"
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: Double(seconds), repeats: false)
        let request = UNNotificationRequest(identifier: "restTimer", content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request)
    }

    private func cancelNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["restTimer"])
    }
}
```

**Update: `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`**

Add timer manager (after other state):
```swift
@StateObject private var restTimer = RestTimerManager()
```

Update rest timer overlay (lines 377-445):
```swift
// Rest Timer Overlay
if restTimer.isActive {
    RestTimerOverlay(
        elapsedSeconds: restTimer.elapsedSeconds,
        targetSeconds: restTimer.targetSeconds,
        isComplete: restTimer.isComplete,
        onDismiss: { restTimer.dismiss() }
    )
}
```

Start timer after logging set:
```swift
private func startRestTimer(for set: WorkoutSet) {
    // Get rest seconds from exercise config
    guard let exercise = workout?.exercises?.first(where: { $0.exerciseId == set.exerciseId }) else { return }
    restTimer.start(targetSeconds: exercise.restSeconds)
}
```

Handle foreground notification in view:
```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    restTimer.handleForeground()
}
```

**New File: `ios/BradOS/BradOS/Views/Components/RestTimerOverlay.swift`**
```swift
struct RestTimerOverlay: View {
    let elapsedSeconds: Int
    let targetSeconds: Int
    let isComplete: Bool
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            // Circular progress indicator
            ZStack {
                Circle()
                    .stroke(Theme.backgroundSecondary, lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(isComplete ? Theme.statusCompleted : Theme.primary, lineWidth: 8)
                    .rotationEffect(.degrees(-90))

                VStack {
                    Text(timeString)
                        .font(.system(size: 48, weight: .bold, design: .monospaced))
                    Text(isComplete ? "Rest Complete" : "Resting...")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .frame(width: 200, height: 200)

            Button("Dismiss") {
                onDismiss()
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.8))
    }

    private var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        return min(1.0, Double(elapsedSeconds) / Double(targetSeconds))
    }

    private var timeString: String {
        let display = isComplete ? elapsedSeconds : max(0, targetSeconds - elapsedSeconds)
        let minutes = display / 60
        let seconds = display % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
```

**Update: `ios/BradOS/BradOS/App/BradOSApp.swift`**

Request notification permission on launch:
```swift
.onAppear {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
}
```

### Success Criteria
- [ ] Rest timer starts automatically after logging a set
- [ ] Timer displays elapsed time counting up toward target
- [ ] Circular progress indicator fills as time passes
- [ ] Audio plays when target time reached
- [ ] "Rest Complete" text displays after completion
- [ ] Timer continues counting after target (shows overtime)
- [ ] Dismiss button stops timer
- [ ] Timer survives app backgrounding (recalculates on foreground)
- [ ] Local notification fires if app is backgrounded

### Confirmation Gate
Log a set, background the app, wait for rest period, verify notification appears and timer shows correct time when returning.

---

## Phase 5: State Recovery & Polish

### Overview
Ensure workout state survives app termination and handle edge cases.

### Changes Required

**Update: `ios/BradOS/BradOS/Services/WorkoutStateManager.swift`**

Add timer state persistence:
```swift
struct StoredWorkoutState: Codable {
    let workoutId: Int
    var sets: [Int: StoredSetState]
    var pendingEdits: [Int: PendingEdit]
    var lastUpdated: Date

    // Timer state for recovery
    var activeTimer: StoredTimerState?
}

struct StoredTimerState: Codable {
    let startedAt: Date
    let targetSeconds: Int
    let exerciseId: Int
    let setNumber: Int
}
```

**Update: `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`**

Restore timer on appear:
```swift
private func restoreLocalState() {
    guard let stored = stateManager.loadState(),
          stored.workoutId == workoutId else { return }

    // Restore pending edits
    for (setId, edit) in stored.pendingEdits {
        localSetEdits[setId] = (edit.weight ?? 0, edit.reps ?? 0)
    }

    // Restore active timer
    if let timerState = stored.activeTimer {
        let elapsed = Int(Date().timeIntervalSince(timerState.startedAt))
        if elapsed < timerState.targetSeconds + 300 { // Allow 5 min grace period
            restTimer.restore(startedAt: timerState.startedAt, targetSeconds: timerState.targetSeconds)
        }
    }
}
```

Save timer state when starting:
```swift
private func startRestTimer(for set: WorkoutSet) {
    guard let exercise = workout?.exercises?.first(where: { $0.exerciseId == set.exerciseId }) else { return }

    restTimer.start(targetSeconds: exercise.restSeconds)

    // Persist timer state
    var state = stateManager.loadState() ?? StoredWorkoutState(workoutId: workout!.id, sets: [:], pendingEdits: [:], lastUpdated: Date(), activeTimer: nil)
    state.activeTimer = StoredTimerState(
        startedAt: Date(),
        targetSeconds: exercise.restSeconds,
        exerciseId: set.exerciseId,
        setNumber: set.setNumber
    )
    stateManager.saveState(state)
}
```

Clear timer state on dismiss:
```swift
private func dismissRestTimer() {
    restTimer.dismiss()

    var state = stateManager.loadState()
    state?.activeTimer = nil
    if let state = state {
        stateManager.saveState(state)
    }
}
```

**Add/Remove set actions**:
```swift
private func addSet(exerciseId: Int) async {
    guard let workoutId = workout?.id else { return }
    do {
        let result = try await workoutService.addSet(workoutId: workoutId, exerciseId: exerciseId)
        if let newSet = result.currentWorkoutSet {
            // Add to local workout state
            appendSetToExercise(exerciseId: exerciseId, set: newSet)
        }
    } catch {
        // Show error
    }
}

private func removeSet(exerciseId: Int) async {
    guard let workoutId = workout?.id else { return }
    do {
        _ = try await workoutService.removeSet(workoutId: workoutId, exerciseId: exerciseId)
        // Remove last pending set from local state
        removeLastPendingSet(exerciseId: exerciseId)
    } catch {
        // Show error (e.g., must keep at least 1 set)
    }
}
```

**Handle workout already in progress**:
```swift
.task {
    await loadWorkout()

    if workout?.status == .inProgress {
        // Check for local state from previous session
        restoreLocalState()
    }
}
```

**Edge case: Server/local state mismatch**:
```swift
private func syncStateWithServer() {
    guard let workout = workout,
          let stored = stateManager.loadState(),
          stored.workoutId == workout.id else { return }

    // Server is source of truth for completed sets
    // Local state only tracks pending edits and timer
    for exercise in workout.exercises ?? [] {
        for set in exercise.sets {
            if set.status == .completed {
                // Remove from pending edits - server has final values
                localSetEdits.removeValue(forKey: set.id)
            }
        }
    }
}
```

### Success Criteria
- [ ] Kill app during workout, relaunch → workout resumes with correct set states
- [ ] Kill app with rest timer active, relaunch → timer shows correct elapsed time
- [ ] Pending weight/rep edits survive app restart
- [ ] Stale state (different workout) is discarded on load
- [ ] Add Set button adds a new set to exercise, updates future workouts
- [ ] Remove Set button removes last pending set (error if only 1 set remains)
- [ ] Server-completed sets override local state on reload

### Confirmation Gate
Full crash recovery test:
1. Start workout, log 2 sets, edit weight on set 3
2. Force-quit app
3. Relaunch → verify sets 1-2 show as completed, set 3 has edited weight

---

## Testing Strategy

### Unit Tests
- `WorkoutStateManager` serialization/deserialization
- `RestTimerManager` elapsed calculation
- Weight cascading logic
- State merge logic (server vs local)

### Integration Tests
- API service methods against mock server
- Full workout flow with mocked API responses

### Manual Testing Checklist
- [ ] No mesocycle → shows empty state
- [ ] Active mesocycle → shows week overview with progress
- [ ] Today's workout → shows exercise list with sets
- [ ] Start workout → status changes, button updates
- [ ] Log set → checkbox fills, triggers rest timer
- [ ] Weight edit → cascades to pending sets
- [ ] Complete workout → navigates back, clears state
- [ ] Skip workout → marks all sets skipped
- [ ] Rest timer → counts, plays sound, shows notification
- [ ] Background/foreground → timer continues correctly
- [ ] App termination → state recovered on relaunch

---

## References

### Spec
- `/Users/bradcarter/Documents/Dev/brad-os/ios/specs/workout-tracking.md`

### Existing iOS Code
- Models: `ios/BradOS/BradOS/Models/Workout.swift`, `Mesocycle.swift`, `Exercise.swift`, `Plan.swift`
- Views: `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`, `MesoView.swift`
- Dashboard: `ios/BradOS/BradOS/Views/TodayDashboardView.swift`

### Web Implementation (Reference)
- Workout hooks: `packages/client/src/hooks/useWorkout.ts`
- Rest timer: `packages/client/src/hooks/useRestTimer.ts`
- State storage: `packages/client/src/hooks/useLocalStorage.ts`
- Timer storage: `packages/client/src/utils/timerStorage.ts`

### API Endpoints
- `packages/server/src/routes/workout.routes.ts`
- `packages/server/src/routes/workout-set.routes.ts`
- `packages/server/src/routes/mesocycle.routes.ts`
