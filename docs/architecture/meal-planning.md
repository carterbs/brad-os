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
  - `packages/functions/src/services/mealplan-critique.service.ts` — typed TypeSafe Jev decisions through the native HTTP API
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
- `mealplan_sessions` — generated plans with critique history (plan, meals_snapshot, history, is_finalized)
- `recipes` — recipe data
- `ingredients` — ingredient data
- `barcodes` — barcode-to-ingredient mappings

## Meal Slots

- Meals have an `audience`: `family` or `adult`. Existing records without `audience` decode as `family`.
- Plan entries have a `meal_track`: `family` or `adult`. Existing entries without `meal_track` decode as `family`.
- Slot identity is `day_index + meal_track + meal_type`; this lets a family breakfast and Brad breakfast coexist on the same day.
- Generated weekly plans contain 28 entries: 7 family breakfasts, 7 adult breakfasts, 7 family lunches, and 7 family dinners.
- Generation uses strict eligibility: family slots only select `audience=family` meals, adult breakfast slots only select `audience=adult` breakfast meals.
- If there are fewer than 7 adult breakfast meals, generation may repeat adult breakfast meals across the week. If there are zero adult breakfast meals, generation fails clearly instead of falling back to family breakfasts.
- Stable display order is family breakfast, adult breakfast, family lunch, then family dinner.

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

Draft critique and finalized-plan revision call TypeSafe's native HTTP API with the pinned model `jev-1.13.0`. Set `TYPESAFE_API_KEY` for these routes; `JEV_MODEL` selects an explicit model version. Today Coach continues using OpenAI and its existing `OPENAI_API_KEY`.

The decision flow has two stages:

1. Jev classifies the latest request and chooses whether to keep, replace, or explicitly remove each existing meal slot. It also identifies requests for easier meals. Ambiguous or unsupported requests produce no plan changes.
2. For replacement slots, BradOS supplies eligible catalog meals and asks Jev Noul questions about whether each candidate matches the request. BradOS selects from those known IDs, assembles `CritiqueOperation[]`, and creates the explanation from templates.

Jev returns typed decisions and probabilities; it does not generate operation JSON, invent meals, write explanations, or execute tools. BradOS validates the resulting operations and plan before saving changes. The API request/response shapes, session storage, and conversation history format remain the same.

Confidence and match thresholds are conservative starting values, not calibrated accuracy guarantees. Mocked tests verify control flow and validation; model quality still requires evaluation of representative requests with a real TypeSafe key. Missing configuration or a failed TypeSafe call must not become a successful plan change.

## Notes

- Plan generation continues using the existing constraint-based logic (audience eligibility, effort limits, red meat limits, prep-ahead rules, meal type distribution); it does not require a TypeSafe key.
- No external calendar integration or scheduled-agent workflow is added by the Jev critique replacement. OpenClaw's calendar reads, normal generation command, saved-draft verification, Telegram delivery, and approval process remain separate.
- Critique operations include `meal_track`; missing legacy values default to `family`. Replacement validation enforces both `meal_type` and `audience`.
- Shopping list generation includes every planned entry, including adult breakfast entries.
- MealPlanCacheService stores finalized plan in App Group shared container for widget access
- Widget reads from cache (no API calls); refreshes at midnight + on-demand via WidgetCenter
- Sessions track full conversation history for multi-turn critique

## Rollout Checklist

- Configure `TYPESAFE_API_KEY` and a pinned `JEV_MODEL` before enabling critique/revision. See [Cloud Run deployment](../guides/deploying-cloud-run.md) for numeric secret-version binding.
- Evaluate supported requests, ambiguity, and candidate matching against real TypeSafe responses before treating the initial thresholds as reliable.
- Verify unsupported requests leave the saved plan unchanged and neither critique nor revision finalizes a draft or generates a shopping list.
- Seed at least one `audience=adult`, `meal_type=breakfast` meal before enabling generation in an environment.
- Prefer at least 7 adult breakfast meals to avoid repeats, but repeats are allowed until the catalog is complete.
- Verify `POST /mealplans/generate` returns 28 entries and includes both breakfast tracks for each `day_index`.
- Verify `POST /mealplans/:sessionId/finalize` produces a shopping list that includes adult breakfast ingredients.

## See Also

- [Today](today.md) — meal plan data shown on dashboard
