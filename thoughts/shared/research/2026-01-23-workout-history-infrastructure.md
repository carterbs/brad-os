# Research: Existing Infrastructure for Workout History & Analytics

**Date**: 2026-01-23
**Topic**: What already exists in the codebase that could power a workout history feature

---

## Summary

The data model already stores everything needed for workout history. Every set logged (target weight/reps, actual weight/reps, status, timestamps) is persisted in the database. The gap is entirely on the **query and display side** — there are no endpoints for historical aggregation, no per-exercise history queries, and the frontend has no pages for reviewing past performance.

---

## 1. Database Schema — What's Already Stored

### Core Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `exercises` | id, name, weight_increment | Exercise definitions |
| `mesocycles` | id, plan_id, start_date, current_week, status | Lifecycle: pending → active → completed/cancelled |
| `workouts` | id, mesocycle_id, plan_day_id, week_number, scheduled_date, status, started_at, completed_at | Every scheduled workout instance |
| `workout_sets` | id, workout_id, exercise_id, set_number, target_reps, target_weight, actual_reps, actual_weight, status | Individual set performance data |

### Key Relationships

```
exercises ←── workout_sets ──→ workouts ──→ mesocycles ──→ plans
                                  ↓
                              plan_days ──→ plan_day_exercises
```

### What This Means for History

Every completed set has:
- **What was prescribed**: `target_weight`, `target_reps`
- **What actually happened**: `actual_weight`, `actual_reps`
- **When**: Via `workout.completed_at` and `workout.scheduled_date`
- **Context**: Which exercise, which mesocycle, which week, which plan day

This is sufficient to build: exercise progression charts, PR tracking, volume calculations, calendar views, and weekly summaries.

### Existing Indexes

- `workouts`: indexed on `mesocycle_id`, `status`, `scheduled_date`
- `workout_sets`: indexed on `workout_id`, `exercise_id`, `status`
- Unique constraint on `(workout_id, exercise_id, set_number)`

**Gap**: No index optimized for cross-mesocycle exercise history queries (e.g., "all sets for exercise X across all time").

---

## 2. Existing API Endpoints

### Workout Endpoints (`/api/workouts`)

| Method | Path | Returns | History-Relevant? |
|--------|------|---------|-------------------|
| GET | `/today` | Next upcoming pending/in_progress workout | No — forward-looking |
| GET | `/` | All workouts ordered by scheduled_date DESC | **Partial** — returns all workouts but no set/exercise details |
| GET | `/:id` | Single workout with full exercises and sets | **Yes** — full detail for one workout |

### Mesocycle Endpoints (`/api/mesocycles`)

| Method | Path | Returns | History-Relevant? |
|--------|------|---------|-------------------|
| GET | `/` | All mesocycles (any status) | **Partial** — list only, no week/workout details |
| GET | `/active` | Active mesocycle with week summaries | Current only |
| GET | `/:id` | Any mesocycle with full week summaries | **Yes** — can view completed mesocycles |

### What's Missing

- **Per-exercise history** — No endpoint for "all sets of Bench Press across all mesocycles"
- **Aggregations** — No endpoint for volume totals, PR calculations, or trend data
- **Date-range queries** — No way to fetch workouts/sets within a date range
- **Cross-mesocycle views** — No way to see progression across multiple mesocycles

---

## 3. Existing Service Layer — Historical Data Usage

The system already has sophisticated historical data retrieval, but it's used exclusively for **progressive overload calculations**, not user-facing history.

### WorkoutService Historical Methods

| Method | Location | What It Does |
|--------|----------|-------------|
| `getPreviousWeekPerformance()` | `workout.service.ts:126-215` | Gets previous week's actual performance per exercise |
| `getPerformanceHistory()` | `workout.service.ts:221-311` | Gets up to 5 weeks of performance history |
| `calculateDynamicTargets()` | `workout.service.ts:316-354` | Uses history to calculate next workout targets |

### How Historical Data Is Already Aggregated

The `getPerformanceHistory()` method already:
1. Iterates backward through weeks
2. Fetches workout sets for each week
3. Filters to completed sets only
4. Groups by exercise_id
5. Finds the "best set" per exercise (highest weight, then highest reps)
6. Builds `PreviousWeekPerformance` objects

This pattern could be extended for user-facing history, but currently:
- Limited to 5 weeks back
- Scoped to single mesocycle only
- Returns only "best set" not all sets
- Not exposed via any API endpoint

### DynamicProgressionService

Located at `dynamic-progression.service.ts`. Already calculates:
- Whether user hit target reps
- Consecutive failure counts at same weight
- Progression decisions (hold, progress, regress, deload)

This data is relevant for "why did my weight change?" context in history views.

---

## 4. Frontend — Current State

### Pages and Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | TodayPage | Shows next upcoming workout |
| `/meso` | MesoPage (in App.tsx) | Shows active mesocycle weeks |
| `/workouts/:id` | WorkoutPage | Shows any single workout |
| `/plans` | PlansPage | Plan management |
| `/exercises` | ExerciseLibraryPage | Exercise library |
| `/settings` | SettingsPage | Notifications config |

### How History Is Currently Accessible

1. **MesoPage** shows workout summaries per week (set counts, status badges)
2. Clicking a workout navigates to **WorkoutPage** which shows full detail
3. Completed mesocycles show as summary cards (plan name + date only)
4. **No dedicated history page exists**

### Existing React Query Hooks

| Hook | Key | Endpoint |
|------|-----|----------|
| `useTodaysWorkout()` | `['workouts', 'today']` | `/api/workouts/today` |
| `useWorkout(id)` | `['workouts', 'detail', id]` | `/api/workouts/:id` |
| `useActiveMesocycle()` | `['mesocycles', 'active']` | `/api/mesocycles/active` |
| `useMesocycles()` | `['mesocycles', 'list']` | `/api/mesocycles` |
| `useMesocycle(id)` | `['mesocycles', 'detail', id]` | `/api/mesocycles/:id` |
| `useExercises()` | `['exercises', 'list']` | `/api/exercises` |

### What's Missing on Frontend

- No `useWorkoutHistory()` hook for paginated/filtered workout lists
- No `useExerciseHistory(exerciseId)` hook for per-exercise data
- No history/analytics page component
- No chart/graph components
- No PR display components
- No calendar view component

---

## 5. Data Access Patterns

### ORM/Query Builder

**None** — the app uses raw SQL via `better-sqlite3` with a thin repository abstraction.

- `BaseRepository` abstract class provides CRUD pattern
- All queries are hand-written SQL strings with `?` parameter binding
- Repositories return typed objects via row-mapping functions
- No query builder, no ORM — just SQL

### Repository Pattern

```typescript
// Example from workout.repository.ts
findByMesocycleId(mesocycleId: number): Workout[] {
  const rows = this.db.prepare(
    'SELECT * FROM workouts WHERE mesocycle_id = ? ORDER BY scheduled_date'
  ).all(mesocycleId) as WorkoutRow[];
  return rows.map(this.rowToWorkout);
}
```

### Implications for History Feature

- New queries can be added freely to repositories
- Cross-table queries would need explicit JOINs
- SQLite supports window functions, CTEs, and aggregates for analytics queries
- No migration needed for basic history — schema already has the data
- May want new indexes for efficient cross-mesocycle exercise queries

---

## 6. Shared Types — What Already Exists

### Types That Would Be Reused

From `packages/shared/src/types/database.ts`:

- `Workout` — base workout entity
- `WorkoutSet` — individual set with target/actual data
- `WorkoutWithSets` — workout with sets array
- `WorkoutExercise` — exercise info within a workout
- `WorkoutSummary` — lightweight workout summary (set counts, status)
- `WeekSummary` — week-level aggregation
- `MesocycleWithDetails` — full mesocycle with weeks

From `packages/shared/src/types/progression.ts`:

- `PreviousWeekPerformance` — historical set performance (weight, reps, hit target, failures)
- `WeekTargets` — calculated targets for a week

### Types That Would Need to Be Created

For workout history, new types would be needed for:
- Exercise history response (exercise + array of historical sets across time)
- Personal records (exercise + best performance per rep count)
- Volume aggregation (date range + total tonnage)
- Calendar data (date + workout indicator)
- Weekly/monthly summaries

---

## 7. Key Architectural Observations

### Strengths for History Implementation

1. **Data already stored** — No new data collection needed
2. **Repository pattern** — Easy to add new query methods
3. **React Query infrastructure** — Established pattern for data fetching hooks
4. **Shared types package** — Clear place for new type definitions
5. **Three-layer architecture** — Clean separation of concerns (routes → services → repositories)
6. **SQLite with WAL** — Reads don't block writes, good for analytics queries

### Challenges

1. **No JOINs in repository layer** — Current pattern does multiple queries and joins in service layer. For history aggregation, JOIN-heavy queries would be more efficient
2. **No pagination** — `PaginatedResponse<T>` type exists in shared but no endpoint uses it
3. **Raw SQL** — No query builder means more verbose code for complex aggregations
4. **In-memory joins** — The `getPerformanceHistory()` pattern of looping + individual queries is O(N) database calls per week of history. Would not scale for full history
5. **No caching layer** — PR calculations and volume aggregations are expensive if recalculated on every request

### Patterns to Follow

- New endpoints should follow RESTful conventions from existing routes
- Validation with Zod schemas in shared package
- React Query hooks with query key factories
- Repository methods for raw data, services for business logic composition

---

## 8. Specific Data Available for Each Feature Gap Sub-Item

### Workout History Page
- **Data available**: `workouts` table has `scheduled_date`, `completed_at`, `status`
- **Queryable by**: date range, mesocycle, status
- **Detail available**: Full set data via `workout_sets` table

### Exercise History (per-exercise progression)
- **Data available**: `workout_sets` has `exercise_id`, `actual_weight`, `actual_reps` per set
- **Linked to time**: Via `workout.completed_at` or `workout.scheduled_date`
- **Gap**: No index on `(exercise_id, workout_id)` for efficient cross-workout queries (though `exercise_id` alone is indexed)

### Personal Records
- **Data available**: All completed sets with actual weight/reps stored
- **Calculation**: MAX(actual_weight) WHERE actual_reps >= N, grouped by exercise
- **Gap**: Not pre-calculated — would need aggregation query or materialized view

### Volume Charts
- **Data available**: `actual_weight * actual_reps` per set, groupable by date
- **Gap**: No pre-aggregated volume table

### Estimated 1RM
- **Data available**: Any set's weight + reps can feed Brzycki/Epley formula
- **Calculation**: `weight * (36 / (37 - reps))` (Brzycki) or `weight * (1 + reps/30)` (Epley)
- **Gap**: No pre-calculated field

### Calendar View
- **Data available**: `workouts.scheduled_date` and `workouts.status`
- **Query**: Simple GROUP BY on scheduled_date

### Weekly/Monthly Summaries
- **Data available**: All set/workout data with dates
- **Calculation**: Aggregation queries grouping by week/month
