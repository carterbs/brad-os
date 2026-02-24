# Title
Add BradOSCore unit tests for MealPlanViewModel session lifecycle, critique queue submission, shopping-list refresh, and error paths

## Why
`MealPlanViewModel` owns the core meal-planning state machine (`loadExistingSession`, `generatePlan`, `submitQueuedActions`/`sendCritique`, `finalize`) but currently lacks direct unit coverage. Regressions here would break user-visible plan loading, queued critique behavior, and shopping list correctness.

## What
Build a dedicated Swift Testing suite for `MealPlanViewModel` and add one small testability refactor so session-ID persistence can be tested without shared global state.

Implementation scope:
1. Add deterministic dependency injection for session-ID persistence in `MealPlanViewModel`.
- Current `savedSessionId` hard-codes `UserDefaults.standard` (`ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift:54-62`), which makes tests order-dependent.
- Update initializer and storage access to use `UserDefaultsProtocol`:
  - Add property: `private let userDefaults: UserDefaultsProtocol`
  - Update initializer signature to include:
    - `userDefaults: UserDefaultsProtocol = UserDefaults.standard`
  - Replace `UserDefaults.standard.*` in `savedSessionId` with `userDefaults.*`.
- Extend `UserDefaultsProtocol` to support `string(forKey:)` so `MealPlanViewModel` can read persisted session IDs through the protocol.

2. Add `MealPlanViewModelTests` covering the full flow surface.
- Behavior under test (source of truth):
  - `generatePlan()` (`MealPlanViewModel.swift:67-87`)
  - `loadExistingSession()` (`MealPlanViewModel.swift:91-142`)
  - `submitQueuedActions()` + `sendCritique()` (`MealPlanViewModel.swift:146-201`, `:283-287`)
  - `finalize()` (`MealPlanViewModel.swift:205-229`)
  - `updateShoppingList()` trigger points (`MealPlanViewModel.swift:78`, `:99`, `:110`, `:130`, `:174`, implementation at `:317-321`)

3. Use lightweight in-test doubles for cache observation and deterministic fixtures.
- Keep API mocking on `MockAPIClient` (existing meal-plan + recipe/ingredient support in `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/MockAPIClient.swift:557-620`).
- Add an in-file `RecordingMealPlanCacheService` test double implementing `MealPlanCacheServiceProtocol` to verify cache read/write/invalidate interactions.
- Use `MockUserDefaults` per test instance (after protocol update) to isolate persisted session state.

4. Cover shopping-list refresh via real `RecipeCacheService` + `ShoppingListBuilder` behavior.
- Provide test recipes/ingredients matching plan meal IDs so assertions validate actual `shoppingList` content, not just non-empty placeholders.
- Verify list refresh after generate/load/critique plan changes.

## Files
- `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift` (modify)
- Add `userDefaults` dependency injection to initializer.
- Route `savedSessionId` getter/setter through `userDefaults` instead of `UserDefaults.standard`.
- No behavioral changes beyond dependency wiring.

- `ios/BradOS/BradOSCore/Sources/BradOSCore/Protocols/UserDefaultsProtocol.swift` (modify)
- Add protocol requirement:
  - `func string(forKey defaultName: String) -> String?`
- Keep existing `UserDefaults` conformance via extension.

- `ios/BradOS/BradOSCore/Sources/BradOSCore/Protocols/MockUserDefaults.swift` (modify)
- Implement `string(forKey:)` in `MockUserDefaults`.
- Continue storing values in in-memory dictionary; return typed string when present.

- `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/MealPlanViewModelTests.swift` (create)
- New `@Suite("MealPlanViewModel")` with `@MainActor` async tests.
- Include local fixture helpers:
  - `makeMeal(...) -> Meal`
  - `makeIngredient(...) -> Ingredient`
  - `makeRecipe(...) -> Recipe`
  - `makeSession(id:isFinalized:plan:mealsSnapshot:history:) -> MealPlanSession`
  - `makePlanEntry(dayIndex:mealType:mealId:mealName:) -> MealPlanEntry`
- Include local test double:
  - `private final class RecordingMealPlanCacheService: MealPlanCacheServiceProtocol, @unchecked Sendable`

## Tests
Add the following concrete tests in `MealPlanViewModelTests.swift`:

1. `initial state is empty and idle`
- Verifies `session == nil`, `currentPlan.isEmpty`, `shoppingList.isEmpty`, `isLoading == false`, `isSending == false`, `error == nil`.

2. `loadExistingSession uses finalized disk cache before API`
- Seed `RecordingMealPlanCacheService.getCachedSession()` with finalized session.
- Use API client configured to fail globally.
- Assert cached session is loaded into `session/currentPlan`; `isLoading` ends false; no user-facing error.

3. `loadExistingSession uses saved session id when present`
- Seed `MockUserDefaults` key `"mealPlanSessionId"`.
- Configure `MockAPIClient.mockMealPlanSession` with matching id and recipe data.
- Assert session/plan loaded and shopping list populated.

4. `loadExistingSession falls back to latest session when no saved id`
- Use empty `MockUserDefaults`, configure `mockMealPlanSession` for latest fetch.
- Assert session and shopping list populate; finalized latest session is passed to `cacheService.cache(...)`.

5. `loadExistingSession latest failure leaves view model stable`
- No cache and no saved ID; API failing.
- Assert `isLoading == false`, `session == nil`, `currentPlan.isEmpty`, `error == nil` (method is best-effort).

6. `generatePlan success stores session id and refreshes shopping list`
- Configure `mockGenerateResponse` + `mockMealPlanSession` + recipe/ingredient fixtures.
- Assert `session/currentPlan` updated, `shoppingList` rebuilt from meal IDs, `error == nil`, `isLoading == false`, and `mockDefaults.string(forKey: "mealPlanSessionId") == sessionId`.

7. `generatePlan failure sets error and clears loading`
- API failure path.
- Assert `error == "Failed to generate meal plan"`, `isLoading == false`, and prior state remains safe.

8. `submitQueuedActions sends critique and applies critique response`
- Seed non-finalized session + plan.
- Queue actions via `toggleSwap` / `toggleRemove` on interactive entries.
- Configure `mockCritiqueResponse` with changed operations and updated plan; configure `mockMealPlanSession` for refetch.
- Call `submitQueuedActions()`.
- Assert:
  - `queuedActions.isEmpty == true`
  - `currentPlan` equals critique response plan
  - `lastExplanation` set
  - `changedSlots` contains expected `"dayIndex-mealType"` keys
  - `critiqueText` cleared
  - `shoppingList` refreshed for updated meal IDs
  - `isSending == false`, `error == nil`

9. `submitQueuedActions with empty queue is no-op`
- Ensure no queued actions.
- Call `submitQueuedActions()`.
- Assert no sending/error/state mutation.

10. `submitQueuedActions failure sets error and preserves queued actions`
- Queue at least one action; configure critique API failure.
- Call `submitQueuedActions()`.
- Assert `error == "Failed to send critique"`, `isSending == false`, and queued actions are still present (clear happens only on success).

11. `finalize success refetches session caches it and clears saved session id`
- Seed active session and defaults key.
- Configure finalize success + post-finalize session (`isFinalized == true`) returned by `getMealPlanSession`.
- Assert:
  - updated `session/currentPlan`
  - `cacheService.cache(...)` invoked with finalized session
  - `mockDefaults.string(forKey: "mealPlanSessionId") == nil`
  - `error == nil`

12. `finalize failure sets error and does not cache`
- Seed active session and failing API.
- Assert `error == "Failed to finalize meal plan"` and no cache write recorded.

13. `finalize no-ops when session already finalized`
- Seed finalized session.
- Assert no cache writes/API side effects and state remains unchanged.

## QA
1. Run focused BradOSCore suite:
- `cd ios/BradOS/BradOSCore && swift test --filter MealPlanViewModelTests`

2. Run full BradOSCore tests:
- `cd ios/BradOS/BradOSCore && swift test`

3. Run iOS build gate so SwiftLint plugin executes:
- `cd ios/BradOS && xcodegen generate && cd ../..`
- `xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath ~/.cache/brad-os-derived-data -skipPackagePluginValidation build`

4. Manual functional smoke check in simulator (end-to-end behavior that tests are protecting):
- Open Meal Plan tab, generate a plan, queue one swap and one remove, submit queued actions, then finalize.
- Confirm shopping list updates after generate and after critique.
- Relaunch/open Meal Plan again to verify finalized session still loads cleanly.

## Conventions
- Follow Swift Testing style already used in BradOSCore tests (`Testing`, `@Suite`, `@Test`, `#expect`) per existing view-model suites in `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/`.
- Respect testing policy in `docs/conventions/testing.md`:
  - no skipped/focused tests
  - meaningful assertions in every test
  - explicit failure-path coverage
- Keep iOS Swift changes SwiftLint-clean per `docs/conventions/ios-swift.md` (no `swiftlint:disable`).
- Keep implementation aligned with meal-planning architecture flow in `docs/architecture/meal-planning.md` (View -> ViewModel -> APIClient -> session operations).
- Keep test scope isolated and deterministic (per-test mocks/doubles; no shared mutable globals).
