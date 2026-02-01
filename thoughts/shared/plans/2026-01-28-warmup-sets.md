# Warm-Up Sets Feature Plan

## Overview

Add 2 automatic warm-up sets as a visual reminder before each exercise's working sets. Warm-up sets are **computed on-the-fly** in the API response — no database changes. They show suggested weights at 40% and 60% of the working weight, are non-interactive (can't be logged/skipped), and don't count toward completion stats.

## Current State Analysis

- **WorkoutSet** has no concept of set types (`database.ts:154`). All sets are working sets.
- **Workout generation** in `mesocycle.service.ts:299-404` creates only working sets during `generateWorkoutsBatched()`.
- **API response assembly** in `workout.service.ts:448-523` (`buildWorkoutWithExercises`) groups sets by exercise and returns `WorkoutExercise` objects containing a `sets: WorkoutSet[]` array.
- **iOS WorkoutView** (`WorkoutView.swift:778-791`) renders sets in a `ForEach` loop with log/skip/unlog actions per set.
- **Completion stats** count all sets equally (`workout.service.ts:504-506`, `WorkoutView.swift:830-832`).

## Desired End State

- Every exercise in a workout response includes a `warmup_sets` array with 2 computed warm-up entries.
- Warm-up set 1: 40% of working weight, same target reps.
- Warm-up set 2: 60% of working weight, same target reps.
- iOS UI renders warm-up sets above working sets with distinct visual styling (lighter, labeled "W").
- Warm-up sets have no action buttons (not loggable, not skippable).
- Completion percentage and set counts exclude warm-up sets entirely.
- Working set numbering remains unchanged (1, 2, 3...).

## What We're NOT Doing

- **No database schema changes** — warm-ups are computed, not persisted.
- **No warm-up set logging** — they're visual reminders only.
- **No per-exercise configuration** — all exercises get 2 warm-ups.
- **No warm-up progression** — percentages are static (40%/60%).
- **No deload week exemption** — warm-ups appear on deload weeks too (weight is still relative to that week's working weight).

## Key Discoveries

| Finding | Location |
|---------|----------|
| `WorkoutExercise` type has `sets`, `total_sets`, `completed_sets` | `database.ts:191-197` |
| API builds exercises in `buildWorkoutWithExercises` | `workout.service.ts:448-523` |
| iOS `WorkoutSet` model has no `setType` field | `Workout.swift:131-175` |
| iOS `ExerciseCard` shows set count badge as `completed/total` | `WorkoutView.swift:753-756` |
| iOS `SetRow` renders action button based on set status | `WorkoutView.swift:963-993` |
| Weight rounding utility exists in `ProgressionService` | `progression.service.ts:200-202` |

## Implementation Approach

Add a **separate `warmup_sets` array** to the API response rather than mixing warm-ups into the existing `sets` array. This keeps all existing working set logic untouched.

---

## Phase 1: Backend — Types & Computation

### Changes Required

**`packages/functions/src/types/database.ts`**
- Add `WarmupSet` interface:
  ```typescript
  export interface WarmupSet {
    warmup_number: number;    // 1 or 2
    target_weight: number;    // 40% or 60% of working weight
    target_reps: number;      // Same as working set target reps
  }
  ```
- Add `warmup_sets: WarmupSet[]` to `WorkoutExercise` interface.

**`packages/functions/src/services/workout.service.ts`**
- Add private helper `calculateWarmupSets(workingWeight: number, targetReps: number): WarmupSet[]`:
  - Returns 2 warm-up sets at 40% and 60% of working weight.
  - Round weight to nearest 2.5 lbs (same rounding as `ProgressionService`).
  - If working weight is very low (e.g., ≤ 20 lbs), skip warm-ups for that exercise (return empty array).
- In `buildWorkoutWithExercises()`, when building each exercise, call `calculateWarmupSets` using the first working set's `target_weight` and `target_reps`, then include the result in the response.

### Success Criteria
- `GET /api/workouts/:id` response includes `warmup_sets` array on each exercise.
- Warm-up weights are correctly computed (40%/60%, rounded to 2.5).
- Exercises with very low working weight return empty `warmup_sets`.
- Existing `sets`, `total_sets`, `completed_sets` fields are **unchanged**.

### Confirmation Gate
Run `npm run typecheck && npm test` — all pass, no regressions.

---

## Phase 2: Backend — Unit Tests

### Changes Required

**`packages/functions/src/services/workout.service.test.ts`**
- Add test cases for `calculateWarmupSets` (may need to make it testable — either test through `getById` or extract as a static/exported function):
  - `should return 2 warmup sets at 40% and 60% of working weight`
  - `should round warmup weights to nearest 2.5 lbs`
  - `should return empty array when working weight <= 20 lbs`
  - `should use target reps from working set`
- Add test for `buildWorkoutWithExercises` verifying `warmup_sets` is present on each exercise.
- Verify `total_sets` and `completed_sets` exclude warm-up sets.

### Success Criteria
- All new tests pass.
- Existing tests still pass (no regressions).

### Confirmation Gate
Run `npm run typecheck && npm run lint && npm test` — all pass.

---

## Phase 3: iOS — Model Updates

### Changes Required

**`ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Workout.swift`**
- Add `WarmupSet` struct:
  ```swift
  public struct WarmupSet: Identifiable, Codable, Hashable, Sendable {
      public var id: String { "\(warmupNumber)" }
      public let warmupNumber: Int
      public let targetReps: Int
      public let targetWeight: Double

      public enum CodingKeys: String, CodingKey {
          case warmupNumber = "warmup_number"
          case targetReps = "target_reps"
          case targetWeight = "target_weight"
      }
  }
  ```
- Add `warmupSets: [WarmupSet]?` to `WorkoutExercise` with coding key `warmup_sets`.
- Update `WorkoutExercise.init` to include `warmupSets` parameter.
- Update mock data to include sample warm-up sets.

### Success Criteria
- Swift model compiles and decodes `warmup_sets` from API response.
- Existing mock data still works.

### Confirmation Gate
Xcode build succeeds with no errors.

---

## Phase 4: iOS — UI Rendering

### Changes Required

**`ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift`** — `ExerciseCard`
- After the header row labels ("Set / Weight / Reps / Action"), render warm-up sets section:
  - Only show if `exercise.warmupSets` is non-empty.
  - Each warm-up row:
    - Circle shows "W" instead of a number, with a distinct muted color.
    - Weight field shows the warm-up target weight (non-editable, plain text).
    - Reps field shows the target reps (non-editable, plain text).
    - No action button column (empty space).
    - Reduced opacity (~0.6) to visually differentiate from working sets.
  - A subtle divider separates warm-ups from working sets.
- The set count badge (`completed/total`) continues to exclude warm-ups (no changes needed — `total_sets` already excludes them from the API).

### Success Criteria
- Warm-up sets display above working sets with distinct styling.
- Warm-up sets are non-interactive (no tap targets, no editing).
- Working set numbering unchanged (1, 2, 3...).
- Completion badge unaffected.
- Looks correct on both pending and in-progress workout states.

### Confirmation Gate
Visual verification in iOS Simulator using `/explore-ios`.

---

## Testing Strategy

### Automated
- **TypeScript typecheck**: `npm run typecheck`
- **ESLint**: `npm run lint`
- **Unit tests**: `npm test` — new tests for warm-up calculation, existing tests pass
- **Xcode build**: `xcodebuild` for iOS

### Manual
- Start a mesocycle, open a workout — verify warm-up sets appear
- Check warm-up weights are correct (40%/60% of working weight)
- Verify warm-up rows are non-interactive
- Check deload week still shows warm-ups
- Verify completion stats exclude warm-ups
- Test edge case: very light exercise (≤ 20 lbs working weight) — no warm-ups shown

## References

- `packages/functions/src/services/workout.service.ts:448-523` — `buildWorkoutWithExercises`
- `packages/functions/src/types/database.ts:191-197` — `WorkoutExercise` type
- `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Workout.swift:78-121` — Swift `WorkoutExercise`
- `ios/BradOS/BradOS/Views/Lifting/WorkoutView.swift:724-849` — `ExerciseCard` view
- `packages/functions/src/services/progression.service.ts:200-202` — Weight rounding
