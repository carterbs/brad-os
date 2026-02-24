# iOS Calendar & History Feature Implementation Plan

## Overview

Integrate real API data into the existing iOS Calendar & History views by implementing a ViewModel layer and replacing mock data with live API fetches. The UI components already exist and match the spec requirements.

## Current State Analysis

### What Exists (Ready to Use)

**Views** at `ios/BradOS/BradOS/Views/History/HistoryView.swift`:
- `HistoryView` - Main view with filter section, calendar, legend
- `FilterChip` - Activity type filter buttons
- `MonthCalendarView` - Monthly grid with navigation
- `CalendarDayCell` - Day tile with activity dots (6px, 2px gap)
- `DayDetailSheet` - Sheet showing day's activities
- `DayActivityCard` - Activity detail card with type-specific content

**Models** at `ios/BradOS/BradOS/Models/CalendarActivity.swift`:
- `ActivityType` enum with `workout`, `stretch`, `meditation`
- `CalendarActivity` struct with Codable conformance
- `ActivitySummary` struct with all activity-specific fields
- `CalendarDayData` struct with helper properties

### What's Missing

1. **ViewModel layer** - No CalendarViewModel to manage state/fetching
2. **API integration** - Views use mock data (`CalendarActivity.mockActivities`)
3. **Loading/error states** - No handling for async data fetching
4. **Timezone handling** - Not sending offset to API
5. **Workout navigation** - Can't navigate to workout detail from day sheet
6. **Calendar page** - Only History page exists (no filter-less calendar)

## Desired End State

1. `HistoryView` fetches real data from `/api/calendar/:year/:month`
2. Loading spinner shown during fetch, error message on failure
3. Filter persists across month navigation
4. Clicking workout activity navigates to workout detail
5. Separate `CalendarView` exists (same UI, no filters)
6. Timezone offset sent with API requests

## What We're NOT Doing

- API client implementation (handled elsewhere)
- Data caching (unnecessary complexity for now)
- Offline support
- Pull-to-refresh (can add later)

---

## Phase 1: ViewModel Foundation

### Overview
Create `CalendarViewModel` to manage calendar state, data fetching, and loading/error states.

### Changes Required

**New File: `ios/BradOS/BradOS/ViewModels/CalendarViewModel.swift`**

```swift
import Foundation
import SwiftUI

@MainActor
class CalendarViewModel: ObservableObject {
    // Published state
    @Published var currentMonth: Date = Date()
    @Published var activitiesByDate: [String: [CalendarActivity]] = [:]
    @Published var isLoading: Bool = false
    @Published var error: String? = nil

    // Dependencies
    private let apiClient: APIClient  // Injected

    // Computed
    var year: Int { Calendar.current.component(.year, from: currentMonth) }
    var month: Int { Calendar.current.component(.month, from: currentMonth) }

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchMonth() async {
        isLoading = true
        error = nil

        let timezoneOffset = TimeZone.current.secondsFromGMT() / 60

        do {
            let response = try await apiClient.getCalendarData(
                year: year,
                month: month,
                timezoneOffset: timezoneOffset
            )
            activitiesByDate = response.days.mapValues { $0.activities }
        } catch {
            self.error = "Failed to load calendar data"
        }

        isLoading = false
    }

    func previousMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: -1, to: currentMonth) {
            currentMonth = newMonth
            Task { await fetchMonth() }
        }
    }

    func nextMonth() {
        if let newMonth = Calendar.current.date(byAdding: .month, value: 1, to: currentMonth) {
            currentMonth = newMonth
            Task { await fetchMonth() }
        }
    }

    func activitiesForDate(_ date: Date) -> [CalendarActivity] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let key = formatter.string(from: date)
        return activitiesByDate[key] ?? []
    }
}
```

**New File: `ios/BradOS/BradOS/Models/CalendarDataResponse.swift`**

```swift
import Foundation

struct CalendarDataResponse: Codable {
    let startDate: String
    let endDate: String
    let days: [String: CalendarDayData]

    enum CodingKeys: String, CodingKey {
        case startDate = "start_date"
        case endDate = "end_date"
        case days
    }
}
```

### Success Criteria
- [ ] CalendarViewModel compiles with no errors
- [ ] Published properties trigger view updates
- [ ] Month navigation updates currentMonth and triggers fetch
- [ ] Timezone offset calculated correctly

### Confirmation Gate
Verify ViewModel initializes and mock API client can be injected before proceeding.

---

## Phase 2: View Integration

### Overview
Update `HistoryView` and `MonthCalendarView` to use the ViewModel instead of mock data.

### Changes Required

**Modify: `ios/BradOS/BradOS/Views/History/HistoryView.swift`**

1. Add `@StateObject` for ViewModel (lines 5-8):
```swift
struct HistoryView: View {
    @StateObject private var viewModel: CalendarViewModel
    @State private var selectedDate: Date = Date()
    @State private var selectedFilter: ActivityType? = nil
    // ... rest unchanged

    init(apiClient: APIClient) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
    }
```

2. Update `MonthCalendarView` instantiation (lines 18-25):
```swift
MonthCalendarView(
    viewModel: viewModel,
    selectedDate: $selectedDate,
    filter: selectedFilter,
    onDayTapped: { date, activities in
        selectedDayActivities = activities
        showingDayDetail = !activities.isEmpty
    }
)
```

3. Add loading/error states in body (before calendar):
```swift
if viewModel.isLoading {
    LoadingView(message: "Loading calendar...")
} else if let error = viewModel.error {
    ErrorStateView(message: error) {
        Task { await viewModel.fetchMonth() }
    }
} else {
    // existing calendar content
}
```

4. Add `.task` modifier to fetch on appear:
```swift
.task {
    await viewModel.fetchMonth()
}
```

**Modify: `MonthCalendarView` (lines 121-248)**

1. Change from local state to ViewModel:
```swift
struct MonthCalendarView: View {
    @ObservedObject var viewModel: CalendarViewModel
    @Binding var selectedDate: Date
    let filter: ActivityType?
    let onDayTapped: (Date, [CalendarActivity]) -> Void

    // Remove: @State private var currentMonth
    // Remove: private let mockActivitiesByDate
```

2. Update month navigation buttons:
```swift
Button(action: { viewModel.previousMonth() }) { ... }
Button(action: { viewModel.nextMonth() }) { ... }
```

3. Update `monthYearString` to use viewModel:
```swift
private var monthYearString: String {
    let formatter = DateFormatter()
    formatter.dateFormat = "MMMM yyyy"
    return formatter.string(from: viewModel.currentMonth)
}
```

4. Update `daysInMonth` to use viewModel.currentMonth

5. Update `activitiesForDate` to delegate to viewModel:
```swift
private func activitiesForDate(_ date: Date) -> [CalendarActivity] {
    viewModel.activitiesForDate(date)
}
```

**New File: `ios/BradOS/BradOS/Components/ErrorStateView.swift`**

```swift
import SwiftUI

struct ErrorStateView: View {
    let message: String
    let retryAction: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(Theme.textSecondary)

            Text(message)
                .font(.body)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Try Again", action: retryAction)
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(Theme.Spacing.xl)
    }
}
```

### Success Criteria
- [ ] HistoryView shows loading spinner on initial load
- [ ] HistoryView shows error state with retry button on failure
- [ ] Calendar displays real data from API
- [ ] Month navigation fetches new data
- [ ] Filter still works with real data

### Confirmation Gate
Verify calendar loads and displays real API data before proceeding.

---

## Phase 3: Workout Navigation

### Overview
Enable navigation from workout activity cards in the day detail sheet to the workout detail page.

### Changes Required

**Modify: `ios/BradOS/BradOS/Views/History/HistoryView.swift`**

1. Add navigation path binding to HistoryView:
```swift
struct HistoryView: View {
    @EnvironmentObject var appState: AppState
    @Binding var navigationPath: NavigationPath  // Add this
    // ... rest of state
```

2. Update `DayDetailSheet` to accept navigation callback:
```swift
DayDetailSheet(
    date: selectedDate,
    activities: selectedDayActivities,
    onWorkoutTapped: { workoutId in
        showingDayDetail = false
        // Navigate to workout detail
        appState.isShowingLiftingContext = true
        navigationPath.append(WorkoutDestination(workoutId: workoutId))
    }
)
```

**Modify: `DayDetailSheet` (lines 317-359)**

```swift
struct DayDetailSheet: View {
    let date: Date
    let activities: [CalendarActivity]
    var onWorkoutTapped: ((String) -> Void)? = nil  // Add callback

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.md) {
                    if activities.isEmpty {
                        // ... unchanged
                    } else {
                        ForEach(activities) { activity in
                            DayActivityCard(activity: activity) {
                                if activity.type == .workout {
                                    // Extract workout ID from activity.id (format: "workout-123")
                                    let workoutId = String(activity.id.dropFirst("workout-".count))
                                    onWorkoutTapped?(workoutId)
                                }
                                dismiss()
                            }
                        }
                    }
                }
                // ... rest unchanged
            }
        }
    }
}
```

**Modify: `DayActivityCard` (lines 362-442)**

Add tap action and visual affordance for workouts:

```swift
struct DayActivityCard: View {
    let activity: CalendarActivity
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack {
                    // ... existing content ...

                    // Add chevron for workouts
                    if activity.type == .workout {
                        Image(systemName: "chevron.right")
                            .foregroundColor(Theme.textSecondary)
                    }
                }
                // ... rest unchanged
            }
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
        }
        .buttonStyle(PlainButtonStyle())
    }
}
```

### Success Criteria
- [ ] Workout cards show chevron indicator
- [ ] Tapping workout card dismisses sheet
- [ ] App navigates to lifting context
- [ ] Workout detail page loads with correct workout
- [ ] Tapping stretch/meditation cards just dismisses sheet (no navigation)

### Confirmation Gate
Verify full navigation flow from calendar -> day sheet -> workout detail before proceeding.

---

## Phase 4: Calendar Page

### Overview
Create a separate `CalendarView` that shows the calendar without activity filters (per spec: `/calendar` vs `/history`).

### Changes Required

**New File: `ios/BradOS/BradOS/Views/Calendar/CalendarView.swift`**

```swift
import SwiftUI

/// Calendar view showing activity history (no filtering)
struct CalendarView: View {
    @StateObject private var viewModel: CalendarViewModel
    @EnvironmentObject var appState: AppState
    @Binding var navigationPath: NavigationPath

    @State private var selectedDate: Date = Date()
    @State private var showingDayDetail: Bool = false
    @State private var selectedDayActivities: [CalendarActivity] = []

    init(apiClient: APIClient, navigationPath: Binding<NavigationPath>) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
        _navigationPath = navigationPath
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    // Calendar (no filter section)
                    if viewModel.isLoading {
                        LoadingView(message: "Loading calendar...")
                    } else if let error = viewModel.error {
                        ErrorStateView(message: error) {
                            Task { await viewModel.fetchMonth() }
                        }
                    } else {
                        MonthCalendarView(
                            viewModel: viewModel,
                            selectedDate: $selectedDate,
                            filter: nil,  // No filter for calendar page
                            onDayTapped: { date, activities in
                                selectedDayActivities = activities
                                showingDayDetail = !activities.isEmpty
                            }
                        )
                    }

                    // Legend
                    legendSection
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingDayDetail) {
                DayDetailSheet(
                    date: selectedDate,
                    activities: selectedDayActivities,
                    onWorkoutTapped: { workoutId in
                        showingDayDetail = false
                        appState.isShowingLiftingContext = true
                        navigationPath.append(WorkoutDestination(workoutId: workoutId))
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .task {
                await viewModel.fetchMonth()
            }
        }
    }

    // MARK: - Legend Section (same as HistoryView)
    @ViewBuilder
    private var legendSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Legend")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: Theme.Spacing.lg) {
                ForEach(ActivityType.allCases, id: \.self) { type in
                    HStack(spacing: Theme.Spacing.xs) {
                        Circle()
                            .fill(type.color)
                            .frame(width: 8, height: 8)
                        Text(type.displayName)
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
    }
}

#Preview {
    CalendarView(apiClient: MockAPIClient(), navigationPath: .constant(NavigationPath()))
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
```

**Modify: `MainTabView.swift`**

Add Calendar tab if needed (check if it exists or if History tab serves both purposes).

### Success Criteria
- [ ] CalendarView compiles and renders
- [ ] No filter buttons shown
- [ ] All activity types visible (no filtering)
- [ ] Day detail sheet works with workout navigation
- [ ] Legend displays correctly

### Confirmation Gate
Verify CalendarView works independently before finalizing.

---

## Testing Strategy

### Manual Testing Checklist

**Calendar Display:**
- [ ] Current month shows on load
- [ ] Month/year header displays correctly ("January 2026")
- [ ] Previous month button works
- [ ] Next month button works
- [ ] Loading spinner shows during fetch
- [ ] Error state shows on API failure
- [ ] Retry button triggers new fetch

**Activity Indicators:**
- [ ] Blue dot appears for workouts
- [ ] Teal dot appears for stretches
- [ ] Purple dot appears for meditations
- [ ] Multiple dots show on same day
- [ ] Dots have 2px gap between them
- [ ] Days without activities have no dots

**Day Detail Dialog:**
- [ ] Tapping any day opens sheet
- [ ] Sheet title shows formatted date
- [ ] Empty days show "No activities" message
- [ ] Activities ordered by completion time
- [ ] Workout cards show day name + set count
- [ ] Stretch cards show regions + duration
- [ ] Meditation cards show duration

**Activity Navigation:**
- [ ] Workout cards show chevron indicator
- [ ] Tapping workout navigates to detail page
- [ ] Sheet dismisses on navigation
- [ ] Tapping stretch/meditation just dismisses

**History Filtering:**
- [ ] "All" filter shows all activity types
- [ ] "Workout" filter shows only blue dots
- [ ] "Stretch" filter shows only teal dots
- [ ] "Meditation" filter shows only purple dots
- [ ] Filter persists across month navigation
- [ ] Day detail respects current filter

---

## References

- Spec: `ios/specs/calendar-history.md`
- Existing iOS implementation: `ios/BradOS/BradOS/Views/History/HistoryView.swift`
- Models: `ios/BradOS/BradOS/Models/CalendarActivity.swift`
- Web calendar API: `packages/server/src/routes/calendar.routes.ts`
- Web calendar service: `packages/server/src/services/calendar.service.ts`
- Shared types: `packages/shared/src/types/calendar.ts`
