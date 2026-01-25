# Plan: Calendar View with Activity Dots

**Date**: 2026-01-24
**Feature**: Month-view calendar showing workout and stretch history with Apple Fitness-style colored dots

---

## Overview

Add a calendar tab showing a month view where days with completed activities display colored dots below the date number. Tapping a day opens a dialog listing that day's activities; tapping an activity navigates to its detail view.

**Colors**: Indigo (workouts), Teal (stretching), Purple (future meditation)

---

## Current State Analysis

**What exists:**
- Workouts have `scheduled_date` (YYYY-MM-DD), `status`, `completed_at` timestamp (`packages/server/src/db/migrations/006_create_workouts.ts:10-22`)
- Stretch sessions have `completed_at` timestamp (`packages/server/src/db/migrations/009_create_stretch_sessions.ts:10-17`)
- `GET /api/workouts` returns all workouts (`workout.routes.ts:64-80`)
- `GET /api/stretch-sessions` returns all sessions (`stretchSession.routes.ts:57-66`)
- Multi-repo service aggregation pattern exists (`mesocycle.service.ts:31-48`)
- Bottom nav has 6 tabs (`BottomNav.tsx:10-41`)
- Dialog pattern with controlled state (`DeletePlanDialog.tsx`)

**What's missing:**
- No date range queries in repositories
- No unified calendar data endpoint
- No calendar UI components
- No calendar route or nav tab

---

## Desired End State

- User taps "Calendar" tab in bottom nav
- Sees current month with navigation arrows for prev/next month
- Days with completed workouts show indigo dot
- Days with completed stretches show teal dot
- Days with both show both dots side-by-side
- Tapping a day with activities opens dialog listing them
- Tapping a workout navigates to `/workouts/:id`
- Tapping a stretch shows summary in dialog (no detail page exists yet)

---

## Key Decisions

### Use react-calendar library (not custom)

Dates are hard. A custom grid looks simple but requires handling:
- First day of month offset calculation
- Variable days per month (28/29/30/31)
- Leap year logic
- Year boundary navigation (Dec → Jan)
- Timezone edge cases when comparing dates
- Accessibility (keyboard nav, ARIA, screen readers)

`react-calendar` (1.2M weekly downloads, ~12KB gzipped) handles all of this. The `tileContent` prop allows injecting custom dot indicators. Same rationale as using Recharts for charts.

### Single API endpoint per month

`GET /api/calendar/:year/:month` returns all activities for that month. Client fetches one month at a time with 5-minute stale time. Simpler than date range queries and matches navigation pattern.

### Unified activity type

Create a `CalendarActivity` type that normalizes workout and stretch data into a common shape. This makes adding meditation trivial later - just add another case to the union.

### Dialog for day details (not sheet)

App uses centered dialogs throughout. Keep consistent rather than introducing slide-up sheets.

---

## What We're NOT Doing

- Stretch session detail page (doesn't exist, out of scope)
- Meditation integration (no data yet, but types will support it)
- Activity statistics/summaries on calendar page
- Week view or day view (month only)
- Prefetching adjacent months (premature optimization)

---

## Implementation Approach

**TDD throughout**: Each phase writes tests first, then implementation.

**Parallelization**: After Phase 1 (shared types), backend and frontend tracks are independent.

```
Phase 1 (Types)
     │
     ├──→ BACKEND TRACK:  Phase 2 (Repo) → Phase 3 (Service) → Phase 4 (Route)
     │
     └──→ FRONTEND TRACK: Phase 5 (Hook) ──┬──→ Phase 7 (Components) → Phase 8 (Page)
                                           │
Phase 6 (npm install react-calendar) ──────┘
```

- Frontend uses MSW mocks for API - doesn't need backend to exist
- Phase 6 has no dependencies - can run anytime
- Final integration after both tracks complete

**Confirmation gates**: Run `npm run validate` after each phase before proceeding.

---

## Implementation Phases

### Phase 1: Shared Types (BLOCKING)

Add `packages/shared/src/types/calendar.ts`:
- `ActivityType` union: `'workout' | 'stretch' | 'meditation'`
- `CalendarActivity` interface with id, type, date, completedAt, summary
- `WorkoutActivitySummary` and `StretchActivitySummary` types
- `CalendarDayData` grouping activities by date

Export from shared index.

**Success**: Types compile, exported from `@brad-os/shared`

---

### Phase 2: Repository Date Range Queries (BACKEND)

Add to `workout.repository.ts`:
- `findCompletedInDateRange(startDate: string, endDate: string)` - returns completed workouts in range

Add to `stretchSession.repository.ts`:
- `findInDateRange(startDate: string, endDate: string)` - returns sessions where completedAt falls in range

**Success**: Repository tests pass, queries return correct data for date ranges

---

### Phase 3: Calendar Service (BACKEND)

Create `packages/server/src/services/calendar.service.ts`:
- Constructor takes `Database`, instantiates workout + stretch repos (follow `mesocycle.service.ts` pattern)
- `getMonthData(year, month)` method:
  - Calculate start/end dates for month
  - Query both repos
  - Transform to `CalendarActivity[]`
  - Group by date
  - Return `CalendarDayData[]`

Register in service index with getter function.

**Success**: Service tests pass, correctly aggregates and groups data

---

### Phase 4: API Route (BACKEND)

Create `packages/server/src/routes/calendar.routes.ts`:
- `GET /api/calendar/:year/:month`
- Validate year/month params
- Call calendar service
- Return wrapped in `ApiResponse`

Register in routes index.

**Success**: Route tests pass, endpoint returns expected shape

---

### Phase 5: Client Data Layer (FRONTEND)

Create `packages/client/src/api/calendarApi.ts`:
- `getMonthData(year, month)` async function

Create `packages/client/src/hooks/useCalendarData.ts`:
- Query key factory: `calendarKeys.month(year, month)`
- `useCalendarMonth(year, month)` hook with 5-min stale time

**Success**: Hook tests pass with MSW mocks

---

### Phase 6: Install react-calendar (FRONTEND - NO DEPS)

```bash
cd packages/client && npm install react-calendar
```

Add type definitions if needed.

**Success**: Package installs, types resolve

---

### Phase 7: UI Components (FRONTEND)

Create `packages/client/src/components/Calendar/`:

**MonthCalendar.tsx**:
- Wraps react-calendar
- Header with month/year
- Uses `tileContent` to render activity dots
- Handles month navigation via `onActiveStartDateChange`
- Calls `onDayClick` when day with activities is tapped

**DayDetailDialog.tsx**:
- Radix Dialog, controlled by `selectedDay` state
- Shows formatted date as title
- Lists ActivityItem components
- Close button

**ActivityItem.tsx**:
- Colored background based on type
- Badge showing "Workout" or "Stretch"
- Summary text (day name for workout, regions for stretch)
- Tappable, calls `onClick`

**Success**: Component tests pass, renders correctly for various states

---

### Phase 8: Page & Navigation (FRONTEND + INTEGRATION)

**CalendarPage.tsx**:
- State: year, month, selectedDay
- Uses `useCalendarMonth` hook
- Renders MonthCalendar
- Renders DayDetailDialog
- Handles activity click → navigate to workout or close dialog

**App.tsx**: Add route `/calendar`

**BottomNav.tsx**: Add Calendar tab with grid icon (position after Stretch, before Settings)

**Success**: E2E test passes - can navigate to calendar, see dots, tap day, tap activity

---

## Testing Strategy

**Unit tests** (TDD, each phase):
- Repository: in-memory SQLite, verify date range queries
- Service: mock repos, verify grouping logic
- Route: supertest, verify response shape
- Hook: MSW handlers, verify query behavior
- Components: mock hook, verify render states

**E2E test** (`e2e/tests/calendar.spec.ts`):
1. Complete a workout and stretch session
2. Navigate to Calendar tab
3. Verify dots appear on today's date
4. Tap the day → dialog opens
5. Verify both activities listed
6. Tap workout → navigates to workout page

**Manual verification**:
- Navigate between months at year boundary
- Verify correct dot colors
- Test on mobile viewport

---

## References

- Service aggregation pattern: `packages/server/src/services/mesocycle.service.ts:31-48`
- Repository pattern: `packages/server/src/repositories/workout.repository.ts:85-91`
- React Query hook pattern: `packages/client/src/hooks/useMesocycles.ts:18-50`
- Dialog pattern: `packages/client/src/components/Plans/DeletePlanDialog.tsx`
- Bottom nav: `packages/client/src/components/Navigation/BottomNav.tsx:10-41`
- Route registration: `packages/client/src/components/App.tsx:128-140`
