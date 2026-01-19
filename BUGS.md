# Bug Tracker

## High Severity

### BUG #10: Weight/Reps Don't Persist Across Workouts (Progressive Overload Broken)
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a mesocycle and complete workout for Day 1 Week 1
2. On Exercise A, log sets at 100 lbs for 8 reps
3. Complete the workout
4. Navigate to Day 1 Week 2 (same exercises)

**Expected behavior:** First set of Exercise A should show 100 lbs / 8 reps (or progressed values based on odd/even week rules)

**Actual behavior:** Sets show the original plan values, not the peak values achieved in Week 1

**Impact:** Core progressive overload feature is broken. Users have to manually remember and re-enter their best weights/reps each week, defeating the purpose of the tracking app.

**Fix:** Added peak performance tracking in WorkoutService. When viewing or starting a workout, the system looks at all previous weeks' completed sets for the same exercise and uses the peak weight/reps as a floor. Changes: getPreviousWeekPeakPerformance() scans all previous weeks, adjustments applied in buildWorkoutWithExercises() for preview and persisted at workout start.

---

## Medium Severity

### BUG #12: Rest Timer Stops When App Goes to Background
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a workout and log a set (rest timer starts)
2. Switch to another app or lock the phone
3. Wait 30+ seconds
4. Return to the app

**Expected behavior:** Rest timer should continue counting in background and show accurate remaining time (or that time is up)

**Actual behavior:** Timer pauses when app is backgrounded, shows incorrect remaining time on return

**Technical note:** May require PWA with service worker, or Web Worker, or storing timer start time and calculating elapsed on focus.

**Impact:** Users can't rely on the timer for actual rest periods. Core workout feature degraded.

**Fix:** Changed useRestTimer hook from increment-based counting to timestamp-based calculation. Instead of incrementing elapsed seconds by 1 on each interval tick, the hook now stores the start timestamp and calculates elapsed time from `Date.now() - startedAt`. Added a visibility change listener that recalculates elapsed time immediately when the tab becomes visible again, ensuring the UI updates right away when returning from background.

---

### BUG #13: Prompt to Complete Workout When All Sets Done
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a workout with multiple exercises
2. Log or skip all sets for all exercises
3. Observe the UI

**Expected behavior:** App should prompt user to complete the workout (dialog or prominent button)

**Actual behavior:** No prompt appears. User must manually find and click the complete button.

**Impact:** UX friction - users may not realize workout is ready to complete, or may forget to complete it.

**Fix:** Added an "All Sets Complete!" dialog in WorkoutView.tsx that automatically appears when all sets are logged/completed during an in-progress workout. The dialog congratulates the user and offers two options: "Not Yet" to dismiss and continue, or "Complete Workout" to finish. A ref tracks whether the prompt was dismissed to avoid showing it repeatedly during the same session.

---

### BUG #14: Reps Don't Cascade Like Weight Does
**Status:** Open

**Steps to reproduce:**
1. Start a workout with an exercise that has multiple sets
2. Change the reps value on the first set
3. Observe other sets

**Expected behavior:** Changing reps on first set should cascade to subsequent unlogged sets (like weight does)

**Actual behavior:** Only weight cascades; reps changes don't propagate to other sets

**Impact:** Users must manually update reps on each set, tedious when adjusting target reps.

---

### BUG #15: Numerical Input Zoom Doesn't Reset on Mobile
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Open app on mobile device (iOS Safari)
2. Tap on weight or reps input field
3. Screen zooms in to the input
4. Finish entering value (blur the field)

**Expected behavior:** Screen should zoom back to normal view after input complete

**Actual behavior:** Screen stays zoomed in, user must manually pinch to zoom out

**Technical note:** Often caused by inputs with font-size < 16px on iOS. Fix may involve CSS `font-size: 16px` on inputs or `maximum-scale=1` in viewport meta.

**Impact:** Poor mobile UX, requires manual zoom adjustment after every input.

**Fix:** Added `font-size: 16px` to `.rt-TextFieldInput` class in global.css. iOS Safari only auto-zooms on inputs with font-size < 16px, so this prevents the zoom behavior entirely.

---

### BUG #16: Sound Doesn't Work on Safari
**Status:** Pending Verification (2026-01-19)

**Steps to reproduce:**
1. Open app in Safari (macOS or iOS)
2. Start a workout and log a set (rest timer starts)
3. Wait for timer to complete

**Expected behavior:** Sound should play when rest timer finishes

**Actual behavior:** No sound plays (works in Chrome/Firefox)

**Technical note:** Safari requires user interaction before playing audio. May need to "unlock" audio context on first user tap.

**Impact:** Users on Safari (especially iOS) miss audio notifications for rest timer completion.

**Fix:** Changed audio.ts to use a shared AudioContext singleton instead of creating a new context per beep. Added initAudioContext() function that unlocks the context during user interaction. WorkoutView.tsx now calls initAudioContext() when user logs a set, which happens before the timer completes. This ensures the AudioContext is unlocked via user gesture before automatic playback is needed.

---

### BUG #8: Can Create Plan With No Workout Days
**Status:** Open

**Steps to reproduce:**
1. Navigate to Plans > Create Plan
2. Enter a plan name
3. Click Next without selecting any workout days
4. Click "Create Plan" on the Exercises step

**Expected behavior:** Validation should prevent proceeding without at least one day selected

**Actual behavior:**
- Wizard allows proceeding to Exercises step
- Shows warning "No days selected. Go back to select workout days."
- But "Create Plan" button is still clickable
- Successfully creates a plan with 0 workout days

**Impact:** Users can create useless plans that cannot be used for mesocycles.

---

## Feature Requests

### FEATURE #1: Improved Progressive Overload Algorithm
**Status:** Open (Future Enhancement)

**Current behavior:** Progression is calculated at mesocycle creation based on week number. Peak performance now persists across weeks (BUG #10 fix ensures reps/weight never decrease once achieved).

**Desired behavior:** True progressive overload cycle:
1. Start at base reps (e.g., 8)
2. Next week: +1 rep (9)
3. Next week: add weight, drop to lower rep range (6)
4. Build back up: 7 → 8 → 9
5. Add weight again, drop reps
6. Repeat cycle

**Impact:** Current system doesn't implement the full progressive overload model where you build reps, add weight, drop reps, and rebuild.

**Notes:** This is a significant algorithm change. Current BUG #10 fix maintains peak performance which is an improvement, but the full progression model described above would be ideal.
