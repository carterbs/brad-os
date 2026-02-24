# Title
Add BradOSCore unit tests for BarcodeWalletViewModel CRUD success/failure state transitions

## Why
`BarcodeWalletViewModel` drives user-visible loading/saving/error states for the Barcode Wallet screen, but it currently has no unit tests. Adding coverage for load/create/update/delete success and failure paths prevents regressions in `isLoading`, `isSaving`, and `error` behavior that the UI depends on.

## What
Build a new Swift Testing suite for `BarcodeWalletViewModel` that verifies both final outcomes and in-flight transitions for each async operation.

Current behavior to lock down:
- `loadBarcodes()` sets `isLoading = true` and clears `error` before awaiting the API, then sets `isLoading = false` and either updates `barcodes` or sets `error` (`ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/BarcodeWalletViewModel.swift:26`).
- `createBarcode(...)` sets `isSaving = true`, clears `error`, appends on success, returns `Bool`, and sets `error` on failure (`.../BarcodeWalletViewModel.swift:41`).
- `updateBarcode(...)` sets `isSaving = true`, clears `error`, updates matching local barcode on success, returns `Bool`, and sets `error` on failure (`.../BarcodeWalletViewModel.swift:70`).
- `deleteBarcode(id:)` clears `error`, deletes remotely, removes local item on success, and sets `error` on failure; it does not use `isSaving` (`.../BarcodeWalletViewModel.swift:101`).

Implementation approach:
1. Add a new test file using Swift Testing (`@Suite`, `@Test`, `#expect`) and `@MainActor`, matching existing ViewModel tests (for example, `ProfileViewModelTests.swift` and `ExercisesViewModelTests.swift`).
2. Use `MockAPIClient` for deterministic success/failure setup:
- Success fixtures through `mockBarcodes` (`ios/BradOS/BradOSCore/Sources/BradOSCore/Services/MockAPIClient.swift:28`, `:497`, `:512`, `:530`, `:549`).
- Failure fixtures through `MockAPIClient.failing(...)` (`.../MockAPIClient.swift:719`).
- In-flight transition assertions by setting `mock.delay` / `withDelay(...)` (`.../MockAPIClient.swift:13`, `:62`, `:712`) and starting calls with `async let` so assertions can run before awaiting completion.
3. Include local fixture helpers inside the test file for readability and stable assertions, e.g.:
- `private func makeBarcode(id: String, label: String, value: String, barcodeType: BarcodeType = .code128, color: String = "#E879F9", sortOrder: Int = 0) -> Barcode`
- Optional helper for fixed timestamps (`Date(timeIntervalSince1970: ...)`) to avoid brittle comparisons.
4. Validate transitions explicitly, not just end state:
- Pre-seed `vm.error = "Previous error"` and verify each operation clears it at start.
- Assert `isLoading`/`isSaving` is `true` during delayed in-flight work, then `false` after completion.
- Assert operation-specific failure strings exactly:
  - `"Failed to load barcodes"`
  - `"Failed to create barcode"`
  - `"Failed to update barcode"`
  - `"Failed to delete barcode"`

## Files
- `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/BarcodeWalletViewModelTests.swift` (create)
- Add a new `@Suite("BarcodeWalletViewModel")` with focused unit tests for load/create/update/delete success and failure paths.
- Add small local fixture helpers (`makeBarcode`, optional `fixedDate`) in this file only.
- No production/source changes are required for this task.

## Tests
Add these concrete test cases (or equivalent names) in `BarcodeWalletViewModelTests.swift`:

1. `initial state is empty and idle`
- Verify `barcodes` is empty, `isLoading == false`, `isSaving == false`, `error == nil`.

2. `loadBarcodes success updates list and clears loading/error`
- Seed `mock.mockBarcodes` with known fixtures.
- Start `async let load = vm.loadBarcodes()` with delay enabled.
- While in flight: `#expect(vm.isLoading == true)` and `#expect(vm.error == nil)`.
- After await: `#expect(vm.isLoading == false)`, `#expect(vm.error == nil)`, and `#expect(vm.barcodes == expected)`.

3. `loadBarcodes failure sets error and clears loading`
- Use failing mock + delay; pre-set `vm.error` to a stale value.
- While in flight: `isLoading == true`, `error == nil`.
- After await: `isLoading == false`, `error == "Failed to load barcodes"`, and prior `barcodes` remain unchanged.

4. `createBarcode success toggles isSaving and appends barcode`
- Seed `vm.barcodes` / `mock.mockBarcodes` with initial data.
- Start delayed create via `async let result = vm.createBarcode(...)`.
- While in flight: `isSaving == true`, `error == nil`.
- After await: `result == true`, `isSaving == false`, `error == nil`, `barcodes.count` increments, appended barcode fields match input label/value/type/color.

5. `createBarcode failure toggles isSaving and sets error`
- Use failing mock + delay and pre-set stale `error`.
- While in flight: `isSaving == true`, `error == nil`.
- After await: `result == false`, `isSaving == false`, `error == "Failed to create barcode"`, `barcodes` unchanged.

6. `updateBarcode success toggles isSaving and updates matching local barcode`
- Seed one known barcode in both view model and mock.
- Call delayed `updateBarcode(id:..., label:..., value:..., barcodeType:..., color:...)`.
- While in flight: `isSaving == true`, `error == nil`.
- After await: `result == true`, `isSaving == false`, `error == nil`, and matching barcode has updated fields.

7. `updateBarcode failure toggles isSaving and sets error`
- Use failing mock + delay (or missing id that triggers API notFound) with stale `error` pre-set.
- While in flight: `isSaving == true`, `error == nil`.
- After await: `result == false`, `isSaving == false`, `error == "Failed to update barcode"`, local data unchanged.

8. `deleteBarcode success clears error and removes local barcode`
- Seed two barcodes; pre-set `vm.error` to stale value.
- Call `deleteBarcode(id:)` for one id.
- Verify `error` cleared to `nil` at operation start and remains nil on success.
- Verify deleted barcode is removed from `vm.barcodes`.
- Verify `isSaving` remains `false` (delete path does not set saving state).

9. `deleteBarcode failure sets error and keeps local barcode`
- Use failing mock; pre-seed local barcodes and stale error.
- Call `deleteBarcode(id:)`.
- Verify final `error == "Failed to delete barcode"` and local list is unchanged.
- Verify `isSaving` remains `false`.

## QA
1. Run focused BradOSCore tests for the new suite:
- `cd ios/BradOS/BradOSCore && swift test --filter BarcodeWalletViewModelTests`
- Confirm all new success/failure transition tests execute and pass.

2. Run the full BradOSCore package tests to catch regressions:
- `cd ios/BradOS/BradOSCore && swift test`

3. Run iOS project build gate so SwiftLint plugin executes (required for iOS-file changes):
- `cd ios/BradOS && xcodegen generate && cd ../..`
- `xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath ~/.cache/brad-os-derived-data -skipPackagePluginValidation build`

4. Manual app smoke check (ensures no behavior drift outside tests):
- Launch app in simulator, open Barcode Wallet, and verify list still loads plus add/edit/delete still function.
- Confirm save button disable behavior still aligns with `isSaving` during add/edit flows.

## Conventions
- Use Swift Testing with explicit assertions (`Testing`, `@Suite`, `@Test`, `#expect`) consistent with existing BradOSCore tests.
- Do not skip/focus tests (`docs/conventions/testing.md`: test policy and focused test rules).
- Ensure each test has meaningful assertions for both transition and final state (`docs/conventions/testing.md`: test quality policy).
- Respect SwiftLint constraints and avoid inline `swiftlint:disable` directives (`docs/conventions/ios-swift.md`).
- Because iOS Swift files are added, include `xcodebuild` validation to run SwiftLint build-tool checks (`docs/guides/ios-build-and-run.md:29-43`).
- Keep changes scoped to BradOSCore test target conventions (`ios/BradOS/BradOSCore/Package.swift:15`).
