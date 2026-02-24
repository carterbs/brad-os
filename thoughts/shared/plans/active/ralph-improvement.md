# Title
Expand CalendarViewModelTests for date-filtered activity retrieval and recent-activity ordering

## Why
`History` is graded with an explicit gap: filter logic is still untested (`docs/quality-grades.md:36`). `HistoryView` relies on `CalendarViewModel.activitiesForDate(_:filter:)` for day detail filtering (`ios/BradOS/BradOS/Views/History/HistoryView+Components.swift:117`), and `HealthView` relies on `recentActivities(limit:)` for “Recent Activity” ordering (`ios/BradOS/BradOS/Views/Health/HealthView.swift:111`). We need direct unit tests to lock this behavior down.

## What
Add focused tests in `CalendarViewModelTests.swift` for the two currently under-covered methods in `CalendarViewModel`:
- `public func activitiesForDate(_ date: Date, filter: ActivityType?) -> [CalendarActivity]` (`CalendarViewModel.swift:112`)
- `public func recentActivities(limit: Int = 3) -> [CalendarActivity]` (`CalendarViewModel.swift:129`)

Implementation details for the test expansion:
1. Introduce local test helpers in `CalendarViewModelTests` to make fixtures deterministic and readable.
- `private func makeDate(year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0) -> Date`
- `private func makeActivity(id: String, type: ActivityType, date: Date, completedAt: Date? = nil) -> CalendarActivity`
- `private func key(for date: Date) -> String` (same `yyyy-MM-dd` formatter shape used by `activitiesForDate(_:)`)

2. Build explicit fixture data with mixed activity types and mixed `completedAt` presence.
- Same-day set for filter tests: workout + stretch + meditation on one key.
- Cross-day set for ordering tests: at least 4 activities with distinct effective timestamps (`completedAt ?? date`) so ordering is unambiguous.

3. Add `activitiesForDate(_:filter:)` behavior tests.
- `filter: nil` returns all activities for that date.
- `filter: .workout` returns only workout entries for that date.
- `filter: .stretch` and `filter: .meditation` each return only matching type.
- Unknown date key returns empty even when a filter is passed.
- Non-matching filter for an existing date returns empty.

4. Add `recentActivities(limit:)` behavior tests.
- Returns activities sorted descending by `(completedAt ?? date)` across all days (not per-day order).
- Uses `date` fallback when `completedAt` is nil.
- Honors explicit limit (example: `limit: 2` returns top 2 IDs in expected order).
- Honors default limit of 3.
- Returns all available activities if `limit` exceeds total count.
- Returns empty for no activities.

5. Keep existing tests unchanged except for harmless fixture/helper additions and test reordering for readability.

## Files
- `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/CalendarViewModelTests.swift`
  - Add fixture helper methods for deterministic dates, keyed `activitiesByDate` setup, and activity construction.
  - Add new `@Test` cases covering filter behavior for `activitiesForDate(_:filter:)`.
  - Add new `@Test` cases covering ordering and limit behavior for `recentActivities(limit:)`.
  - Keep test style consistent with current Swift Testing usage (`@Suite`, `@Test`, `#expect`, `@MainActor`).

## Tests
Add the following concrete unit tests in `CalendarViewModelTests`:
1. `activitiesForDate with nil filter returns all activities for the day`
- Setup one day containing 3 mixed activity types.
- Assert returned count is 3 and IDs/types match expected set.

2. `activitiesForDate with workout filter returns only workout activities`
- Setup one day with workout/stretch/meditation.
- Assert only workout IDs are returned.

3. `activitiesForDate with stretch filter excludes non-stretch activities`
- Same fixture shape; assert only stretch IDs.

4. `activitiesForDate with meditation filter excludes non-meditation activities`
- Same fixture shape; assert only meditation IDs.

5. `activitiesForDate with filter returns empty when date has no activities`
- Query an unseeded date; assert empty.

6. `activitiesForDate with unmatched filter returns empty`
- Seed date with only workout activity; query with `.stretch`; assert empty.

7. `recentActivities sorts by completedAt when present and by date when completedAt is nil`
- Seed activities across multiple day keys, with mixed `completedAt` nil/non-nil.
- Assert exact returned ID order reflects descending `(completedAt ?? date)`.

8. `recentActivities default limit returns top three`
- Seed at least 4 sorted candidates.
- Assert count is 3 and IDs equal first three expected.

9. `recentActivities applies explicit limit`
- Using same data, call `limit: 2`.
- Assert count is 2 and IDs equal top two expected.

10. `recentActivities returns all when limit exceeds total` and `recentActivities returns empty when no data`
- Assert both boundary conditions explicitly.

## QA
After implementation, verify in this order:
1. Targeted unit suite:
- `cd ios/BradOS/BradOSCore && swift test --filter CalendarViewModelTests`
- Confirm new test names execute and pass, especially ordering/filter cases.

2. Full BradOSCore package tests:
- `cd ios/BradOS/BradOSCore && swift test`
- Confirm no regressions in other ViewModel/model tests.

3. iOS lint/build gate for Swift changes (SwiftLint runs via build plugin):
- `cd ios/BradOS && xcodegen generate && cd ../..`
- `xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath ~/.cache/brad-os-derived-data -skipPackagePluginValidation build`
- Confirm build succeeds with zero SwiftLint violations.

4. Behavior spot-check via assertions in test output:
- Verify expected ordered IDs in `recentActivities` tests match fixture timestamps.
- Verify each `ActivityType` filter path has at least one passing assertion proving exclusion of other types.

## Conventions
Apply these project conventions while implementing:
- Keep testing comprehensive and do not skip/disable/focus tests (`docs/conventions/testing.md:5`, `docs/conventions/testing.md:103`).
- Keep assertions meaningful in every added test (`docs/conventions/testing.md:115`).
- Follow existing Swift test file style in this package: `Testing` framework macros (`@Suite`, `@Test`, `#expect`) and `@MainActor` on ViewModel tests.
- Respect SwiftLint constraints for file/type/function length and no inline `swiftlint:disable` directives (`docs/conventions/ios-swift.md:20`, `docs/conventions/ios-swift.md:29`).
- Because iOS files are touched, include an `xcodebuild` build pass to run SwiftLint plugin checks (`docs/guides/ios-build-and-run.md`).
