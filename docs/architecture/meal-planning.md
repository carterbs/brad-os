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
  - `packages/functions/src/handlers/mealplans.ts` — generate, critique, finalize
  - `packages/functions/src/handlers/meals.ts` — CRUD via createResourceRouter
  - `packages/functions/src/handlers/recipes.ts` — recipe listing
  - `packages/functions/src/handlers/ingredients.ts` — ingredient listing
  - `packages/functions/src/handlers/barcodes.ts` — barcode CRUD via createResourceRouter
  - `packages/functions/src/handlers/mealplan-debug.ts` — debug UI (HTML page)
- **Services:**
  - `packages/functions/src/services/mealplan-generation.service.ts` — constraint-based plan generation
  - `packages/functions/src/services/mealplan-critique.service.ts` — OpenAI-powered plan critique
  - `packages/functions/src/services/mealplan-operations.service.ts` — apply critique operations to plan
- **Repositories:**
  - `packages/functions/src/repositories/meal.repository.ts`
  - `packages/functions/src/repositories/mealplan-session.repository.ts`
  - `packages/functions/src/repositories/recipe.repository.ts`
  - `packages/functions/src/repositories/ingredient.repository.ts`
  - `packages/functions/src/repositories/barcode.repository.ts`
- **Schemas:**
  - `packages/functions/src/schemas/meal.schema.ts`
  - `packages/functions/src/schemas/recipe.schema.ts`
  - `packages/functions/src/schemas/ingredient.schema.ts`
  - `packages/functions/src/schemas/barcode.schema.ts`
- **Types:**
  - `packages/functions/src/types/meal.ts` — Meal, MealType
  - `packages/functions/src/types/mealplan.ts` — MealPlanEntry, MealPlanSession, CritiqueOperation
  - `packages/functions/src/types/recipe.ts`
  - `packages/functions/src/types/ingredient.ts`

## Firestore Collections
- `meals` — meal definitions (name, type, effort, prep_ahead, has_red_meat, url)
- `mealplan_sessions` — generated plans with critique history (plan, meals_snapshot, history, is_finalized)
- `recipes` — recipe data
- `ingredients` — ingredient data
- `barcodes` — barcode-to-ingredient mappings

## Key Endpoints
- `POST /mealplans/generate` — generate a new weekly meal plan from available meals
- `GET /mealplans/latest` — get most recent meal plan session
- `GET /mealplans/:sessionId` — get specific session
- `POST /mealplans/:sessionId/critique` — AI-powered plan critique (OpenAI)
- `POST /mealplans/:sessionId/finalize` — finalize plan, update lastPlanned dates
- `GET/POST/PUT/DELETE /meals` — standard CRUD for meal definitions
- `GET /recipes` — list recipes
- `GET /ingredients` — list ingredients
- `GET/POST/PUT/DELETE /barcodes` — barcode CRUD

## Notes
- Plan generation uses constraint-based logic (effort limits, red meat limits, prep-ahead rules, meal type distribution)
- Critique flow: user text -> OpenAI -> CritiqueOperation[] -> applyOperations -> updated plan
- MealPlanCacheService stores finalized plan in App Group shared container for widget access
- Widget reads from cache (no API calls); refreshes at midnight + on-demand via WidgetCenter
- Sessions track full conversation history for multi-turn critique

## See Also
- [Today](today.md) — meal plan data shown on dashboard
