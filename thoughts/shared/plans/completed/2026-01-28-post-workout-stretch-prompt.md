# Post-Workout Stretch Prompt

## Overview

After completing a workout, prompt the user with an alert asking if they'd like to start a stretching session. Tapping "Start Stretch" navigates directly from the lifting context into the stretch context.

## Current State Analysis

**Workout completion flow** (`WorkoutView.swift:458-476`):
- User taps "Complete Workout" button, sees confirmation alert (`WorkoutView.swift:94-108`)
- `completeWorkout()` calls the API, updates local state, clears state manager, dismisses rest timer
- After completion, the user stays on the workout detail page with a "Completed" badge
- No post-completion prompts or suggestions exist

**Cross-activity navigation**:
- `ContentView.swift:8-20` switches between contexts based on `AppState` boolean flags
- `AppState` (`BradOSApp.swift:38-58`) manages `isShowingLiftingContext`, `isShowingStretch`, `isShowingMeditation`
- Transitioning from workout to stretch = set `isShowingLiftingContext = false` + `isShowingStretch = true`

**WorkoutView state variables** (`WorkoutView.swift:6-33`):
- Has `@Environment(\.dismiss)`, `@Environment(\.apiClient)`
- Does NOT currently have `@EnvironmentObject var appState: AppState`
- Has existing alert pattern: `showingCompleteAlert`, `showingSkipAlert`

## Desired End State

After a workout is marked complete, an alert appears:
- Title: "Time to Stretch?"
- Message: "Stretching after a workout helps with recovery. Start a stretch session?"
- Buttons: "Not Now" (cancel) / "Start Stretch" (action)
- "Start Stretch" transitions from lifting context to stretch context (setup screen)

## What We're NOT Doing

- No backend changes (this is purely iOS UI/navigation)
- No smart logic around "should we prompt" (e.g. checking if user already stretched today) -- keep it simple, always prompt
- No user preference to disable the prompt (can add later if annoying)
- No deep linking into a specific stretch configuration

## Key Discoveries

| Finding | Location |
|---------|----------|
| Workout completion method | `WorkoutView.swift:458-476` |
| Existing alert pattern | `WorkoutView.swift:22-23` (state vars), `94-116` (alert modifiers) |
| AppState navigation flags | `BradOSApp.swift:38-42` |
| Context switching logic | `ContentView.swift:8-20` |
| WorkoutView does not have AppState access | `WorkoutView.swift:6-9` (no `@EnvironmentObject`) |
| StretchView idle state shows setup screen | `StretchView.swift:30-45` |

## Implementation Approach

This is a single-phase, iOS-only change touching one file (`WorkoutView.swift`). The approach follows the existing `.alert()` pattern already used for workout completion and skip confirmations.

## Phase 1: Add Stretch Prompt to WorkoutView

### Changes Required

**File: `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`**

1. **Add AppState access** (near line 9):
   ```swift
   @EnvironmentObject var appState: AppState
   ```

2. **Add alert state variable** (near line 23, alongside existing alert state):
   ```swift
   @State private var showingStretchPrompt = false
   ```

3. **Trigger prompt after successful completion** (inside `completeWorkout()`, after line 468):
   ```swift
   // After stateManager.clearState() and dismissRestTimer()
   showingStretchPrompt = true
   ```

4. **Add alert modifier** (after the existing `.alert("Skip Workout?", ...)` block, near line 116):
   ```swift
   .alert("Time to Stretch?", isPresented: $showingStretchPrompt) {
       Button("Not Now", role: .cancel) {}
       Button("Start Stretch") {
           appState.isShowingLiftingContext = false
           appState.isShowingStretch = true
       }
   } message: {
       Text("Stretching after a workout helps with recovery. Start a stretch session?")
   }
   ```

### Success Criteria

**Automated:**
- `xcodebuild` compiles without errors
- Existing unit tests pass

**Manual:**
- Complete a workout in the iOS app
- Verify the "Time to Stretch?" alert appears after completion
- Tap "Start Stretch" and verify navigation to stretch setup screen
- Tap "Not Now" and verify the user stays on the completed workout view
- Verify no prompt appears when skipping a workout

## Testing Strategy

**Manual testing (via iOS Simulator):**
1. Start a workout, complete all sets, tap "Complete Workout", confirm
2. Verify stretch prompt alert appears
3. Tap "Not Now" -- verify stays on completed workout, no side effects
4. Repeat completion flow, tap "Start Stretch" -- verify navigates to stretch setup
5. Verify back button from stretch returns to main tab view (not lifting context)

## References

- `WorkoutView.swift` - Main file to modify
- `BradOSApp.swift:38-58` - AppState definition
- `ContentView.swift:8-20` - Context switching logic
- `StretchView.swift:30-45` - Stretch idle/setup state
