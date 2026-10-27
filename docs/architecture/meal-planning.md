# Meal Planning

## Data Flow

MealPlanView -> MealPlanViewModel -> APIClient -> mealplans/meals handlers -> Generation/Critique/Operations services -> Firestore

## iOS Layer

- **Views:**
  - `ios/BradOS/BradOS/Views/MealPlan/MealPlanView.swift` — main tab view
  - `ios/BradOS/BradOS/Views/MealPlan/MealPlanGridView.swift` — weekly grid layout
  - `ios/BradOS/BradOS/Views/MealPlan/MealDayCard.swift` — single day card
  - `ios/BradOS/BradOS/Views/MealPlan/MealTypeCardsView.swift` — meal type selector
  - `ios/BradOS/BradOS/Views/MealPlan/MealPlanEditingView.swift` — edit mode
  - `ios/BradOS/BradOS/Views/MealPlan/CritiqueInputView.swift` — AI critique input
  - `ios/BradOS/BradOS/Views/MealPlan/CollapsibleCritiqueView.swift` — critique results
  - `ios/BradOS/BradOS/Views/MealPlan/ShoppingListView.swift` — shopping list
  - `ios/BradOS/BradOS/Views/MealPlan/TodayFocusView.swift` — today's meals focus
  - `ios/BradOS/BradOS/Views/MealPlan/QueuedActionsButton.swift` — pending action queue
  - `ios/BradOS/BradOS/Views/Today/MealPlanDashboardCard.swift` — Today tab card
- **ViewModels:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift`
- **Models:**
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MealPlan.swift`
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Meal.swift`
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MealPlanAction.swift`
- **Services:** `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/MealPlanCacheService.swift` — App Group disk cache for widget

## Backend Layer

- **Handlers:**
  - `packages/functions/src/handlers/mealplans.ts` — generate, critique, revise, finalize
  - `packages/functions/src/handlers/meals.ts` — CRUD via createResourceRouter
  - `packages/functions/src/handlers/recipes.ts` — recipe CRUD via createResourceRouter
  - `packages/functions/src/handlers/ingredients.ts` — ingredient CRUD via createResourceRouter
  - `packages/functions/src/handlers/barcodes.ts` — barcode CRUD via createResourceRouter
- **Services:**
  - `packages/functions/src/services/mealplan-generation.service.ts` — constraint-based plan generation
  - `packages/functions/src/services/mealplan-features.service.ts` — runtime breakfast flag, active plan/catalog projection, and preservation of disabled saved assignments
  - `packages/functions/src/services/mealplan-critique.service.ts` — direct JEV critique entry point
  - `packages/functions/src/services/mealplan-decision.service.ts` — scope resolution, food suitability and actual JEV meal choices
  - `packages/functions/src/services/mealplan-feasibility.service.ts` — bounded structural feasibility proofs for offered choices
  - `packages/functions/src/services/mealplan-prep-policy.service.ts` — shared prep counts and independent family/adult limits
  - `packages/functions/src/services/mealplan-jev.service.ts` — native HTTP transport, deadline/retries, and typed-answer validation
  - `packages/functions/src/services/mealplan-operations.service.ts` — validate and apply critique operations to plan
- **Repositories:**
  - `packages/functions/src/repositories/meal.repository.ts`
  - `packages/functions/src/repositories/mealplan-session.repository.ts`
  - `packages/functions/src/repositories/recipe.repository.ts`
  - `packages/functions/src/repositories/ingredient.repository.ts`
  - `packages/functions/src/repositories/barcode.repository.ts`
- **Schemas:**
  - `packages/functions/src/schemas/meal.schema.ts`
  - `packages/functions/src/schemas/mealplan-jev.schema.ts` — internal Jev questions and responses
  - `packages/functions/src/schemas/recipe.schema.ts`
  - `packages/functions/src/schemas/ingredient.schema.ts`
  - `packages/functions/src/schemas/barcode.schema.ts`
- **Types:**
  - `packages/functions/src/types/meal.ts` — Meal, MealType
  - `packages/functions/src/types/mealplan.ts` — MealPlanEntry, MealPlanSession, CritiqueOperation
  - `packages/functions/src/types/recipe.ts`
  - `packages/functions/src/types/ingredient.ts`

## Firestore Collections

- `meals` — meal definitions (name, type, audience, effort, prep_ahead, has_red_meat, url)
- `meal_plan_sessions` — generated plans with critique history (plan, meals_snapshot, history, is_finalized)
- `recipes` — recipe data
- `ingredients` — ingredient data
- `barcodes` — barcode-to-ingredient mappings

## Meal Slots

- Meals have an `audience`: `family` or `adult`. Existing records without `audience` decode as `family`.
- Plan entries have a `meal_track`: `family` or `adult`. Existing entries without `meal_track` decode as `family`.
- Slot identity is `day_index + meal_track + meal_type`; this lets a family breakfast and Brad breakfast coexist on the same day.
- Adult breakfast planning is controlled by the API runtime environment variable `ADULT_BREAKFAST_ENABLED`. It defaults to disabled; only the exact value `true` enables it.
- With adult breakfasts disabled, generated weekly plans contain 21 entries: 7 kid/family breakfasts, 7 family lunches, and 7 family dinners. With the flag enabled, the additional 7 adult breakfasts produce 28 entries.
- Session read/generation responses expose `feature_flags.adult_breakfast_enabled` for API clients. The iOS app and widget use their own shared `ADULT_BREAKFAST_ENABLED` Xcode build setting, defaulting to `NO`, and filter legacy cached plans before display or shopping calculations. They do not consume the API metadata; enable both API runtime and app/widget build flags together to restore the feature. Build with `ADULT_BREAKFAST_ENABLED=YES` when intentionally enabling it; a launch environment override supports simulator QA.
- Disabling the feature preserves existing adult meal definitions and stored plan assignments. API reads, AI planning context, active edits, and shopping lists exclude adult breakfasts while disabled; active edits retain the disabled saved assignments for later re-enablement.
- Finalizing while disabled preserves those stored assignments and excludes adult breakfast meals from `last_planned` updates. Conversation prose remains saved; structured disabled-slot operations and previous assignments are excluded from the active AI/API history view.
- Generation uses strict eligibility: family slots only select `audience=family` meals, adult breakfast slots only select `audience=adult` breakfast meals.
- When adult breakfasts are enabled and there are fewer than 7 adult breakfast meals, generation may repeat adult breakfast meals across the week. If there are zero adult breakfast meals, generation fails clearly instead of falling back to family breakfasts. Disabled adult breakfasts impose no catalog requirement.
- Stable display order is kid/family breakfast, adult breakfast when enabled, family lunch, then family dinner.

## Key Endpoints

- `POST /mealplans/generate` — generate a new weekly meal plan from available meals
- `GET /mealplans/latest` — get most recent meal plan session
- `GET /mealplans/:sessionId` — get specific session
- `POST /mealplans/:sessionId/critique` — edit a draft using TypeSafe Jev
- `POST /mealplans/:sessionId/revise` — edit a finalized plan using TypeSafe Jev and reconcile meal recency
- `POST /mealplans/:sessionId/finalize` — finalize plan, update lastPlanned dates
- `GET/POST/PUT/DELETE /meals` — standard CRUD for meal definitions; create/update supports `audience`
- `GET/POST/PUT/DELETE /recipes` — standard CRUD for recipes
- `GET/POST/PUT/DELETE /ingredients` — standard CRUD for ingredients
- `GET/POST/PUT/DELETE /barcodes` — barcode CRUD

## CLI

- `brados meals create --audience family|adult` creates a meal for a specific audience. The default is `family` for backward compatibility.
- `brados meals update --audience family|adult` changes a meal's audience without changing its `meal_type`.
- `meal_type` remains the meal category (`breakfast`, `lunch`, `dinner`); use `audience=adult` for Brad-only breakfasts instead of introducing a new meal type.
- Recipe creation during `brados meals create` requires `--ingredients-json` when recipe data is supplied. `--steps-json` is optional, but when present it requires `--ingredients-json`.
- `--ingredients-json` must be a JSON array like `[{"ingredient_id":"ingredient-1","quantity":4,"unit":"count"}]`; `--steps-json` must be a JSON array like `[{"step_number":1,"instruction":"Mix and cook."}]`.

## Critique and Revision Decisions

`mealplan-critique.service.ts` directly exports the JEV decision service. Both draft critique and finalized revision require `TYPESAFE_API_KEY`; no provider-selection switch or GPT meal-plan implementation remains. `JEV_MODEL` pins `jev-1.13.0` by default. JEV failures propagate without switching providers. Historical comparison results remain in the evaluation reports. Other features that independently use OpenAI keep their own credentials.

`mealplan-decision.service.ts` supplies the saved plan, catalog, recorded conversation, optional Doris context, and explicit household rules. A nonblank `context.original_request` is the authoritative semantic request; the forwarded message and interpretation remain separately attributed. The same precedence applies to the model-facing history view, without rewriting saved history. JEV first resolves requested slot actions and audience scope; explicit exchanges get an intermediate source-food preview limited to requested destinations, and a separate scope review permits one bounded reconsideration. Request status is classified against the actual saved plan only, never against the hypothetical preview. It resolves active food rejections against recorded pre-edit assignments and later requests, then evaluates required food suitability and uses Choice questions to select the actual meals. Multiple acceptable meals do not require clarification. Exact requests take precedence over normal effort and recency preferences, and an explicit request to restore a food can override an earlier rejection.

Recorded operations distinguish completed changes from pending requests. Every semantic stage receives the canonical history and current user message together in chronological order, alongside the separately attributed original fields. When a prior turn left the plan unchanged for clarification, a later answer asking to proceed resumes every still-authorized pending clause, including clauses not repeated in the answer. Latest cancellations or narrower instructions take precedence. Empty operations alone do not imply a pending request: acknowledgments and already-satisfied requests can also leave the plan unchanged. Scope review and removal verification use that complete resolved request; already applied edits remain history and are not replayed.

`mealplan-feasibility.service.ts` restricts choices to those admitting a complete structurally valid assignment. It does not rank foods or select the final meal. Duplicate, prep-capacity and red-meat rules remain mandatory, with legacy exceptions measured against the original saved plan. An already repeated food may move between slots, but its final count cannot increase; this permits exact exchanges without introducing another repeat. The existing small-catalog adult-breakfast exception still applies. Each offered choice has a complete-plan witness. A bounded search that cannot establish feasibility returns validation failure, never a claim of proven infeasibility.

`mealplan-prep-policy.service.ts` applies a separate limit of three occupied prep-ahead slots to each audience track, across that track's meal types. Brad's adult breakfasts do not consume family prep capacity. Generation, plan validation, atomic operations and feasibility use the same counting policy, including repeated occupied slots. An existing overage may remain or decrease only within its original track; reducing one track never increases the other's allowance. When all eligible choices require more prep capacity than a track has, the deterministic refusal names that track, its current count, the minimum required count and its limit. Retrying cannot override a hard constraint.

A final semantic review checks each selected food and explicit relationships across selected meals; categorical removal checks distinguish an unneeded slot from rejected food. A failed food review permits one JEV-selected repair target and one new food choice, with all other proposed assignments fixed. Removal or structural failures cannot enter that repair path. BradOS converts the final assignments into minimal operations and validates the combined plan before saving. All provider calls share one deadline, and large question sets are batched without discarding context. Missing factual evidence, unclear targets, unavailable combinations, and provider failures remain distinct outcomes.

The final review also checks core-dish variety within each audience, so different IDs for variants of the same dish do not evade the household variety preference. Shared ingredients or cuisine alone do not make two dishes equivalent. Legacy repetition may remain without increasing its count, and explicit user dish requests take priority. Adult breakfasts retain their small-catalog exception. An audience judgment that contradicts active requested slot actions must be reconsidered or fail closed; it cannot silently override the slot decisions. Audience uncertainty for a meal whose slots are all preserved is unused and cannot block a different meal's edit.

Both `/critique` and `/revise` accept `{ critique, context? }`. Optional context separates `original_request`, `interpretation`, `calendar_context`, and `planning_week_start`. The CLI exposes it with `--context-json`. Responses add an optional `outcome`: applied, no_change_requested, clarification_required, insufficient_evidence, infeasible, or validation_failed. Existing response fields and clients remain compatible.

Saving a critique uses a Firestore transaction comparing the loaded session with current state; a changed/deleted/finalized session returns `409 SESSION_CONFLICT`. History is appended as distinct turns, including repeated identical feedback. User turns preserve original content and optional structured context; applied assistant turns retain `previous_assignments` for the affected slots. This records what changed without treating every moved or removed meal as a food rejection. Whole-plan validation and persistence are atomic for the session, while finalized recency reconciliation remains a separate step. Recency uses mutable finalized-session timestamps and does not prove meal dates or consumption.

Jev returns typed selections, not generated operations or explanation prose. BradOS resolves known IDs, enforces rules and builds factual explanations. The adapter validates the complete typed response, including whether each Choice winner agrees with its probability distribution. An otherwise valid response with an inconsistent winner may be discarded and retried within the existing three-attempt deadline budget; the backend never substitutes its own winner. Fresh saved-state readback remains required before Doris reports success. Policy behavior requires live evaluation; mocked tests alone do not prove quality. See the live suite README and CURRENT-EVALUATION under `packages/functions/src/__tests__/live/` for versioned evidence.

## Notes

- Plan generation continues using the existing constraint-based logic (audience eligibility, effort limits, red meat limits, prep-ahead rules, meal type distribution); it does not require a TypeSafe key.
- No external calendar integration or scheduled-agent workflow is added by the Jev critique replacement. OpenClaw's calendar reads, normal generation command, saved-draft verification, Telegram delivery, and approval process remain separate.
- Critique operations include `meal_track`; missing legacy values default to `family`. Replacement validation enforces both `meal_type` and `audience`.
- Shopping list generation includes active planned entries. Adult breakfast ingredients are excluded while the feature is disabled, including for previously saved 28-entry plans.
- MealPlanCacheService stores finalized plan in App Group shared container for widget access
- Widget reads from cache (no API calls); refreshes at midnight + on-demand via WidgetCenter
- Sessions track full conversation history for multi-turn critique

## Rollout Checklist

- Configure `TYPESAFE_API_KEY` and a pinned `JEV_MODEL` before enabling critique/revision. See [Cloud Run deployment](../guides/deploying-cloud-run.md) for numeric secret-version binding.
- Evaluate supported requests, ambiguity, and candidate matching against real TypeSafe responses before enabling the candidate.
- Verify unsupported requests leave the saved plan unchanged and neither critique nor revision finalizes a draft or generates a shopping list.
- With `ADULT_BREAKFAST_ENABLED` absent or false, verify generation returns 21 entries, kid breakfasts remain visible throughout the app and widget, and saved adult breakfast ingredients are absent from shopping lists.
- Read and edit an existing 28-entry plan while disabled; verify the API presents 21 entries and disabled saved assignments remain intact in storage.
- Before enabling `ADULT_BREAKFAST_ENABLED=true`, seed at least one `audience=adult`, `meal_type=breakfast` meal. Prefer at least 7 to avoid repeats, but repeats are allowed until the catalog is complete.
- With the flag enabled, verify generation returns 28 entries with both breakfast tracks for each `day_index` and shopping lists include adult breakfast ingredients.
- The Cloud Run deployment command uses an explicit runtime environment allowlist and does not forward arbitrary local environment variables. Default-off rollout needs no flag override; enabling the flag requires setting it on the API runtime explicitly and preserving that setting in subsequent deployments.

## See Also

- [Today](today.md) — meal plan data shown on dashboard
