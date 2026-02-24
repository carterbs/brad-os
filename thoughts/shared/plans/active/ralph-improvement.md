**Title**: Add cycling activities to calendar aggregation and surface cycling in Calendar/History models

**Why**: The current calendar pipeline omits cycling completions, so History/Calendar under-reports activity and leaves the tracked “Calendar missing cycling activities” debt unresolved.

**What**
1. Extend the calendar domain contract to support cycling as a first-class calendar activity.
- In `packages/functions/src/types/calendar.ts`:
  - Extend `ActivityType` to include `'cycling'`.
  - Add `CyclingActivitySummary` and include it in `ActivitySummary`.
  - Add `isCyclingActivity(activity)` type guard.
  - Extend `CalendarDayData.summary` with `hasCycling: boolean`.
- Proposed summary shape:
  - `durationMinutes: number`
  - `tss: number`
  - `cyclingType: CyclingActivityType` (reuse existing type from `types/cycling.ts`; do not redefine)

2. Aggregate cycling entries in `CalendarService.getMonthData()` alongside workouts/stretch/meditation.
- In `packages/functions/src/services/calendar.service.ts`:
  - Import `getCyclingActivities` from `firestore-cycling.service`.
  - Fetch cycling activities for the calendar user (`default-user`, matching current cycling handlers) in parallel with existing repository queries.
  - For each cycling activity:
    - Convert `activity.date` (UTC ISO) to local day via existing `utcToLocalDate()`.
    - Include only entries whose local date is within the current month boundaries.
    - Emit a `CalendarActivity` with:
      - `id: cycling-${activity.id}`
      - `type: 'cycling'`
      - `date: <local YYYY-MM-DD>`
      - `completedAt: activity.date`
      - `summary: { durationMinutes, tss, cyclingType }`
  - Update day-summary aggregation logic to initialize and set `hasCycling`.
- Keep existing ordering behavior (sort by `completedAt`) unchanged.

3. Update iOS calendar/history model + UI rendering for the new activity type.
- In BradOSCore model (`CalendarActivity.swift`):
  - Add `ActivityType.cycling` with display/icon metadata (`"Cycling"`, `"figure.outdoor.cycle"`).
  - Add cycling fields to `ActivitySummary` decode/init:
    - `durationMinutes: Int?`
    - `tss: Int?`
    - `cyclingType: String?`
  - Add `CalendarDayData.hasCycling` computed property.
  - Add one cycling mock activity in `mockActivities`.
- In SwiftUI layer:
  - Map `ActivityType.cycling` to `Theme.cycling` in `BradOSCore+UI.swift`.
  - Add `.cycling` branches to activity-card rendering switches:
    - `DayActivityCard` cycling detail block (type + duration/TSS text)
    - `HistoryView+Components` day-tap handler (cycling closes sheet; no navigation)
    - `HealthView` recent-activity row title/subtitle formatting for cycling

4. Keep architecture docs accurate after implementation.
- Update `docs/architecture/calendar.md` notes from “three activity types” to include cycling.

Concrete backend payload example after change:
```json
{
  "id": "cycling-ride-123",
  "type": "cycling",
  "date": "2026-02-12",
  "completedAt": "2026-02-12T18:45:00.000Z",
  "summary": {
    "durationMinutes": 52,
    "tss": 67,
    "cyclingType": "threshold"
  }
}
```

**Files**
1. `packages/functions/src/types/calendar.ts` (modify)
- Add cycling activity type + summary interface + union/type guard.
- Add `hasCycling` to day summary type.

2. `packages/functions/src/services/calendar.service.ts` (modify)
- Import cycling service function and cycling summary type.
- Add cycling fetch/transform/grouping path inside `getMonthData(year, month, timezoneOffset?)`.
- Ensure day summary toggles `hasCycling`.

3. `packages/functions/src/services/calendar.service.test.ts` (modify)
- Mock `getCyclingActivities` and add cycling-focused service tests.
- Update any expected summary structures impacted by `hasCycling`.

4. `packages/functions/src/handlers/calendar.test.ts` (modify)
- Update `createTestDayData()` summary shape to include `hasCycling`.
- Add/adjust handler assertions for mixed-type responses that include cycling.

5. `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/CalendarActivity.swift` (modify)
- Add `.cycling` enum case, display/icon metadata, `ActivitySummary` cycling fields, `hasCycling`, and mock entry.

6. `ios/BradOS/BradOS/Extensions/BradOSCore+UI.swift` (modify)
- Add `.cycling -> Theme.cycling` color mapping.

7. `ios/BradOS/BradOS/Views/History/DayActivityCard.swift` (modify)
- Add cycling branch in activity detail switch and cycling summary formatting.

8. `ios/BradOS/BradOS/Views/History/HistoryView+Components.swift` (modify)
- Add `.cycling` switch handling in `handleActivityTap`.

9. `ios/BradOS/BradOS/Views/Health/HealthView.swift` (modify)
- Add cycling branch for recent-activity title/subtitle switches.

10. `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/CalendarViewModelTests.swift` (modify)
- Add cycling filter/selection test coverage.

11. `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/CalendarActivityTests.swift` (new)
- Add model-level decoding/assertion tests for cycling summary fields and `hasCycling` behavior.

12. `docs/architecture/calendar.md` (modify)
- Update activity-type notes to include cycling.

**Tests**
1. `packages/functions/src/services/calendar.service.test.ts`
- `getMonthData includes cycling activities in days map`
- `cycling activities set hasCycling=true and increment totals`
- `cycling activity ID is prefixed with cycling-`
- `cycling UTC timestamp is grouped by local day using tz offset`
- `service calls getCyclingActivities('default-user')`

2. `packages/functions/src/handlers/calendar.test.ts`
- Day summary helper includes `hasCycling`.
- Mixed-activity handler response test asserts `hasCycling` toggles true when cycling item present.

3. `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/CalendarActivityTests.swift`
- Decodes a cycling `CalendarActivity` JSON payload and maps summary fields.
- `CalendarDayData.hasCycling` true/false behavior with mixed arrays.

4. `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/CalendarViewModelTests.swift`
- `shouldShowActivity(type:)` supports cycling filter.
- `activitiesForDate(_:filter:)` returns only cycling entries when `.cycling` filter is selected.

**QA**
1. Backend manual API verification (not only unit tests)
- Start Firebase emulators.
- Seed at least one `users/default-user/cyclingActivities` doc with a known UTC timestamp near a day boundary.
- Call `GET /calendar/{year}/{month}?tz={offset}` on `devCalendar` and verify:
  - cycling activity appears with `type: "cycling"`
  - activity is grouped into the correct local date
  - day summary includes `hasCycling: true`

2. iOS manual verification in simulator
- Launch app with data containing at least one cycling activity in the visible month.
- Open `Calendar` and `History`.
- Confirm:
  - cycling dot appears in calendar grid using cycling color
  - `History` shows a `Cycling` filter chip
  - selecting `Cycling` hides non-cycling dots/items
  - day sheet renders cycling card text (ride type + duration/TSS)
  - tapping cycling item dismisses sheet without broken navigation

3. Automated checks
- Functions: run targeted calendar tests, then `npm run validate`.
- iOS: run BradOSCore tests including new calendar model/viewmodel cases and perform a full app build.

**Conventions**
1. `CLAUDE.md`
- Read architecture map first (`docs/architecture/calendar.md`, `docs/architecture/cycling.md`).
- Follow TDD flow: tests first, then implementation.
- Perform real QA (endpoint + simulator), not just test execution.

2. `docs/conventions/typescript.md`
- No `any`; explicit return types on new/changed functions.
- Deduplicate types: import and reuse `CyclingActivityType` instead of creating a new string union.

3. `docs/conventions/testing.md`
- Use vitest with explicit imports.
- No skipped/focused tests.
- Add meaningful assertions for new cycling behavior.

4. `docs/conventions/ios-swift.md`
- Use shared theme tokens (`Theme.cycling`), not hardcoded colors.
- Keep switch statements exhaustive after adding new enum cases.
- Do not suppress lint rules.

5. `packages/functions/CLAUDE.md`
- Use Firebase logger APIs (no `console.*`) if any logging is added while touching calendar/cycling paths.
