# Meal Plan iOS Widget

## Overview

Add a WidgetKit home screen widget that shows today's meal plan (breakfast, lunch, dinner) - the same content as the `MealPlanDashboardCard` on the Today view. Tapping the widget opens the app directly to the full Meal Plan view.

## Current State Analysis

**What exists:**
- `MealPlanDashboardCard` (`MealPlanDashboardCard.swift:71-140`) - Shows today's 3 meals in a glass card with meal type icons (sunrise/sun/moon) and meal names
- `MealDayContent` (`MealPlanDashboardCard.swift:6-68`) - Reusable component for rendering a day's meals, shared between dashboard and TodayFocusView
- `MealPlanEntry` model (`BradOSCore/Sources/BradOSCore/Models/MealPlan.swift:4-29`) - Already `Codable` and `Sendable`, lives in the `BradOSCore` Swift package
- `MealPlanSession` model (`MealPlan.swift:83-117`) - Full session with 7-day plan, `Codable`
- `DashboardViewModel.loadMealPlan()` (`DashboardViewModel.swift:129-145`) - Fetches latest session from API, filters by today's day index
- `DashboardViewModel.calendarWeekdayToDayIndex()` (`DashboardViewModel.swift:148-153`) - Weekday conversion logic
- `APIClient` with `getLatestMealPlanSession()` (`APIClient.swift:567-569`) - Fetches `GET /mealplans/latest`
- `APIConfiguration` (`APIConfiguration.swift`) - Handles dev/prod URL routing, uses Firebase Cloud Functions
- **No existing widget extension target** - project has only the `BradOS` app target
- **No App Group configured** - no `.entitlements` files exist
- **No deep linking** - no URL scheme or `onOpenURL` handler
- Project uses **XcodeGen** (`project.yml`) for project generation

**Prerequisite - implemented by the caching plan:**
- `MealPlanCacheService` (disk cache for finalized sessions) - see `thoughts/shared/plans/2026-02-05-meal-plan-caching.md`. The caching plan writes the full `MealPlanSession` to the App Group shared container (`group.com.bradcarter.brad-os/meal-plan-cache/latest-session.json`). The widget reads directly from this same file.

## Desired End State

- A home screen widget in medium size showing today's 3 meals (breakfast, lunch, dinner) with meal type icons and names
- Widget updates its timeline periodically and when the app writes fresh data
- Tapping the widget opens the app to the Meal Plan view
- Widget displays a placeholder/empty state when no finalized meal plan exists
- Data is shared between app and widget via the `MealPlanCacheService` in the App Group shared container

## What We're NOT Doing

- Small widget size (not enough space for 3 meals)
- Large widget size (overkill for this data)
- Interactive widget buttons (just tap-to-open)
- Lock screen widgets (different API, separate effort)
- Widget configuration/intents (no user-selectable options needed)
- Fetching from the API directly in the widget timeline provider (use shared disk cache instead)
- Separate widget data service (the `MealPlanCacheService` from the caching plan IS the data bridge)

## Key Decisions

**Data sharing strategy: Shared file via App Group container (MealPlanCacheService)**

The widget cannot make authenticated API calls easily (no Firebase App Check in the widget extension). Instead:
1. The `MealPlanCacheService` (from the caching plan) writes the full `MealPlanSession` to the App Group shared container as JSON
2. The widget reads this same file via `MealPlanCacheService.shared.getCachedSession()` in its timeline provider
3. The widget computes today's day index and filters the plan entries itself
4. The app calls `WidgetCenter.shared.reloadAllTimelines()` whenever the cache is updated

**Why this is better than separate UserDefaults:**
- **One data path, not two** - the cache serves both instant app loading AND widget data
- **Full session available** - the widget has the complete 7-day plan, so day rollover at midnight works without the app needing to rewrite anything
- **No sync logic** - no need to keep a separate UserDefaults copy in sync with the cache
- **Already planned** - the caching plan (`2026-02-05-meal-plan-caching.md`) is about to be implemented

## Prerequisite

**The meal plan caching plan must be implemented first.** Specifically, Phases 0-3 of that plan provide:
- Phase 0: App Group entitlements and `project.yml` changes
- Phase 1: `MealPlanCacheService` writing to the App Group shared container
- Phase 2: `MealPlanViewModel` integration (writes cache on finalize, clears on new plan)
- Phase 3: `DashboardViewModel` integration (reads cache, writes after API fetch)

This widget plan starts after those phases are complete.

---

## Phase 1: Widget Extension Target

**Overview:** Create the WidgetKit extension target with XcodeGen configuration.

### Changes Required

**File: `ios/BradOS/project.yml`** (modify)
- Add new target `BradOSWidget`:
  ```yaml
  BradOSWidget:
    type: appExtension
    platform: iOS
    sources:
      - path: BradOSWidget
    dependencies:
      - package: BradOSCore
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.bradcarter.brad-os.widget
        CODE_SIGN_ENTITLEMENTS: BradOSWidget/BradOSWidget.entitlements
        INFOPLIST_FILE: BradOSWidget/Info.plist
        TARGETED_DEVICE_FAMILY: "1"
    info:
      path: BradOSWidget/Info.plist
      properties:
        NSExtension:
          NSExtensionPointIdentifier: com.apple.widgetkit-extension
  ```
- Add `BradOSWidget` as a dependency of the `BradOS` app target:
  ```yaml
  dependencies:
    - target: BradOSWidget
  ```

**File: `ios/BradOS/BradOSWidget/BradOSWidget.entitlements`** (new)
- Same App Group as the main app: `group.com.bradcarter.brad-os`

**File: `ios/BradOS/BradOSWidget/WidgetBundle.swift`** (new)

```swift
import WidgetKit
import SwiftUI

@main
struct BradOSWidgetBundle: WidgetBundle {
    var body: some Widget {
        MealPlanWidget()
    }
}
```

### Success Criteria
- `xcodegen generate` produces a valid project with the widget extension target
- Both `BradOS` and `BradOSWidget` targets build successfully
- Widget appears in the widget gallery on the home screen

---

## Phase 2: Timeline Provider & Widget Definition

**Overview:** Create the timeline provider that reads from `MealPlanCacheService` and the widget configuration.

### Changes Required

**File: `ios/BradOS/BradOSWidget/MealPlanWidget.swift`** (new)

```swift
import WidgetKit
import SwiftUI
import BradOSCore

struct MealPlanWidget: Widget {
    let kind: String = "MealPlanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MealPlanTimelineProvider()) { entry in
            MealPlanWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Meal Plan")
        .description("Today's breakfast, lunch, and dinner.")
        .supportedFamilies([.systemMedium])
    }
}
```

**File: `ios/BradOS/BradOSWidget/MealPlanTimelineProvider.swift`** (new)

```swift
import WidgetKit
import BradOSCore

struct MealPlanWidgetEntry: TimelineEntry {
    let date: Date
    let dayName: String
    let meals: [MealPlanEntry]  // today's 3 meals filtered from the full plan
    let isEmpty: Bool
}

struct MealPlanTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealPlanWidgetEntry {
        // Redacted placeholder with sample data
    }

    func getSnapshot(in context: Context, completion: @escaping (MealPlanWidgetEntry) -> Void) {
        // Quick snapshot for widget gallery preview
        let entry = makeEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MealPlanWidgetEntry>) -> Void) {
        let entry = makeEntry()
        // Refresh at midnight (today's meals change to tomorrow's)
        let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86400)
        let timeline = Timeline(entries: [entry], policy: .after(midnight))
        completion(timeline)
    }

    private func makeEntry() -> MealPlanWidgetEntry {
        let cacheService = MealPlanCacheService.shared
        guard let session = cacheService.getCachedSession(), session.isFinalized else {
            return MealPlanWidgetEntry(date: Date(), dayName: todayDayName(), meals: [], isEmpty: true)
        }
        let dayIndex = calendarWeekdayToDayIndex()
        let todayMeals = session.plan.filter { $0.dayIndex == dayIndex }
        return MealPlanWidgetEntry(date: Date(), dayName: todayDayName(), meals: todayMeals, isEmpty: false)
    }

    // Reuse the same weekday conversion logic as DashboardViewModel
    private func calendarWeekdayToDayIndex() -> Int {
        let weekday = Calendar.current.component(.weekday, from: Date())
        return weekday == 1 ? 6 : weekday - 2
    }

    private func todayDayName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: Date())
    }
}
```

Key details:
- Reads the full `MealPlanSession` from `MealPlanCacheService.shared.getCachedSession()`
- Filters by today's day index using the same `calendarWeekdayToDayIndex()` logic as `DashboardViewModel`
- Timeline refreshes at midnight so the correct day's meals are shown after rollover
- Also refreshed on-demand when the app calls `WidgetCenter.shared.reloadAllTimelines()`

### Success Criteria
- Timeline provider returns correct meals for today from cached session
- Empty state returned when no cached session or session not finalized
- Timeline policy set to refresh at midnight

---

## Phase 3: Widget View

**Overview:** Create the widget's SwiftUI view mirroring the `MealDayContent` layout.

### Changes Required

**File: `ios/BradOS/BradOSWidget/MealPlanWidgetEntryView.swift`** (new)

```swift
import SwiftUI
import WidgetKit
import BradOSCore

struct MealPlanWidgetEntryView: View {
    let entry: MealPlanWidgetEntry

    var body: some View {
        if entry.isEmpty {
            emptyState
        } else {
            mealContent
        }
    }

    private var mealContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(entry.dayName)
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(mealPlanColor)

            ForEach(MealType.allCases, id: \.self) { mealType in
                mealRow(mealType: mealType)
            }
        }
        .widgetURL(URL(string: "brados://mealplan"))
    }

    private func mealRow(mealType: MealType) -> some View {
        // Mirror MealDayContent layout:
        // Icon (sunrise/sun.max/moon.stars) + meal type label + meal name
        // Adapted for widget size constraints (tighter spacing, smaller fonts)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("No Meal Plan")
                .font(.headline)
            Text("Open app to generate")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .widgetURL(URL(string: "brados://mealplan"))
    }

    // Replicate Theme.mealPlan color for the widget
    // (widget can't access Theme.swift from the main app, define locally)
    private var mealPlanColor: Color { ... }
}
```

Key details:
- Mirrors the visual structure of `MealDayContent` (`MealPlanDashboardCard.swift:6-68`)
- Same SF Symbol icons: sunrise (breakfast), sun.max (lunch), moon.stars (dinner)
- Dark color scheme to match the app's always-dark theme
- Defines the meal plan accent color locally (widget can't import `Theme.swift` from the app target)
- `.widgetURL` set on the entire view for tap-to-open
- Empty state shows an informative message
- Placeholder uses `.redacted(reason: .placeholder)` for the WidgetKit preview

### Success Criteria
- Widget displays today's 3 meals with icons and names
- Empty state shown when no meal plan exists
- Visual style matches the app's dark theme and meal plan accent
- Long meal names truncate gracefully
- Missing meals show em-dash like the dashboard card

---

## Phase 4: Deep Link Handling (Tap to Open)

**Overview:** Handle the widget tap URL to navigate directly to the Meal Plan view.

### Changes Required

**File: `ios/BradOS/project.yml`** (modify, in `BradOS` target info properties)
- Register URL scheme `brados`:
  ```yaml
  CFBundleURLTypes:
    - CFBundleURLName: com.bradcarter.brad-os
      CFBundleURLSchemes:
        - brados
  ```

**File: `ios/BradOS/BradOS/App/BradOSApp.swift`** (modify)
- Add `.onOpenURL` handler to the `WindowGroup`:
  ```swift
  .onOpenURL { url in
      handleDeepLink(url)
  }
  ```
- `handleDeepLink` function:
  - Parse URL scheme `brados://`
  - For host `mealplan`: set `appState.isShowingMealPlan = true`
  - Extensible for future widgets (e.g., `brados://workout`)

### Success Criteria
- Tapping the widget opens the app directly to `MealPlanView`
- If the app is already open, it navigates to the meal plan view
- Deep link URL scheme is registered and functional

---

## Phase 5: Widget Timeline Reload Triggers

**Overview:** Ensure the widget updates promptly when the app writes new data to the cache.

### Changes Required

**File: `ios/BradOS/BradOS/App/BradOSApp.swift`** (modify)
- Import `WidgetKit`
- After the cache is written (in the caching plan's ViewModel integrations), trigger widget refresh
- Add `scenePhase` environment property and reload timelines when app becomes `.active` (catches external changes)

**File: `BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`** (modify)
- After `loadMealPlan()` writes to the cache (already done by caching plan), call a notification or callback that the app layer uses to trigger `WidgetCenter.shared.reloadAllTimelines()`
- Note: `WidgetKit` can only be imported in the app target, not BradOSCore. Use a `NotificationCenter` post from the ViewModel, observed in `BradOSApp.swift` or `TodayDashboardView.swift`

**File: `BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift`** (modify)
- Same pattern: post notification after `finalize()` writes to cache and after `startNewPlan()` clears cache

**File: `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift`** (modify)
- Observe the notification and call `WidgetCenter.shared.reloadAllTimelines()`
- Or: simply reload timelines after `viewModel.loadDashboard()` completes

### Success Criteria
- Finalizing a meal plan in the app updates the widget within seconds
- Starting a new plan (clearing cache) makes the widget show empty state
- Opening the app and loading the dashboard refreshes the widget

---

## Testing Strategy

**Automated:**
- Unit tests for timeline provider logic (mock `MealPlanCacheService` → correct entries for today, empty state, day rollover)
- `xcodegen generate` succeeds
- Both targets build: `xcodebuild -scheme BradOS` and `xcodebuild -scheme BradOSWidget`

**Manual:**
- Add widget to home screen from widget gallery
- Widget shows today's 3 meals correctly
- Widget shows empty state when no finalized meal plan
- Open app -> finalize a plan -> widget updates within seconds
- Tap widget -> app opens to Meal Plan view
- Day rollover: widget shows correct day's meals after midnight (full session is cached, widget recomputes day index)
- Kill app completely -> widget still shows cached data (reads from disk)
- Long-press widget -> edit widget (standard iOS behavior, no custom config needed)

## Dependencies

- **Requires `2026-02-05-meal-plan-caching.md` Phases 0-3** to be implemented first (App Group entitlements, `MealPlanCacheService`, ViewModel integrations)

## References

- Caching plan: `thoughts/shared/plans/2026-02-05-meal-plan-caching.md`
- Dashboard card: `ios/BradOS/BradOS/Views/Today/MealPlanDashboardCard.swift`
- MealDayContent component: `ios/BradOS/BradOS/Views/Today/MealPlanDashboardCard.swift:6-68`
- Dashboard VM: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`
- Meal plan models: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MealPlan.swift`
- App entry: `ios/BradOS/BradOS/App/BradOSApp.swift`
- Content routing: `ios/BradOS/BradOS/Views/ContentView.swift`
- Project config: `ios/BradOS/project.yml`
- Apple WidgetKit docs: https://developer.apple.com/documentation/widgetkit
