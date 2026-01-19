# Bug Tracker

## Critical

### BUG #5: Mesocycle Start Date Off By One Day
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Navigate to Meso page
2. Select a plan and set start date to today (e.g., Jan 19, 2026)
3. Click "Start Mesocycle"

**Expected behavior:** Mesocycle shows "Started Jan 19, 2026" and schedule shows correct dates

**Actual behavior:**
- Mesocycle header shows "Started Jan 18, 2026" (one day early)
- Weekly schedule shows "Sun, Jan 18" for Day 1
- But workout detail page shows "Monday, Jan 19" for the same workout

**Impact:** Date confusion throughout the app. Users see inconsistent dates between Meso schedule and workout pages. Likely a timezone/UTC conversion issue.

**Fix:** Changed `new Date(dateString)` to `new Date(dateString + 'T00:00:00')` in three components (MesocycleStatusCard.tsx, MesoTab.tsx, WeekCard.tsx) to parse date strings as local time instead of UTC. This matches the pattern already used in WorkoutView.tsx.

---

### BUG #6: Mesocycle Completes Without Confirmation Dialog
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a mesocycle
2. With 0% progress (or any progress), click the "Complete" button

**Expected behavior:** Confirmation dialog asking "Are you sure you want to complete this mesocycle?"

**Actual behavior:** Mesocycle immediately completes with no confirmation. Tested at 0% progress (0/14 workouts, only 2 sets logged) - instantly marked as "Completed"

**Impact:** Accidental clicks could destroy weeks of workout tracking data. No way to undo.

**Fix:** Added CompleteMesocycleDialog component that prompts for confirmation before completing. Also displays a warning when progress is below 100%.

---

## High Severity

### BUG #10: Weight/Reps Don't Persist Across Workouts (Progressive Overload Broken)
**Status:** Open

**Steps to reproduce:**
1. Start a mesocycle and complete workout for Day 1 Week 1
2. On Exercise A, log sets at 100 lbs for 8 reps
3. Complete the workout
4. Navigate to Day 1 Week 2 (same exercises)

**Expected behavior:** First set of Exercise A should show 100 lbs / 8 reps (or progressed values based on odd/even week rules)

**Actual behavior:** Sets show the original plan values, not the peak values achieved in Week 1

**Impact:** Core progressive overload feature is broken. Users have to manually remember and re-enter their best weights/reps each week, defeating the purpose of the tracking app.

---

### BUG #11: Weight/Rep Changes Lost on Page Refresh (Unlogged Sets)
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a workout
2. Change weight value on an unlogged set (e.g., 30 to 35)
3. Refresh the page (F5 or browser refresh)
4. Check the weight value

**Expected behavior:** Weight value should persist (35) - similar to navigation persistence from BUG #9

**Actual behavior:** Weight value reverts to original (30)

**Note:** BUG #9 fixed persistence for navigation away, but page refresh may bypass localStorage restoration.

**Impact:** Users who adjust weights then accidentally refresh will lose their changes.

**Fix:** Added a useEffect in SetRow.tsx that restores pendingEdit values when they become available after mount. The issue was that useState only uses initial values on first render, so if pendingEdit wasn't available immediately (due to React rendering order on page refresh), the component would use fallback values and never update. The new effect tracks whether pendingEdit has been applied and restores weight/reps values when pendingEdit first becomes available.

---

### BUG #1: Plan creation hangs indefinitely on "Saving..."

**Status:** Could Not Reproduce

**Originally reported steps:**
1. Navigate to Plans > Create Plan
2. Enter plan name "Test Push Pull Plan"
3. Select Monday and Thursday as workout days
4. Add exercises: Dumbbell Press (Flat) for Monday, Pulldown (Narrow Grip) for Thursday
5. Click "Create Plan"

**Originally reported behavior:** Button shows "Saving..." indefinitely. Network inspection shows the plan and first day are created successfully, but the request to create the second day hangs without completion.

**Investigation (2026-01-19):**
- E2E test "should create a plan with multiple days" passes consistently
- Manual testing via Playwright successfully created multi-day plans with exercises
- Code review found no obvious issues in the sequential mutation flow
- Suspected cause: Transient issue during exploratory testing (possibly related to port conflicts or network timing)

**Resolution:** No code changes needed. Existing E2E tests cover this functionality. Will monitor for recurrence.

---

## Medium Severity

### BUG #12: Rest Timer Stops When App Goes to Background
**Status:** Open

**Steps to reproduce:**
1. Start a workout and log a set (rest timer starts)
2. Switch to another app or lock the phone
3. Wait 30+ seconds
4. Return to the app

**Expected behavior:** Rest timer should continue counting in background and show accurate remaining time (or that time is up)

**Actual behavior:** Timer pauses when app is backgrounded, shows incorrect remaining time on return

**Technical note:** May require PWA with service worker, or Web Worker, or storing timer start time and calculating elapsed on focus.

**Impact:** Users can't rely on the timer for actual rest periods. Core workout feature degraded.

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
**Status:** Open

**Steps to reproduce:**
1. Open app on mobile device (iOS Safari)
2. Tap on weight or reps input field
3. Screen zooms in to the input
4. Finish entering value (blur the field)

**Expected behavior:** Screen should zoom back to normal view after input complete

**Actual behavior:** Screen stays zoomed in, user must manually pinch to zoom out

**Technical note:** Often caused by inputs with font-size < 16px on iOS. Fix may involve CSS `font-size: 16px` on inputs or `maximum-scale=1` in viewport meta.

**Impact:** Poor mobile UX, requires manual zoom adjustment after every input.

---

### BUG #16: Sound Doesn't Work on Safari
**Status:** Open

**Steps to reproduce:**
1. Open app in Safari (macOS or iOS)
2. Start a workout and log a set (rest timer starts)
3. Wait for timer to complete

**Expected behavior:** Sound should play when rest timer finishes

**Actual behavior:** No sound plays (works in Chrome/Firefox)

**Technical note:** Safari requires user interaction before playing audio. May need to "unlock" audio context on first user tap.

**Impact:** Users on Safari (especially iOS) miss audio notifications for rest timer completion.

---

### BUG #7: Exercises Don't Load When Editing Existing Plan
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Create a plan with exercises configured on multiple days
2. Go to Plans, click on the plan to view it
3. Click "Edit" button
4. Click through to the Exercises step (step 3)

**Expected behavior:** Exercises tab shows all previously configured exercises for each day

**Actual behavior:** All day tabs are empty. Monday tab shows 0 exercises even though the plan had 6 exercises on that day.

**Impact:** Plan editing is unusable. Users would lose all exercise configurations if they save. Effectively breaks the ability to modify existing plans.

**Fix:** Added `useAllPlanDayExercises` hook that fetches exercises for all days in parallel using `useQueries`. EditPlanPage now waits for exercises to load and passes them to the form state converter instead of an empty array.

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

### BUG #9: Weight/Rep Changes Don't Persist Before Logging Set
**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Start a workout
2. Change weight value on an unlogged set (e.g., 30 to 35)
3. Navigate away (click Meso or Plans link)
4. Navigate back to the workout

**Expected behavior:** Weight value should persist (35)

**Actual behavior:** Weight value reverts to original (30)

**Impact:** Users who adjust weights then navigate away before logging will lose their changes. May be intentional behavior (only save on log), but confusing UX.

**Fix:** Extended localStorage storage to include pending weight/reps edits for unlogged sets. Added `pendingEdits` field to `StoredWorkoutState` and methods (`updatePendingEdit`, `getPendingEdit`, `clearPendingEdit`) to `useWorkoutStorage` hook. SetRow now saves edits to localStorage on every change and restores them on mount. Pending edits are cleared when a set is logged.

---

### BUG #2: Negative weight values are accepted in the UI (but rejected by backend)

**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. On Today page with in-progress workout
2. Enter "-10" in the weight field for any set
3. Enter valid reps value
4. Check the checkbox to log the set

**Expected behavior:** Frontend should validate and reject negative weight values before submission

**Actual behavior:** UI accepts negative weight value and optimistically updates to show set as logged, rest timer starts, but backend returns 400 Bad Request error

**Impact:** Poor UX due to optimistic UI update followed by silent failure

**Fix:** Added frontend validation in SetRow.tsx that checks for negative weight/reps values before submitting. Validation errors are displayed inline with red highlighting.

---

### BUG #3: Frontend doesn't handle server validation errors gracefully

**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Enter invalid data (like negative weight) and log a set
2. Dismiss the timer

**Expected behavior:** Either frontend validates before submission, or server errors are shown to user with proper error messages

**Actual behavior:** UI optimistically updates (shows set logged, timer starts), but when server rejects the request, the UI state becomes inconsistent. When timer is dismissed, the set reverts unexpectedly without any error message to the user.

**Impact:** Confusing UX when validation errors occur

**Fix:** Two-part fix:
1. Frontend validation (BUG #2 fix) prevents most invalid submissions
2. Changed SetRow.tsx useEffect dependencies to preserve user-entered weight/reps values even when server errors cause optimistic updates to revert. Users never lose their entered data.

---

## Low Severity

### BUG #4: DOM nesting warning - paragraph inside paragraph

**Status:** Fixed (2026-01-19)

**Steps to reproduce:**
1. Click the "Skip" button on the workout page

**Expected behavior:** No console warnings, valid HTML structure

**Actual behavior:** React warning in console: "validateDOMNesting(...): `<p>` cannot appear as a descendant of `<p>`" when skip workout dialog opens

**Technical detail:** The skip workout dialog contains a `<p>` element that itself contains another `<p>` element, which is invalid HTML

**Impact:** Cosmetic/code quality issue, doesn't affect functionality but violates HTML specs

**Fix:** Removed AlertDialog.Description wrapper (which renders as `<p>`) and used Text component with `as="p"` directly in WorkoutView.tsx. Applied to both skip and complete workout dialogs.

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
