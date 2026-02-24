**Title**: Add deterministic iOS unit coverage for `WeightGoalViewModel` regression math and goal persistence flows

**Why**: `WeightGoalViewModel` drives Profile/Health weight-goal UX, but its core prediction math (`updateTrend`/`updatePrediction`) and persistence paths (`loadWeightGoal`/`saveGoal`) are only lightly asserted today, leaving high-risk logic open to silent regressions.

**What**
1. Expand test observability for weight-goal API interactions (test-only).
- Target code paths:
  - `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift:224` (`updateTrend`)
  - `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift:235` (`updatePrediction`)
  - `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift:189` (`loadWeightGoal` via `loadData`)
  - `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift:316` (`saveGoal`)
- Add call/request capture in `MockWeightGoalAPIClient` so tests can assert payloads and call counts instead of only final UI state.

2. Strengthen regression/prediction math tests with numeric assertions (not just nil/non-nil checks).
- Validate exact/approx slope-derived outputs with tolerances (e.g., `abs(actual - expected) < 0.001`).
- Cover both weight-loss and weight-gain goals.
- Cover the 28-day regression window behavior (ensure older points do not skew trend).
- Cover `updatePrediction` fallback branch when `trendSlope` is not precomputed and only 3-6 points are available.
- Cover near-zero slope guard (`abs(dailyRate) <= 0.001`) returning not-on-track with `predictedDate == nil`.

3. Add explicit save/load behavior tests for persisted goals.
- Load path: `loadData()` hydrates `existingGoal`, `targetWeight`, and parsed `targetDate` from `getWeightGoal()`.
- Save path: `saveGoal()` sends correctly formatted payload:
  - `targetDate` formatted as `yyyy-MM-dd`
  - `startWeightLbs` / `startDate` reuse existing goal baseline when editing an existing goal
  - baseline falls back to current weight (or latest smoothed weight) when creating first goal
- Ensure invalid save inputs are no-op (no API call, no success flag).

4. Keep scope constrained to tests/test doubles unless a hard testability seam is required.
- No production behavior change is planned.
- If deterministic assertions require a seam (for example, clock injection), add minimal non-behavioral constructor injection and cover it with tests.

**Files**
1. `ios/BradOS/BradOSTests/Helpers/AppTestDoubles.swift` (modify)
- Extend `MockWeightGoalAPIClient` with test observability fields:
  - `private(set) var getLatestWeightCallCount: Int`
  - `private(set) var getWeightHistoryCallCount: Int`
  - `private(set) var getWeightGoalCallCount: Int`
  - `private(set) var saveWeightGoalCallCount: Int`
  - `private(set) var lastWeightHistoryDays: Int?`
  - `private(set) var lastSaveWeightGoalRequest: (targetWeightLbs: Double, targetDate: String, startWeightLbs: Double, startDate: String)?`
- Update protocol method implementations to increment counters/capture arguments before returning configured results.

2. `ios/BradOS/BradOSTests/ViewModels/WeightGoalViewModelTests.swift` (modify)
- Keep existing tests, then add deterministic fixture helpers:
  - `private func makeWeightEntries(startDate:startWeight:count:dailyDelta:) -> [WeightHistoryEntry]`
  - `private func makePiecewiseWeightPoints(...) -> [WeightChartPoint]` for 28-day-window assertions
- Add/expand tests listed in the **Tests** section below.

3. `ios/BradOS/BradOS/ViewModels/WeightGoalViewModel.swift` (only if strictly needed)
- Optional minimal test seam only (for example `nowProvider: () -> Date` defaulting to `Date.init`) if exact-date assertions cannot be made stable without brittle timing assumptions.
- Do not change math or persistence behavior.

**Tests**
Write/adjust Swift Testing cases in `WeightGoalViewModelTests`:
1. `updateTrend computes expected negative slope from linear data`
- Arrange 28+ smoothed points with known daily delta (example `-0.4 lbs/day`).
- Assert `trendSlope` is non-nil and within tolerance of expected slope.

2. `updateTrend uses only the most recent 28 points`
- Arrange piecewise history where first segment trends up and last 28 points trend down.
- Assert slope matches recent segment, proving suffix-window behavior.

3. `updatePrediction computes daysRemaining and weeklyRate for loss goal`
- Arrange linear downward trend, target below current, future target date.
- Assert:
  - `prediction.predictedDate != nil`
  - `abs(prediction.weeklyRateLbs - expectedWeeklyRate) < tolerance`
  - `prediction.daysRemaining == expectedIntDays`
  - `prediction.isOnTrack` matches target date comparison.

4. `updatePrediction supports gain goals when trend is positive`
- Arrange current below target with positive slope.
- Assert on-track prediction exists and numeric fields are consistent.

5. `updatePrediction fallback path works when trendSlope is nil but >=3 points exist`
- Do not call `updateTrend`; provide 3-6 smoothed points.
- Assert prediction still computes from internal regression fallback.

6. `updatePrediction returns not-on-track when slope is near zero`
- Arrange effectively flat trend.
- Assert `predictedDate == nil`, `daysRemaining == nil`, `isOnTrack == false`.

7. `loadData hydrates existing goal into target fields`
- Configure mock `weightGoalResult` with known `WeightGoalResponse` and minimal weight history/latest weight responses.
- Assert:
  - `existingGoal` set
  - `targetWeight` formatted from goal (`"%.0f"` behavior)
  - `isoDateString(targetDate)` equals response date
  - API calls were made (`getWeightGoalCallCount == 1`, `lastWeightHistoryDays == 365`).

8. `saveGoal sends formatted payload for new goal baseline`
- Arrange no `existingGoal`, set `currentWeight`, `targetWeight`, `targetDate`.
- Assert `lastSaveWeightGoalRequest` captured expected values and `saveSuccess == true`.

9. `saveGoal reuses existing start baseline when updating goal`
- Arrange `existingGoal` with known `startDate`/`startWeightLbs` and different current weight.
- Assert request reuses existing baseline fields rather than overwriting from current weight/date.

10. `saveGoal no-ops for invalid input`
- Cases: non-numeric `targetWeight`; no current weight and empty smoothed history.
- Assert `saveWeightGoalCallCount == 0`, `saveSuccess == false`.

**QA**
1. Generate project if needed:
```bash
cd ios/BradOS && xcodegen generate && cd ../..
```
2. Run focused test suite for this work:
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  -only-testing:BradOSTests/WeightGoalViewModelTests \
  test
```
3. Run full iOS unit bundle to catch helper regressions:
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  -only-testing:BradOSTests \
  test
```
4. Build app target (SwiftLint plugin + compile safety):
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build
```
5. Manual runtime smoke (Profile/Health confidence check):
- Launch app in simulator.
- Navigate to `Profile -> Weight Goal`.
- Confirm existing saved goal pre-fills target weight/date.
- Change target weight/date, save, leave screen, return, and confirm persisted values reload.
- Verify prediction card updates and remains coherent for both decreasing and increasing trends (using seeded/mock account states if available).

**Conventions**
1. `CLAUDE.md`
- Use TDD intent: add tests first, then only minimal code needed.
- QA is mandatory; include simulator exercise, not just assertions.
- For iOS edits, verify with `xcodebuild` and keep SwiftLint clean.

2. `docs/conventions/testing.md`
- Use Swift Testing (`import Testing`, `@Suite`, `@Test`, `#expect`).
- No `.only`, no skipped tests, and every test must have meaningful assertions.

3. `docs/conventions/ios-swift.md`
- No `swiftlint:disable` comments.
- Keep helper code concise and within lint limits.

4. `docs/guides/ios-build-and-run.md`
- Use `-project ios/BradOS/BradOS.xcodeproj` (not workspace).
- Include `-skipPackagePluginValidation`.
- Do not pass `-sdk` in CLI builds/tests.
