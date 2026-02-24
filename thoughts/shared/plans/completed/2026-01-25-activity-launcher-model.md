# Activity Launcher Model ("BradOS") Implementation Plan

## Overview

Restructure the app's navigation from a flat 8-item bottom nav to a hub-and-spoke "Activity Launcher" model. This transforms the app from a lifting-focused tool into a multi-activity lifestyle dashboard ("BradOS") that can scale to support lifting, stretching, meditation, cycling, fishing, and future activities.

## Current State Analysis

### Navigation Structure
- **Location**: `packages/client/src/components/Navigation/BottomNav.tsx:10-51`
- **Items**: 8 bottom nav items (Today, Meso, Plans, Exercises, Stretch, Calendar, Meditate, Settings)
- **Problem**: Exceeds the 5-item best practice limit; won't scale as activities are added

### Routing Structure
- **Location**: `packages/client/src/components/App.tsx:130-144`
- **Pattern**: Flat routing - all routes are siblings at top level
- **No nested routes**: No use of `<Outlet />` or layout routes

### Lifting Pages
| Route | Component | File |
|-------|-----------|------|
| `/` | TodayPage | `pages/TodayPage.tsx` |
| `/meso` | MesoPage | `components/App.tsx:39-124` (inline) |
| `/workouts/:id` | WorkoutPage | `pages/WorkoutPage.tsx` |
| `/plans` | PlansPage | `pages/PlansPage.tsx` |
| `/plans/new` | CreatePlanPage | `pages/CreatePlanPage.tsx` |
| `/plans/:id` | PlanDetailPage | `pages/PlanDetailPage.tsx` |
| `/plans/:id/edit` | EditPlanPage | `pages/EditPlanPage.tsx` |
| `/exercises` | ExerciseLibraryPage | `pages/ExerciseLibraryPage.tsx` |
| `/exercises/:id/history` | ExerciseHistoryPage | `pages/ExerciseHistoryPage.tsx` |

### Activity Pages
| Route | Component | File |
|-------|-----------|------|
| `/stretch` | StretchPage | `pages/StretchPage.tsx` |
| `/meditation` | MeditationPage | `pages/MeditationPage.tsx` |

### Cross-Cutting Pages
| Route | Component | File |
|-------|-----------|------|
| `/calendar` | CalendarPage | `pages/CalendarPage.tsx` |
| `/settings` | SettingsPage | `pages/SettingsPage.tsx` |

### Data Sources for Unified Views
- **Today's workout**: `useTodaysWorkout()` → `GET /api/workouts/today`
- **Calendar data**: `useCalendarMonth(year, month)` → `GET /api/calendar/{year}/{month}`
- **Latest stretch**: `useLatestStretchSession()` → `GET /api/stretch-sessions/latest`
- **Meditation history**: Available via calendar API

## Desired End State

### New Navigation Model

```
Global Bottom Nav (4 items):
┌────────────┬────────────┬────────────┬────────────┐
│   Today    │ Activities │  History   │  Profile   │
└────────────┴────────────┴────────────┴────────────┘

Activities Grid (Hub):
┌─────────┬─────────┬─────────┐
│ Lifting │ Stretch │ Meditate│
├─────────┼─────────┼─────────┤
│ Cycling │ Fishing │    +    │
└─────────┴─────────┴─────────┘

Inside Lifting (Spoke with own nav):
┌────────────┬────────────┬────────────┬────────────┐
│     ←      │    Meso    │   Plans    │ Exercises  │
│   (Back)   │            │            │            │
└────────────┴────────────┴────────────┴────────────┘
```

### New URL Structure

| Old Route | New Route | Notes |
|-----------|-----------|-------|
| `/` | `/` | New unified Today dashboard |
| — | `/activities` | New Activities hub page |
| `/meso` | `/lifting` | Lifting's "home" (current meso view) |
| `/plans` | `/lifting/plans` | Under lifting prefix |
| `/plans/new` | `/lifting/plans/new` | Under lifting prefix |
| `/plans/:id` | `/lifting/plans/:id` | Under lifting prefix |
| `/plans/:id/edit` | `/lifting/plans/:id/edit` | Under lifting prefix |
| `/exercises` | `/lifting/exercises` | Under lifting prefix |
| `/exercises/:id/history` | `/lifting/exercises/:id/history` | Under lifting prefix |
| `/workouts/:id` | `/lifting/workouts/:id` | Under lifting prefix |
| `/stretch` | `/stretch` | Stays at root (single-page activity) |
| `/meditation` | `/meditation` | Stays at root (single-page activity) |
| `/calendar` | `/history` | Renamed, enhanced with filters |
| `/settings` | `/profile` | Renamed, expanded scope |

### Component Architecture

```
App.tsx
├── GlobalLayout (with GlobalBottomNav)
│   ├── TodayPage (unified dashboard)
│   ├── ActivitiesPage (grid launcher)
│   ├── HistoryPage (calendar + timeline)
│   └── ProfilePage (settings + stats)
│
├── LiftingLayout (with LiftingBottomNav)
│   ├── LiftingHomePage (current MesoPage)
│   ├── PlansPage
│   ├── PlanDetailPage
│   ├── CreatePlanPage
│   ├── EditPlanPage
│   ├── ExerciseLibraryPage
│   ├── ExerciseHistoryPage
│   └── WorkoutPage
│
├── StretchLayout (minimal, with back button)
│   └── StretchPage
│
└── MeditationLayout (minimal, with back button)
    └── MeditationPage
```

## What We're NOT Doing

- **No micro-frontends**: All activities remain in same bundle/repo
- **No database changes**: Reusing existing APIs and data models
- **No new activity implementations**: Cycling/Fishing are placeholders only
- **No authentication**: Remains single-user app
- **No breaking API changes**: All backend routes stay the same

## Key Discoveries

1. **Card patterns exist**: `PlanCard.tsx:35-115`, `ActivityItem.tsx:80-123` provide templates for activity cards
2. **Fixed bottom bar pattern**: `StretchSetup.tsx:185-216` shows how to position elements above the 64px nav
3. **Layout pattern**: `App.tsx:126-148` shows current layout wrapper approach
4. **Calendar aggregates all activities**: `CalendarPage.tsx` already fetches workouts, stretches, meditations
5. **MesoPage is inline**: Defined in `App.tsx:39-124`, needs extraction

---

## Implementation Phases

### Execution Strategy

The phases below are organized by **dependency**, not sequence. Many phases can be executed in parallel:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PARALLEL BATCH (Step 1)                         │
│  All independent - can be built simultaneously                      │
├─────────────────────────────────────────────────────────────────────┤
│  1A. Infrastructure    │  1B. Activities Hub   │  1C. Extract Meso  │
│  (layouts, navs)       │  (grid launcher)      │  (move to file)    │
├────────────────────────┼─────────────────────────────────────────────┤
│  1D. Today Dashboard   │  1E. History Page     │  1F. Profile Page  │
│  (unified home)        │  (enhanced calendar)  │  (settings+stats)  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION (Step 2)                             │
│  Depends on all Parallel Batch items                                │
├─────────────────────────────────────────────────────────────────────┤
│  2. Nested Routing - Wire everything together, update links         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FINALIZATION (Step 3)                            │
│  Depends on Integration                                             │
├─────────────────────────────────────────────────────────────────────┤
│  3. Cleanup - Remove old code, update tests                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Benefits**: Reduces 8 sequential phases to 3 sequential steps. Phases 1A-1F can all be developed and unit-tested in isolation before integration.

---

## Step 1: Parallel Batch

### Phase 1A: Infrastructure - Layout Components

**Goal**: Create the foundational layout components without changing existing functionality.

**Can parallelize with**: All other Step 1 phases

#### Changes Required

**1. Create GlobalBottomNav component**
- **File**: `packages/client/src/components/Navigation/GlobalBottomNav.tsx` (new)
- **Model after**: `BottomNav.tsx:56-99`
- **Items**: Today (`/`), Activities (`/activities`), History (`/history`), Profile (`/profile`)
- **Icons**: Create/reuse CalendarIcon, GridIcon, ChartIcon, UserIcon

**2. Create LiftingBottomNav component**
- **File**: `packages/client/src/components/Navigation/LiftingBottomNav.tsx` (new)
- **Items**: Back (→ `/activities`), Meso (`/lifting`), Plans (`/lifting/plans`), Exercises (`/lifting/exercises`)
- **Back button**: First position, uses ArrowLeftIcon, navigates to `/activities`

**3. Create ActivityBottomNav component (generic)**
- **File**: `packages/client/src/components/Navigation/ActivityBottomNav.tsx` (new)
- **Purpose**: Simple nav with just a back button for single-page activities (stretch, meditation)
- **Props**: `backPath: string`, `activityName: string`

**4. Create GlobalLayout component**
- **File**: `packages/client/src/components/Layout/GlobalLayout.tsx` (new)
- **Structure**: `<Box paddingBottom="80px"><Outlet /></Box><GlobalBottomNav />`

**5. Create LiftingLayout component**
- **File**: `packages/client/src/components/Layout/LiftingLayout.tsx` (new)
- **Structure**: `<Box paddingBottom="80px"><Outlet /></Box><LiftingBottomNav />`

**6. Create ActivityLayout component (generic)**
- **File**: `packages/client/src/components/Layout/ActivityLayout.tsx` (new)
- **Props**: `backPath: string`, `activityName: string`
- **Structure**: Uses ActivityBottomNav

**7. Update Navigation index exports**
- **File**: `packages/client/src/components/Navigation/index.ts`
- **Add**: Export all new nav components

**8. Create Layout index exports**
- **File**: `packages/client/src/components/Layout/index.ts` (new)
- **Add**: Export all layout components

#### Success Criteria
- [ ] All new components compile without errors
- [ ] Unit tests pass for new nav components
- [ ] Components match existing styling patterns (64px height, safe-area-inset, etc.)

#### Confirmation Gate
Verify new components render correctly in isolation before proceeding.

---

### Phase 1B: Activities Hub Page

**Can parallelize with**: All other Step 1 phases

**Goal**: Build the Activities grid launcher page.

#### Changes Required

**1. Create ActivityCard component**
- **File**: `packages/client/src/components/Activities/ActivityCard.tsx` (new)
- **Props**: `id`, `name`, `icon`, `path`, `color`, `disabled?`, `description?`
- **Style**: Model after `MeditationSetup.tsx:48-67` (selectable cards)
- **Features**:
  - Clickable card that navigates to activity
  - Disabled state for future activities (Cycling, Fishing)
  - Color-coded background per activity type

**2. Create ActivitiesPage**
- **File**: `packages/client/src/pages/ActivitiesPage.tsx` (new)
- **Layout**: 3-column grid using Radix `Grid` component
- **Activities**:
  - Lifting (enabled, blue, → `/lifting`)
  - Stretch (enabled, teal, → `/stretch`)
  - Meditate (enabled, purple, → `/meditation`)
  - Cycling (disabled, orange, placeholder)
  - Fishing (disabled, cyan, placeholder)
  - Add (+) card for visual hint of extensibility

**3. Create Activities index exports**
- **File**: `packages/client/src/components/Activities/index.ts` (new)

**4. Add ActivitiesPage to pages index**
- **File**: `packages/client/src/pages/index.ts`

#### Success Criteria
- [ ] Activities page renders grid of activity cards
- [ ] Clicking enabled activities navigates correctly
- [ ] Disabled activities show disabled state (grayed out, not clickable)
- [ ] Grid is responsive (3 columns on wide, 2 on narrow)
- [ ] Unit tests pass

#### Confirmation Gate
Activities page works standalone at `/activities` route before routing changes.

---

### Phase 1C: Extract MesoPage & Create LiftingHomePage

**Can parallelize with**: All other Step 1 phases

**Goal**: Extract MesoPage from App.tsx and prepare it to be Lifting's home page.

#### Changes Required

**1. Extract MesoPage to separate file**
- **From**: `packages/client/src/components/App.tsx:39-124`
- **To**: `packages/client/src/pages/MesoPage.tsx` (new file)
- **Changes**: None to logic, just extraction

**2. Create LiftingHomePage wrapper** (optional, may just use MesoPage directly)
- **File**: `packages/client/src/pages/LiftingHomePage.tsx` (new)
- **Purpose**: Could add lifting-specific header or quick actions
- **Initially**: Just re-exports MesoPage

**3. Update App.tsx imports**
- **File**: `packages/client/src/components/App.tsx`
- **Change**: Import MesoPage from pages instead of inline definition

**4. Update pages index**
- **File**: `packages/client/src/pages/index.ts`
- **Add**: Export MesoPage

#### Success Criteria
- [ ] MesoPage renders identically after extraction
- [ ] No functionality changes
- [ ] All existing tests pass

#### Confirmation Gate
App functions identically after extraction.

---

### Phase 1D: Unified Today Dashboard

**Can parallelize with**: All other Step 1 phases

**Goal**: Create the new unified Today page that aggregates all activities.

#### Changes Required

**1. Create TodayDashboard page**
- **File**: `packages/client/src/pages/TodayDashboard.tsx` (new)
- **Purpose**: Shows today's status across all activities

**Sections**:
1. **Today's Workout Card** (if scheduled)
   - Shows workout name, status, progress
   - "Start Workout" or "Continue" button → navigates to `/lifting/workouts/:id`
   - Uses existing `useTodaysWorkout()` hook

2. **Stretch Reminder Card**
   - Shows days since last stretch (from `useLatestStretchSession()`)
   - "Stretch Now" button → navigates to `/stretch`
   - Visual indicator if > 2 days since last stretch

3. **Meditation Streak Card**
   - Shows current streak or days since last meditation
   - "Meditate" button → navigates to `/meditation`
   - Could show recent session durations

4. **Quick Actions Row** (optional)
   - Shortcuts to most common actions

**2. Create dashboard-specific hooks** (if needed)
- **File**: `packages/client/src/hooks/useDashboardData.ts` (new)
- **Purpose**: Aggregate data from multiple sources
- Combines: `useTodaysWorkout()`, `useLatestStretchSession()`, meditation data

**3. Create dashboard card components**
- **File**: `packages/client/src/components/Dashboard/WorkoutCard.tsx` (new)
- **File**: `packages/client/src/components/Dashboard/StretchCard.tsx` (new)
- **File**: `packages/client/src/components/Dashboard/MeditationCard.tsx` (new)
- **Style**: Model after existing card patterns with activity-specific colors

**4. Rename old TodayPage**
- **From**: `pages/TodayPage.tsx`
- **To**: `pages/LiftingTodayPage.tsx` (keep as fallback/reference)
- **Or**: Integrate its logic into the WorkoutCard component

#### Success Criteria
- [ ] Dashboard shows today's workout (or "no workout" message)
- [ ] Dashboard shows stretch status with days-ago
- [ ] Dashboard shows meditation status
- [ ] Tapping cards/buttons navigates to correct activity
- [ ] Loading states handled gracefully
- [ ] Unit tests for dashboard components

#### Confirmation Gate
Dashboard displays correct data for all three activity types.

---

### Phase 1E: History Page (Enhanced Calendar)

**Can parallelize with**: All other Step 1 phases

**Goal**: Replace CalendarPage with enhanced History page supporting filters.

#### Changes Required

**1. Create HistoryPage**
- **File**: `packages/client/src/pages/HistoryPage.tsx` (new)
- **Based on**: `pages/CalendarPage.tsx`

**Enhancements**:
1. **Activity Type Filters**
   - Toggle buttons: All | Lifting | Stretch | Meditation
   - Filter `calendarData.days` based on selection

2. **Updated Activity Click Handling**
   - Workouts: Navigate to `/lifting/workouts/:id`
   - Stretch: Could show detail dialog or navigate to future stretch history
   - Meditation: Could show detail dialog or navigate to future meditation history

3. **Header Update**
   - Change "Calendar" heading to "History"

**2. Create filter components**
- **File**: `packages/client/src/components/History/ActivityFilter.tsx` (new)
- **Style**: Segmented control or toggle button group

#### Success Criteria
- [ ] History page shows calendar with activity dots
- [ ] Filters work correctly for each activity type
- [ ] "All" filter shows all activities (default)
- [ ] Navigation from activities works
- [ ] Unit tests pass

#### Confirmation Gate
Filter toggles correctly show/hide activity types in calendar.

---

### Phase 1F: Profile Page

**Can parallelize with**: All other Step 1 phases

**Goal**: Create Profile page combining settings with cross-activity stats.

#### Changes Required

**1. Create ProfilePage**
- **File**: `packages/client/src/pages/ProfilePage.tsx` (new)

**Sections**:
1. **Stats Overview**
   - Total workouts completed
   - Total stretch sessions
   - Total meditation minutes
   - Current streaks

2. **Settings** (migrate from SettingsPage)
   - Notification preferences
   - Theme settings (if applicable)
   - Future: Activity-specific settings

3. **About**
   - App version
   - Links to help/feedback

**2. Create stats hooks**
- **File**: `packages/client/src/hooks/useProfileStats.ts` (new)
- **Purpose**: Aggregate stats from all activities
- **Data sources**: Could use calendar API with date range, or create dedicated endpoint

**3. Migrate settings functionality**
- **From**: `pages/SettingsPage.tsx`
- **To**: Section within ProfilePage
- **Or**: Keep as separate component embedded in ProfilePage

#### Success Criteria
- [ ] Profile page shows aggregated stats
- [ ] Settings section functions correctly
- [ ] Navigation to profile works from global nav
- [ ] Unit tests pass

#### Confirmation Gate
Profile page displays stats and settings work.

---

## Step 2: Integration

### Phase 2: Nested Routing Structure

**Depends on**: All Step 1 phases (1A-1F)

**Goal**: Implement React Router nested routes with layout components.

#### Changes Required

**1. Restructure App.tsx routing**
- **File**: `packages/client/src/components/App.tsx`
- **Change**: Replace flat routes with nested structure using `<Outlet />`

**New structure**:
```tsx
<Routes>
  {/* Global routes */}
  <Route element={<GlobalLayout />}>
    <Route path="/" element={<TodayPage />} />
    <Route path="/activities" element={<ActivitiesPage />} />
    <Route path="/history" element={<HistoryPage />} />
    <Route path="/profile" element={<ProfilePage />} />
  </Route>

  {/* Lifting routes */}
  <Route path="/lifting" element={<LiftingLayout />}>
    <Route index element={<MesoPage />} />
    <Route path="plans" element={<PlansPage />} />
    <Route path="plans/new" element={<CreatePlanPage />} />
    <Route path="plans/:id" element={<PlanDetailPage />} />
    <Route path="plans/:id/edit" element={<EditPlanPage />} />
    <Route path="exercises" element={<ExerciseLibraryPage />} />
    <Route path="exercises/:id/history" element={<ExerciseHistoryPage />} />
    <Route path="workouts/:id" element={<WorkoutPage />} />
  </Route>

  {/* Stretch routes */}
  <Route path="/stretch" element={<ActivityLayout backPath="/activities" activityName="Stretch" />}>
    <Route index element={<StretchPage />} />
  </Route>

  {/* Meditation routes */}
  <Route path="/meditation" element={<ActivityLayout backPath="/activities" activityName="Meditation" />}>
    <Route index element={<MeditationPage />} />
  </Route>
</Routes>
```

**2. Remove old BottomNav from AppContent**
- **File**: `packages/client/src/components/App.tsx`
- **Change**: Remove `<BottomNav />` from AppContent (now in layout components)

**3. Update internal navigation links in lifting pages**

Files to update:
- `pages/PlansPage.tsx`: `/plans/new` → `/lifting/plans/new`
- `pages/CreatePlanPage.tsx`: `/plans` → `/lifting/plans`, `/plans/${id}` → `/lifting/plans/${id}`
- `pages/PlanDetailPage.tsx`: `/plans/${id}/edit` → `/lifting/plans/${id}/edit`, `/plans` → `/lifting/plans`
- `pages/EditPlanPage.tsx`: `/plans/${id}` → `/lifting/plans/${id}`
- `pages/ExerciseLibraryPage.tsx`: (no changes needed - uses relative links)
- `components/ExerciseLibrary/ExerciseListItem.tsx`: `/exercises/${id}/history` → `/lifting/exercises/${id}/history`
- `components/App.tsx` (MesoPage): `/workouts/${id}` → `/lifting/workouts/${id}`
- `pages/WorkoutPage.tsx`: (uses navigate(-1), should work)

**4. Update CalendarPage activity navigation**
- **File**: `pages/CalendarPage.tsx:97-101`
- **Change**: `/workouts/${id}` → `/lifting/workouts/${id}`

#### Success Criteria
- [ ] All routes render with correct layout/nav
- [ ] Navigation between lifting pages works
- [ ] Back button in lifting nav returns to /activities
- [ ] Stretch/Meditation pages show back button
- [ ] No 404s on any existing functionality
- [ ] E2E tests updated and passing

#### Confirmation Gate
Full navigation flow works: Activities → Lifting → Plans → back to Activities.

---

## Step 3: Finalization

### Phase 3: Cleanup & Polish

**Depends on**: Phase 2 (Integration)

**Goal**: Remove deprecated code, update tests, polish UX.

#### Changes Required

**1. Remove old BottomNav**
- **File**: `components/Navigation/BottomNav.tsx`
- **Action**: Delete or keep for reference
- **Update**: `components/Navigation/index.ts` exports

**2. Remove deprecated pages**
- `pages/CalendarPage.tsx` (replaced by HistoryPage)
- `pages/SettingsPage.tsx` (merged into ProfilePage)
- `pages/TodayPage.tsx` (replaced by TodayDashboard, unless kept for lifting)

**3. Update E2E tests**
- **Files**: `packages/client/e2e/*.spec.ts`
- **Changes**: Update all route references
- **New tests**: Add tests for new navigation flows

**4. Update unit tests**
- **Files**: Various `__tests__` directories
- **Changes**: Update route mocks and navigation assertions

**5. Update any hardcoded links**
- Search codebase for old routes (`/plans`, `/exercises`, `/meso`, `/calendar`, `/settings`)
- Update to new routes

**6. Add transitions/animations** (optional)
- Page transitions when entering/exiting activities
- Card hover effects on Activities page

**7. Update documentation**
- Update any user-facing docs about navigation

#### Success Criteria
- [ ] No dead code remaining
- [ ] All tests pass (unit + E2E)
- [ ] No console warnings about missing routes
- [ ] `npm run validate` passes

#### Confirmation Gate
Full test suite passes, no deprecated code remains. `npm run validate` passes.

---

## Testing Strategy

**Note**: Unit tests for Step 1 phases can be written and run in isolation. Integration and E2E tests run after Phase 2.

### Unit Tests

**New components to test**:
- `GlobalBottomNav` - renders 4 items, highlights active
- `LiftingBottomNav` - renders back + 3 items, back navigates correctly
- `ActivityBottomNav` - renders back button with correct path
- `GlobalLayout` - renders children and nav
- `LiftingLayout` - renders children and nav
- `ActivityCard` - renders, handles click, shows disabled state
- `ActivitiesPage` - renders grid, navigation works
- `TodayDashboard` - renders all sections, handles loading/error
- `HistoryPage` - filters work, navigation works
- `ProfilePage` - stats display, settings work

**Test patterns** (from existing tests):
- Use `@testing-library/react`
- Use `MemoryRouter` for routing tests
- Use `msw` for API mocks
- Match existing patterns in `__tests__` directories

### E2E Tests

**New flows to test**:
1. Navigate: Home → Activities → Lifting → Plans → Create Plan → back to Activities
2. Navigate: Home → Activities → Stretch → complete session → back
3. Navigate: Home → Activities → Meditation → complete session → back
4. Navigate: Home → History → filter by activity type
5. Navigate: Home → Profile → change settings

**Update existing flows**:
- All lifting E2E tests need route updates (`/plans` → `/lifting/plans`, etc.)

### Manual Testing Checklist

- [ ] All navigation flows work on mobile viewport
- [ ] Back button behavior is intuitive
- [ ] No flash of wrong nav when navigating
- [ ] Activity cards have correct colors
- [ ] Disabled activities look disabled
- [ ] History filters are responsive
- [ ] Profile stats are accurate

---

## References

### Research Sources
- [React Router Nested Routes (Perficient)](https://blogs.perficient.com/2025/01/27/implementing-nested-routes-with-react-router-6/)
- [Hub and Spoke Navigation (NN/g)](https://www.nngroup.com/articles/mobile-navigation-patterns/)
- [Bottom Navigation Best Practices (Arounda)](https://arounda.agency/blog/bottom-navigation-for-mobile-ux-design)

### Key Code Locations
- Current routing: `packages/client/src/components/App.tsx:130-144`
- Current bottom nav: `packages/client/src/components/Navigation/BottomNav.tsx`
- Card patterns: `packages/client/src/components/Plans/PlanCard.tsx:35-115`
- Calendar data: `packages/client/src/hooks/useCalendarData.ts`
- Today's workout: `packages/client/src/hooks/useWorkout.ts:581-658`
- Activity colors: `packages/client/src/components/Calendar/ActivityItem.tsx:40-51`

### Design Tokens
- Nav height: 64px
- Card background: `var(--gray-2)`
- Card border: `var(--gray-4)` or `var(--gray-5)`
- Activity colors:
  - Lifting/Workout: indigo (`#6366f1`, `var(--indigo-9)`)
  - Stretch: teal (`#14b8a6`, `var(--teal-9)`)
  - Meditation: purple (`#a855f7`, `var(--purple-9)`)
  - Cycling: orange (future)
  - Fishing: cyan (future)
