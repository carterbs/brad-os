**Title**: Add first-cycle `CyclingViewModel` iOS unit tests for concurrent `loadData()` fan-out, weekly session matching, FTP save/load, and block completion

**Why**: Cycling is still tracked as having zero iOS tests in quality grading, and `CyclingViewModel` contains core user-facing logic (`loadData`, session completion matching, FTP flows, and block completion) that can regress silently without direct app-layer test coverage.

**What**
Build out `BradOSTests` coverage for the existing `CyclingViewModel` behaviors at:
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift:45` (`sessionsCompletedThisWeek`)
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift:99` (`loadData()` concurrent fetch fan-out)
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift:315` (`saveFTP`)
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift:337` (`loadFTPHistory`)
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift:287` (`completeCurrentBlock`)

Implementation scope (tests + test doubles only):
1. Expand cycling test doubles so tests can observe API call order/counts/arguments and gate async responses.
2. Add a deterministic `loadData()` fan-out test that proves all six fetch endpoints start before any are released.
3. Add/strengthen `sessionsCompletedThisWeek` matching tests for ordering, current-week filtering, and non-reuse behavior.
4. Extend FTP tests to cover both save request formatting and history load success/failure.
5. Add block completion success/failure/no-op coverage.

No production logic changes are planned unless a testability seam is strictly required to make assertions deterministic.

**Files**
1. `ios/BradOS/BradOSTests/Helpers/AppTestDoubles.swift` (modify)
- Extend `MockCyclingAPIClient` with explicit observability hooks used by tests:
  - Add call tracking enum and counters, e.g.:
    - `enum CyclingAPICall: String, CaseIterable { ... }`
    - `private(set) var callCounts: [CyclingAPICall: Int]`
  - Add argument capture fields:
    - `private(set) var lastCreateFTPRequest: (value: Int, date: String, source: String)?`
    - `private(set) var lastCompleteBlockID: String?`
    - `private(set) var lastActivitiesLimit: Int?`
  - Add optional async interception hook for fan-out gating:
    - `var onCall: (@Sendable (CyclingAPICall) async -> Void)?`
  - Ensure each cycling API method updates counter/captures before returning the configured result.
- Add a tiny async gate helper (test-only) for fan-out assertions, e.g. an `actor` with:
  - expected call set
  - started call set
  - `waitUntilAllStarted(timeoutNanoseconds:) async -> Bool`
  - `waitUntilReleased() async`
  - `releaseAll()`
- Keep helpers reusable and SwiftLint-compliant (no inline suppression, no long methods).

2. `ios/BradOS/BradOSTests/ViewModels/CyclingViewModelTests.swift` (modify)
- Keep existing tests that already pass.
- Add grouped tests for missing behaviors:
  - `loadData` fan-out + population
  - additional `sessionsCompletedThisWeek` edge matching
  - FTP history load paths
  - block completion paths
- Prefer deterministic fixtures (`fixedDate`, `dateInCurrentWeek`) over ad hoc `Date()` where possible.

3. `docs/quality-grades.md` (optional, if this task includes grade bookkeeping)
- Update Cycling iOS test count from `0` to reflect the new `BradOSTests` suite status.
- If the grading table is generated elsewhere, skip direct edits and leave a note in PR/summary instead.

**Tests**
Add/adjust the following `CyclingViewModelTests` cases (Swift Testing):
1. `loadData fans out all cycling fetch calls concurrently before completion`
- Arrange: configure `MockCyclingAPIClient` with non-empty results for activities/training-load/FTP/block/VO2max/EF; attach gate expecting six `loadData` calls.
- Act: start `vm.loadData()` in a task, wait for gate to report all expected calls started, assert `vm.isLoading == true`, then release gate and await completion.
- Assert:
  - all six calls were observed exactly once (`getCyclingActivities`, `getCyclingTrainingLoad`, `getCurrentFTP`, `getCurrentBlock`, `getVO2Max`, `getEFHistory`)
  - `lastActivitiesLimit == 30`
  - view-model state populated (`activities`, `trainingLoad`, `currentFTP`, `currentBlock`, `vo2maxHistory`, `efHistory`)
  - chart derivations ran (`tssHistory` and `loadHistory` are non-nil)
  - `isLoading == false` after completion.

2. `sessionsCompletedThisWeek ignores previous-week activities and stops at first unmatched session`
- Arrange: weekly sessions requiring ordered types; include an activity from last week plus out-of-order current-week rides.
- Assert `sessionsCompletedThisWeek` equals only the contiguous matched prefix.

3. `sessionsCompletedThisWeek does not reuse one activity for multiple sessions`
- Arrange: two same-type sessions but only one matching activity.
- Assert count is `1`.

4. `saveFTP success sends formatted payload and updates FTP fields`
- Assert existing behavior (`true`, fields updated, `error == nil`) plus captured request:
  - `lastCreateFTPRequest?.value` matches input
  - `lastCreateFTPRequest?.date == "yyyy-MM-dd"` formatted date
  - `lastCreateFTPRequest?.source` matches argument.

5. `loadFTPHistory success returns API history entries`
- Arrange non-empty `ftpHistoryResult`.
- Assert returned array matches configured entries.

6. `loadFTPHistory failure returns empty array`
- Arrange failing `ftpHistoryResult`.
- Assert result is `[]` and no crash.

7. `completeCurrentBlock success calls API and marks block completed`
- Arrange active `currentBlock`.
- Assert `lastCompleteBlockID` is current block id, `currentBlock?.status == .completed`, and `error == nil`.

8. `completeCurrentBlock failure keeps block active and sets user-facing error`
- Arrange failing `completeBlockResult`.
- Assert status remains `.active` and `error` contains `"Failed to complete block"`.

9. `completeCurrentBlock with nil currentBlock is a no-op`
- Assert API completion call count stays zero and no error is set.

**QA**
After implementation, exercise both targeted tests and runtime behavior:
1. Run focused cycling tests:
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  -only-testing:BradOSTests/CyclingViewModelTests \
  test
```
2. Run full app test bundle to ensure no collateral breakage in shared helpers:
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  -only-testing:BradOSTests \
  test
```
3. Build app target (SwiftLint plugin + compile safety):
```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build
```
4. Manual behavior smoke-check on simulator:
- Open Cycling tab and confirm it loads without errors (covers `loadData` runtime path).
- Open Profile -> FTP, save an FTP value, and verify updated value/history display.
- Open Profile -> Training Block setup with an active block and trigger “complete block early”; verify UI reflects completion and no regressions.

**Conventions**
1. `CLAUDE.md`
- Follow app-layer TDD intent and keep changes narrowly scoped to test coverage.
- QA is mandatory: include command-line and simulator checks, not tests alone.

2. `docs/conventions/testing.md`
- Use Swift Testing (`import Testing`, `@Suite`, `@Test`, `#expect`), never focused/skipped tests.
- Every new test must include meaningful assertions.

3. `docs/conventions/ios-swift.md`
- Keep SwiftLint-clean code; do not add `swiftlint:disable` comments.
- Use the existing shared app architecture and avoid adding alternate networking stacks.

4. `docs/guides/ios-build-and-run.md`
- Use `-project ios/BradOS/BradOS.xcodeproj` (not workspace), include `-skipPackagePluginValidation`, and avoid `-sdk` in CLI builds/tests.
