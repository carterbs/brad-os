# Calendar

## Data Flow
CalendarView -> CalendarViewModel (BradOSCore) -> APIClient -> calendarApp handler -> CalendarService -> Firestore

## iOS Layer
- **Views:** `ios/BradOS/BradOS/Views/Calendar/CalendarView.swift`
- **Shared Components:** `MonthCalendarView`, `DayDetailSheet` (in `Views/History/HistoryView+Components.swift`)
- **ViewModels:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/CalendarViewModel.swift`
- **Models:** `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/CalendarActivity.swift` (ActivityType, CalendarActivity, ActivitySummary, CalendarDayData)

## Backend Layer
- **Handlers:** `packages/functions/src/handlers/calendar.ts`
- **Services:** `packages/functions/src/services/calendar.service.ts`
- **Types:** `packages/functions/src/types/calendar.ts`
- **Tests:** `packages/functions/src/handlers/calendar.test.ts`, `packages/functions/src/services/calendar.service.test.ts`

## Firestore Collections
Calendar is read-only -- it aggregates data from:
- `users/{uid}/workouts` -- completed workouts
- `users/{uid}/stretchSessions` -- completed stretch sessions
- `users/{uid}/meditationSessions` -- completed meditation sessions
- `users/{uid}/cyclingActivities` -- completed cycling sessions

## Key Endpoints
- `GET /calendar/:year/:month?tz=<offset>` -- Get all activities for a month, grouped by day

## Notes
- Aggregates four activity types: workout, stretch, meditation, cycling
- Timezone-aware: accepts `tz` query param (minutes offset) to convert UTC timestamps to local dates
- `utcToLocalDate()` helper handles UTC-to-local date conversion
- CalendarView has no activity filter (shows all); HistoryView reuses CalendarViewModel with filter support
- CalendarActivity model lives in BradOSCore (shared between app and widget)

## See Also
- [History](history.md) — reuses Calendar backend/ViewModel for history views
- [Lifting](lifting.md) — workout dates shown on calendar
- [Stretching](stretching.md) — stretch session dates on calendar
- [Meditation](meditation.md) — meditation dates on calendar
