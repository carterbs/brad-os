# Plan: Exercise History with Charts

**Date**: 2026-01-23
**Feature**: Per-exercise history view showing weight/rep progression over time as charts

---

## Overview

Add a per-exercise history feature that shows how each exercise has progressed across all workouts and mesocycles. The primary interface is a chart showing weight over time, with supporting data (all sets, personal records). Accessible from the exercise library via a "History" action on each exercise.

---

## Current State Analysis

**What exists:**
- All set data stored: `workout_sets` has `exercise_id`, `actual_weight`, `actual_reps`, linked to `workouts` with `completed_at` dates (`packages/server/src/db/migrations/007_create_workout_sets.ts:10-23`)
- Index on `exercise_id` already exists (`007_create_workout_sets.ts:26`)
- Repository pattern with raw SQL (`packages/server/src/repositories/workout-set.repository.ts`)
- React Query hooks with query key factories (`packages/client/src/hooks/useExercises.ts`)
- Exercise library page with per-exercise actions (`packages/client/src/pages/ExerciseLibraryPage.tsx`)

**What's missing:**
- No chart library installed
- No API endpoint for per-exercise history across workouts/mesocycles
- No frontend route or page for exercise history
- No composite index for efficient cross-workout exercise queries with date ordering

---

## Desired End State

- User navigates to Exercise Library → clicks "History" on any exercise
- New page `/exercises/:id/history` shows:
  - Exercise name as header
  - **Weight progression chart** (line chart: X = date, Y = best weight used that session)
  - **Set history table** below the chart (date, weight, reps, set count — most recent first)
  - **Personal record** highlight (heaviest weight lifted, with date)
- Data spans all mesocycles, not just the current one
- Chart renders with Recharts (lightweight, React-native, well-maintained)

---

## What We're NOT Doing

- Volume (tonnage) charts — future enhancement
- Rep progression charts — future enhancement (weight chart only for now)
- Estimated 1RM calculations — future enhancement
- Calendar view — separate feature
- Pagination of set history — not needed yet (SQLite handles full history efficiently for single-user)
- Pre-calculated/cached aggregations — premature for single-user app

---

## Implementation Approach

**TDD throughout**: Each phase writes tests first, then implementation to make them pass. No separate "tests phase" at the end.

**Parallelization**: After Phase 1 (shared types), the backend and frontend tracks are independent and can be implemented simultaneously.

```
Phase 1 (Types)
  ├─→ BACKEND TRACK:  Phase 2 (Repo) → Phase 3 (Service) → Phase 4 (API)
  │
  └─→ FRONTEND TRACK: Phase 5 (Recharts) + Phase 6 (Hook) → Phase 7 (Page/Chart) → Phase 8 (Routing)
```

The frontend track uses MSW mocks for testing — it does not depend on the backend endpoints existing. Phase 5 (Recharts install) has no dependencies and can run alongside anything.

**Final gate**: After both tracks complete, run `npm run validate` to confirm full integration.

---

## Phase 1: Shared Types

**Overview**: Define the API response types for exercise history.

**Changes:**

`packages/shared/src/types/database.ts` — Add new types:

```typescript
/** A single historical data point for an exercise (one workout session) */
export interface ExerciseHistoryEntry {
  workout_id: number;
  date: string;              // workout.completed_at or scheduled_date
  week_number: number;
  mesocycle_id: number;
  sets: Array<{
    set_number: number;
    weight: number;
    reps: number;
  }>;
  best_weight: number;       // max weight across sets in this session
  best_set_reps: number;     // reps achieved at best_weight
}

/** Full exercise history response */
export interface ExerciseHistory {
  exercise_id: number;
  exercise_name: string;
  entries: ExerciseHistoryEntry[];  // ordered by date ascending
  personal_record: {
    weight: number;
    reps: number;
    date: string;
  } | null;
}
```

**Success Criteria:**
- Types compile without errors
- Types are exported from shared package index

---

## Phase 2: Database Query & Repository

**Overview**: Add a repository method that efficiently fetches all completed sets for a given exercise across all workouts, joined with workout dates.

**Tests first** — `packages/server/src/repositories/__tests__/workout-set.repository.test.ts`:

- Returns only completed sets from completed workouts
- Excludes sets with null actual_weight or actual_reps
- Excludes sets from skipped/pending workouts
- Returns results ordered by date ascending, then set_number
- Returns empty array for exercise with no history
- Includes workout metadata (week_number, mesocycle_id, dates)

**Implementation:**

`packages/server/src/repositories/workout-set.repository.ts` — Add method:

```typescript
findCompletedByExerciseId(exerciseId: number): Array<{
  workout_id: number;
  exercise_id: number;
  set_number: number;
  actual_weight: number;
  actual_reps: number;
  scheduled_date: string;
  completed_at: string | null;
  week_number: number;
  mesocycle_id: number;
}> {
  const stmt = this.db.prepare(`
    SELECT
      ws.workout_id,
      ws.exercise_id,
      ws.set_number,
      ws.actual_weight,
      ws.actual_reps,
      w.scheduled_date,
      w.completed_at,
      w.week_number,
      w.mesocycle_id
    FROM workout_sets ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = ?
      AND ws.status = 'completed'
      AND ws.actual_weight IS NOT NULL
      AND ws.actual_reps IS NOT NULL
      AND w.status = 'completed'
    ORDER BY w.completed_at ASC, w.scheduled_date ASC, ws.set_number ASC
  `);
  return stmt.all(exerciseId) as [...];
}
```

**Note**: This introduces the first SQL JOIN in the repository layer. This is acceptable here because the alternative (N+1 queries in the service layer) would be inefficient for potentially hundreds of historical sets.

**Success Criteria:**
- All repository tests pass
- Query runs efficiently with existing `exercise_id` index

---

## Phase 3: Service Layer

**Overview**: Add an `ExerciseHistoryService` that transforms raw set data into the `ExerciseHistory` response shape.

**Tests first** — `packages/server/src/services/__tests__/exercise-history.service.test.ts`:

- Returns null for non-existent exercise (exerciseRepo returns null)
- Returns empty entries array for exercise with no completed sets
- Groups sets by workout_id into separate entries
- Calculates best_weight per session (highest weight across sets)
- Sets best_set_reps to the reps achieved at best_weight
- Identifies overall personal record (highest weight across all sessions)
- PR uses the earliest date when weight ties exist
- Entries are ordered by date ascending
- Uses completed_at when available, falls back to scheduled_date

**Implementation:**

`packages/server/src/services/exercise-history.service.ts` — New file:

```typescript
export class ExerciseHistoryService {
  constructor(
    private workoutSetRepo: WorkoutSetRepository,
    private exerciseRepo: ExerciseRepository
  ) {}

  getHistory(exerciseId: number): ExerciseHistory | null {
    // 1. Verify exercise exists
    // 2. Call findCompletedByExerciseId
    // 3. Group rows by workout_id into ExerciseHistoryEntry[]
    // 4. Calculate best_weight per entry and overall PR
    // 5. Return ExerciseHistory
  }
}
```

**Success Criteria:**
- All service tests pass
- Correctly handles edge cases (single set, single session, many mesocycles)

---

## Phase 4: API Endpoint

**Overview**: Add `GET /api/exercises/:id/history` endpoint.

**Tests first** — Add to `packages/server/src/routes/__tests__/exercise.routes.test.ts`:

- GET `/api/exercises/:id/history` returns 200 with ExerciseHistory shape
- Returns 404 for non-existent exercise ID
- Returns 404 for non-numeric ID
- Returns `{ entries: [], personal_record: null }` for exercise with no sets

**Implementation:**

`packages/server/src/routes/exercise.routes.ts` — Add route:

```typescript
// GET /api/exercises/:id/history - Get exercise performance history
exerciseRouter.get('/:id/history', (req, res, next) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) throw new NotFoundError('Exercise', req.params['id'] ?? 'unknown');

  const history = getExerciseHistoryService().getHistory(id);
  if (!history) throw new NotFoundError('Exercise', id);

  const response: ApiResponse<ExerciseHistory> = { success: true, data: history };
  res.json(response);
});
```

**Success Criteria:**
- All route tests pass
- Endpoint integrates cleanly with existing exercise routes

---

## Phase 5: Install Recharts

**Overview**: Add Recharts as a client dependency for rendering charts.

**Changes:**

```bash
cd packages/client && npm install recharts
```

**Why Recharts**: React-native components (no imperative API), lightweight (~45KB gzipped), built on D3 scales, good TypeScript support, widely used.

**Success Criteria:**
- Package installs without peer dependency conflicts
- TypeScript recognizes Recharts component types

---

## Phase 6: Client API & Hook

**Overview**: Add API client function and React Query hook for exercise history.

**Tests first** — `packages/client/src/hooks/__tests__/useExercises.test.ts` (add to existing):

- `useExerciseHistory` returns loading state initially
- `useExerciseHistory` returns data on success (mock MSW handler)
- `useExerciseHistory` does not fetch when id <= 0
- `useExerciseHistory` returns error state on API failure

**Implementation:**

`packages/client/src/api/exerciseApi.ts` — Add:

```typescript
getExerciseHistory: async (id: number): Promise<ExerciseHistory> => {
  const response = await fetch(`${API_BASE}/exercises/${id}/history`);
  return handleResponse<ExerciseHistory>(response);
},
```

`packages/client/src/hooks/useExercises.ts` — Add:

```typescript
export function useExerciseHistory(id: number): UseQueryResult<ExerciseHistory, ApiClientError> {
  return useQuery({
    queryKey: exerciseKeys.history(id),
    queryFn: () => exerciseApi.getExerciseHistory(id),
    enabled: id > 0,
  });
}
```

Update `exerciseKeys` factory to include `history: (id: number) => [...exerciseKeys.detail(id), 'history']`.

**Success Criteria:**
- All hook tests pass
- Query key includes exercise ID for proper caching

---

## Phase 7: Exercise History Page & Chart Component

**Overview**: Build the history page with a Recharts line chart and set history table.

**Tests first:**

`packages/client/src/pages/__tests__/ExerciseHistoryPage.test.tsx`:
- Shows loading spinner while fetching
- Shows error message on fetch failure
- Shows "No history yet" when entries array is empty
- Renders exercise name as heading
- Renders chart component when data has entries
- Renders set history table when data has entries
- Displays personal record when present

`packages/client/src/components/ExerciseHistory/__tests__/WeightProgressionChart.test.tsx`:
- Renders without crashing with valid data
- Renders with single data point (no line, just dot)

**Implementation:**

`packages/client/src/pages/ExerciseHistoryPage.tsx` — New page:

```typescript
export function ExerciseHistoryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const exerciseId = parseInt(id ?? '', 10);
  const { data: history, isLoading, error } = useExerciseHistory(exerciseId);

  // Render: back link, exercise name, chart, PR highlight, set table
}
```

`packages/client/src/components/ExerciseHistory/WeightProgressionChart.tsx` — Chart component:

```typescript
// Recharts LineChart with:
// - X axis: date (formatted short)
// - Y axis: weight (lbs)
// - Line: best_weight per session
// - Tooltip: date + weight + reps
// - ResponsiveContainer for mobile-friendly sizing
```

`packages/client/src/components/ExerciseHistory/SetHistoryTable.tsx` — Table component:

```typescript
// Simple table showing: Date | Weight | Reps | Sets
// Ordered most recent first
// Groups by workout session
```

**Success Criteria:**
- All component tests pass
- Chart is responsive (works on mobile width)
- Loading, error, and empty states all covered by tests

---

## Phase 8: Routing & Navigation

**Overview**: Wire up the new page in the router and add navigation from exercise library.

**Changes:**

`packages/client/src/components/App.tsx` — Add route:

```typescript
<Route path="/exercises/:id/history" element={<ExerciseHistoryPage />} />
```

`packages/client/src/components/ExerciseLibrary/ExerciseListItem.tsx` — Add "History" button/link that navigates to `/exercises/${exercise.id}/history`.

**Success Criteria:**
- Route loads ExerciseHistoryPage
- Exercise library items show history link
- Navigation works both directions (library → history → back)

---

## Testing Strategy

Tests are written **before** implementation in each phase (TDD). Each phase's success gate includes its tests passing.

**Approach per layer:**
- Repository: in-memory SQLite database with seed data, verify query results
- Service: mock repository, verify grouping/aggregation logic
- Routes: supertest with mocked service, verify HTTP response shapes
- Hooks: MSW handlers for API mocking, React Testing Library
- Components: mock hook return values, verify render states

**Final gate:** `npm run validate` passes with all new tests included.

**Manual Verification (after all phases):**
- Log sets across multiple workouts → view history chart
- Verify chart shows correct weight progression
- Verify PR is correctly identified
- Test with exercise that has no history (empty state)

---

## References

- Research: `thoughts/shared/research/2026-01-23-workout-history-infrastructure.md`
- Existing repository pattern: `packages/server/src/repositories/workout-set.repository.ts:72-78`
- Existing service pattern: `packages/server/src/services/workout.service.ts:221-311`
- Existing hook pattern: `packages/client/src/hooks/useExercises.ts:26-32`
- Existing page pattern: `packages/client/src/pages/ExerciseLibraryPage.tsx:11-39`
- Router: `packages/client/src/components/App.tsx:126-136`
