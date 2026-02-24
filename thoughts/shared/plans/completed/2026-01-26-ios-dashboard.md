# iOS Dashboard Feature Implementation Plan

## Overview

Implement the Dashboard (Today) feature for the native iOS app, displaying three activity cards (Workout, Stretch, Meditation) that show current status and provide quick access to each activity type. This matches the web app's `TodayDashboard.tsx` implementation.

## Dependencies

- **API Client** (separate plan): This plan assumes an `APIClient` service exists with methods to fetch data from the server. The API client plan should be implemented first.

## Current State Analysis

### What Exists

| File | Description |
|------|-------------|
| `Views/Today/TodayDashboardView.swift:1-213` | Basic dashboard with mock data, contains `TodayWorkoutCard` |
| `Components/ActivityCard.swift:32-77` | Generic `ActivityQuickCard` component |
| `Components/StatusBadge.swift:1-62` | `StatusBadge` and `GenericBadge` components |
| `Models/Workout.swift:1-153` | `Workout`, `WorkoutExercise`, `WorkoutSet` models |
| `Models/StretchSession.swift:1-114` | `StretchSession`, `StretchRegionConfig` models |
| `Models/MeditationSession.swift:1-63` | `MeditationSession` model |
| `Theme/Theme.swift:1-131` | Colors including `lifting`, `stretch`, `meditation` |

### What's Missing

1. **Distinct dashboard card components** - Current `ActivityQuickCard` is generic; spec requires specific cards with different states
2. **Loading states** - No loading indicators for data fetching
3. **Urgency states** - Stretch card needs orange border/text when 3+ days since last session
4. **ViewModel layer** - Currently using `@State` with mock data, need proper data fetching
5. **API integration** - No real data fetching (dependency on API client plan)

## Desired End State

- Dashboard displays three cards matching the spec in `ios/specs/dashboard.md`
- Each card handles loading, empty, and data states independently
- Workout card shows status badges (Ready/In Progress/Completed) with appropriate colors
- Stretch card shows urgency state (orange) when 3+ days since last session
- Meditation card shows last session duration
- Cards navigate to their respective detail views
- Pull-to-refresh support for manual data refresh

## What We're NOT Doing

- API client implementation (separate plan)
- Activities grid page (separate feature)
- Workout detail/tracking view enhancements
- Stretch or Meditation session views

## Key Discoveries

### Web App Card Implementation Patterns

From `packages/client/src/components/Dashboard/`:

**WorkoutCard.tsx:62-67** - Badge color mapping:
```typescript
const { color, label } = workout.status === 'pending'
  ? { color: 'gray' as const, label: 'Ready' }
  : workout.status === 'in_progress'
    ? { color: 'yellow' as const, label: 'In Progress' }
    : { color: 'green' as const, label: 'Completed' };
```

**StretchCard.tsx:19-29** - Urgency logic:
```typescript
function getStatusMessage(daysSince: number): { message: string; isUrgent: boolean } {
  if (daysSince === 0) return { message: 'Stretched today!', isUrgent: false };
  if (daysSince === 1) return { message: 'Last stretched yesterday', isUrgent: false };
  if (daysSince <= 2) return { message: `${daysSince} days ago`, isUrgent: false };
  return { message: `${daysSince} days ago - time to stretch!`, isUrgent: true };
}
```

**MeditationCard.tsx:53** - Duration display:
```typescript
const lastDuration = lastSession ? Math.floor(lastSession.actualDurationSeconds / 60) : null;
// Displays: "Last session: 10 min"
```

### iOS Theme Colors (Theme.swift:24-27)

```swift
static let lifting = Color(hex: "6366f1")    // Indigo
static let stretch = Color(hex: "14b8a6")    // Teal
static let meditation = Color(hex: "a855f7") // Purple
```

### API Endpoints Required

| Endpoint | Returns | Cache Strategy |
|----------|---------|----------------|
| `GET /api/workouts/today` | `Workout?` | Refetch on focus |
| `GET /api/stretch-sessions/latest` | `StretchSession?` | 5 min stale time |
| `GET /api/meditation-sessions/latest` | `MeditationSession?` | 5 min stale time |

---

## Implementation Approach

Create dedicated dashboard card components that handle their own states, backed by a ViewModel that manages API calls. Follow existing iOS patterns using `@Published` properties and SwiftUI's declarative state management.

---

## Phase 1: Dashboard Card Components

### Overview
Create three dedicated card components for the dashboard, each handling loading, empty, and data states according to the spec.

### Changes Required

#### 1.1 Create `Views/Today/WorkoutDashboardCard.swift` (new file)

```swift
// Component that displays today's workout with proper states
struct WorkoutDashboardCard: View {
    let workout: Workout?
    let isLoading: Bool
    let onTap: () -> Void
}
```

**States to implement:**
- Loading: Indigo-themed skeleton with "Loading workout..." text
- No workout: Gray card with "No workout scheduled for today." message
- Pending: "Ready" badge (gray), plan day name, week number, exercise count, "Start Workout" button
- In Progress: "In Progress" badge (yellow), progress indicator (X/Y sets), "Continue" button
- Completed: "Completed" badge (green), "View" button

**Visual specs:**
- Background: `Theme.lifting.opacity(0.15)`
- Border: `Theme.lifting.opacity(0.5)`
- Corner radius: `Theme.CornerRadius.lg` (12pt)

#### 1.2 Create `Views/Today/StretchDashboardCard.swift` (new file)

```swift
// Component that displays stretch status with urgency states
struct StretchDashboardCard: View {
    let lastSession: StretchSession?
    let isLoading: Bool
    let onTap: () -> Void
}
```

**States to implement:**
- Loading: Teal-themed with "Loading stretch data..." text
- No sessions: "No stretch sessions yet" with "Stretch Now" button
- Stretched today: "Stretched today!" (teal border)
- Stretched yesterday: "Last stretched yesterday" (teal border)
- 2 days ago: "2 days ago" (teal border)
- 3+ days ago: "X days ago - time to stretch!" (orange border and text)

**Visual specs:**
- Background: `Theme.stretch.opacity(0.15)`
- Border: `Theme.stretch.opacity(0.5)` OR `Theme.warning` when urgent
- Text color: `Theme.textSecondary` OR `Theme.warning` when urgent

#### 1.3 Create `Views/Today/MeditationDashboardCard.swift` (new file)

```swift
// Component that displays meditation status with duration
struct MeditationDashboardCard: View {
    let lastSession: MeditationSession?
    let isLoading: Bool
    let onTap: () -> Void
}
```

**States to implement:**
- Loading: Purple-themed with "Loading meditation data..." text
- No sessions: "No meditation sessions yet" with "Meditate" button
- Session exists: Status message + "Last session: X min"

**Visual specs:**
- Background: `Theme.meditation.opacity(0.15)`
- Border: `Theme.meditation.opacity(0.5)`

#### 1.4 Add helper for days-since calculation

Add to `Models/StretchSession.swift` or create utility:

```swift
extension Date {
    func daysSince(_ other: Date) -> Int {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: other)
        let end = calendar.startOfDay(for: self)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }
}
```

### Success Criteria

- [ ] `WorkoutDashboardCard` renders all 5 states correctly
- [ ] `StretchDashboardCard` renders all states with proper urgency styling
- [ ] `MeditationDashboardCard` renders all states with duration display
- [ ] Cards use correct theme colors from Theme.swift
- [ ] Cards match visual design from web app screenshots

### Confirmation Gate
Preview all three cards in Xcode with mock data for each state before proceeding.

---

## Phase 2: Dashboard ViewModel

### Overview
Create a ViewModel to manage dashboard state and API calls, replacing the current `@State` properties with mock data.

### Changes Required

#### 2.1 Create `ViewModels/TodayDashboardViewModel.swift` (new file)

```swift
@MainActor
class TodayDashboardViewModel: ObservableObject {
    // State
    @Published var workout: Workout?
    @Published var lastStretchSession: StretchSession?
    @Published var lastMeditationSession: MeditationSession?

    @Published var isLoadingWorkout = false
    @Published var isLoadingStretch = false
    @Published var isLoadingMeditation = false

    @Published var workoutError: Error?
    @Published var stretchError: Error?
    @Published var meditationError: Error?

    private let apiClient: APIClient

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    func loadDashboard() async {
        // Parallel fetch all three data sources
        async let workoutTask = loadTodaysWorkout()
        async let stretchTask = loadLatestStretch()
        async let meditationTask = loadLatestMeditation()

        _ = await (workoutTask, stretchTask, meditationTask)
    }

    func loadTodaysWorkout() async { ... }
    func loadLatestStretch() async { ... }
    func loadLatestMeditation() async { ... }
}
```

#### 2.2 Create `ViewModels/` directory if needed

```bash
mkdir -p ios/BradOS/BradOS/ViewModels
```

### Success Criteria

- [ ] ViewModel compiles and initializes correctly
- [ ] All three load methods update `@Published` properties
- [ ] Loading states are set correctly during fetch
- [ ] Errors are captured (but not necessarily displayed yet)
- [ ] Parallel fetching works via `async let`

### Confirmation Gate
Write unit tests or use Xcode previews with mock APIClient to verify ViewModel behavior.

---

## Phase 3: Dashboard Integration

### Overview
Update `TodayDashboardView` to use the new ViewModel and card components.

### Changes Required

#### 3.1 Update `Views/Today/TodayDashboardView.swift`

Replace current implementation:

```swift
struct TodayDashboardView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = TodayDashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    WorkoutDashboardCard(
                        workout: viewModel.workout,
                        isLoading: viewModel.isLoadingWorkout
                    ) {
                        navigateToWorkout()
                    }

                    StretchDashboardCard(
                        lastSession: viewModel.lastStretchSession,
                        isLoading: viewModel.isLoadingStretch
                    ) {
                        appState.isShowingStretch = true
                    }

                    MeditationDashboardCard(
                        lastSession: viewModel.lastMeditationSession,
                        isLoading: viewModel.isLoadingMeditation
                    ) {
                        appState.isShowingMeditation = true
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle("Today")
            .refreshable {
                await viewModel.loadDashboard()
            }
            .task {
                await viewModel.loadDashboard()
            }
        }
    }

    private func navigateToWorkout() {
        if let workout = viewModel.workout {
            // Navigate to workout detail
            appState.isShowingLiftingContext = true
        }
    }
}
```

**Key changes:**
- Replace `@State` mock data with `@StateObject` ViewModel
- Use new card components instead of `TodayWorkoutCard` and `ActivityQuickCard`
- Add `.task` for initial data load
- Add `.refreshable` for pull-to-refresh
- Remove "Quick Access" section (cards are now primary UI)

#### 3.2 Remove old components from TodayDashboardView.swift

Delete these from the file (lines 126-207):
- `TodayWorkoutCard` struct (will be replaced by `WorkoutDashboardCard`)
- `noWorkoutCard` computed property
- `quickAccessSection` computed property
- `formatLastSession` helper (moved to Date extension)

### Success Criteria

- [ ] Dashboard loads data on appear
- [ ] Pull-to-refresh triggers reload
- [ ] All three cards display with correct data
- [ ] Loading states show during fetch
- [ ] Navigation works for all three cards

### Confirmation Gate
Run app in simulator, verify all cards load and display correctly with real or mock API data.

---

## Phase 4: Navigation & Polish

### Overview
Ensure navigation works correctly and add final polish.

### Changes Required

#### 4.1 Wire up workout navigation

Update navigation to pass workout ID to detail view:

```swift
private func navigateToWorkout() {
    guard let workout = viewModel.workout else { return }
    // Set workout ID in app state or use NavigationPath
    appState.selectedWorkoutId = workout.id
    appState.selectedTab = .lifting
}
```

Note: May need to add `selectedWorkoutId` to `AppState` if not already present.

#### 4.2 Add auto-refresh on app foreground

In `TodayDashboardView`:

```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    Task {
        await viewModel.loadDashboard()
    }
}
```

#### 4.3 Add error handling UI (optional enhancement)

If any fetch fails, show subtle error indicator or retry button. Can be deferred if not in spec.

### Success Criteria

- [ ] Tapping workout card navigates to workout detail
- [ ] Tapping stretch card opens stretch sheet/view
- [ ] Tapping meditation card opens meditation sheet/view
- [ ] Data refreshes when app returns to foreground
- [ ] UI matches spec requirements from `ios/specs/dashboard.md`

### Confirmation Gate
Manual QA through all user flows:
1. Load dashboard → see all three cards
2. Tap each card → correct navigation
3. Pull to refresh → data reloads
4. Background/foreground app → data refreshes

---

## Testing Strategy

### Unit Tests

| Test | Location |
|------|----------|
| Days-since calculation | `DateExtensionTests.swift` |
| Urgency logic for stretch | `StretchDashboardCardTests.swift` |
| ViewModel state management | `TodayDashboardViewModelTests.swift` |

### UI Tests

| Test | Description |
|------|-------------|
| Dashboard loads | Verify all three cards appear |
| Workout states | Test pending, in-progress, completed displays |
| Stretch urgency | Test 0, 1, 2, 3+ days styling |
| Navigation | Test each card navigates correctly |

### Manual Testing

- [ ] Fresh install with no data → empty states
- [ ] With workout scheduled → workout card shows correctly
- [ ] With recent stretch → teal styling
- [ ] With old stretch (3+ days) → orange urgency styling
- [ ] Pull to refresh works
- [ ] App backgrounding/foregrounding refreshes data

---

## References

- Spec: `ios/specs/dashboard.md`
- Web implementation: `packages/client/src/pages/TodayDashboard.tsx`
- Web workout card: `packages/client/src/components/Dashboard/WorkoutCard.tsx`
- Web stretch card: `packages/client/src/components/Dashboard/StretchCard.tsx`
- Web meditation card: `packages/client/src/components/Dashboard/MeditationCard.tsx`
- iOS theme: `ios/BradOS/BradOS/Theme/Theme.swift`
- Existing dashboard: `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift`
