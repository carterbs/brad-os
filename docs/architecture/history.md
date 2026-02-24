# History

## Data Flow
HistoryView -> CalendarViewModel (BradOSCore) -> APIClient -> calendarApp handler -> CalendarService -> Firestore

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/History/HistoryView.swift` (main view with filters + health trends)
  - `ios/BradOS/BradOS/Views/History/HistoryView+Components.swift` (MonthCalendarView, DayDetailSheet, FilterChip)
  - `ios/BradOS/BradOS/Views/History/DayActivityCard.swift`
- **ViewModels:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/CalendarViewModel.swift` (shared with CalendarView)
- **Models:** `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/CalendarActivity.swift` (ActivityType, CalendarActivity, CalendarDayData)

## Backend Layer
History reuses the same backend as Calendar:
- **Handlers:** `packages/functions/src/handlers/calendar.ts`
- **Services:** `packages/functions/src/services/calendar.service.ts`
- **Types:** `packages/functions/src/types/calendar.ts`

## Key Endpoints
- `GET /calendar/:year/:month?tz=<offset>` -- Same endpoint as Calendar

## Notes
- History and Calendar share the same CalendarViewModel and backend endpoint
- Key difference: HistoryView adds activity type filtering (All, Lifting, Stretch, Meditate) via `selectedFilter`
- HistoryView includes a "Health Trends" section linking to HRV, RHR, and Sleep history views (same as Profile)
- DayDetailSheet supports navigation to workout detail (via AppState) and stretch session detail (via NavigationDestination)
- MonthCalendarView accepts an optional `filter: ActivityType?` to show/hide activity dots
- FilterChip component provides the horizontal filter pill UI

## See Also
- [Calendar](calendar.md) — shares calendar backend and ViewModel
- [Lifting](lifting.md) — workout history entries
- [Stretching](stretching.md) — stretch session history entries
- [Meditation](meditation.md) — meditation session history entries
