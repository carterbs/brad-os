# Meal Planner: Sequencing & Parallelization Plan

## Plans Being Sequenced

| Plan | File | Phases |
|------|------|--------|
| Firebase Migration | `2026-01-31-mealplanner-firebase-migration.md` | 6 phases |
| Agent Critique Loop | `2026-01-31-meal-plan-agent-critique-loop.md` | Phases 1-6 (Phase 0 removed — migration covers it) |
| Shopping List | `2026-01-31-shopping-list-generation.md` | 7 phases |
| Store Section Script | New (described below) | 1 phase |

---

## Execution Timeline

```
                        ┌─────────────────────────────────────────────────┐
STEP 1 (sequential)     │  Firebase Migration Phases 1-6                  │
                        │  (ingredients, meals, recipes, conversations)   │
                        └────────────────────┬────────────────────────────┘
                                             │
                        ┌────────────────────┼────────────────────────────┐
                        │                    │                            │
STEP 2 (3 parallel)     ▼                    ▼                            ▼
              ┌──────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
              │ AGENT A1         │ │ SHOPPING LIST BACKEND │ │ STORE SECTION SCRIPT  │
              │                  │ │                       │ │                       │
              │ Agent Phase 1    │ │ Shopping Phase 1      │ │ Assign storeSection   │
              │  Meal CRUD       │ │  Ingredients &        │ │ to all 232 ingredients│
              │                  │ │  Recipes API          │ │ in Firestore          │
              │ Agent Phase 2    │ │                       │ └──────────┬────────────┘
              │  Generation      │ │                       │            │ done quickly
              │                  │ │                       │            │
              │ ⛔ STOPS HERE    │ │                       │            │
              └────────┬─────────┘ └───────────┬───────────┘            │
                       │                       │                        │
                       ▼                       │                        │
              ┌──────────────────┐             │                        │
  ⛔ REVIEW   │ HUMAN REVIEWS    │             │                        │
              │ generated plans  │             │                        │
              │ via emulator     │             │                        │
              └────────┬─────────┘             │                        │
                       │ approved              │                        │
                       │         ┌─────────────┴────────────────────────┘
                       │         │ (storeSection must be done before
STEP 3 (3 parallel)    │         │  Shopping Phase 2+ uses ingredient data)
                       ▼         ▼
              ┌──────────────────┐ ┌──────────────────────┐
              │ AGENT A2         │ │ SHOPPING LIST iOS     │
              │                  │ │                       │
              │ Agent Phase 3    │ │ Shopping Phase 2      │
              │  Critique loop   │ │  iOS models           │
              │  + debug HTML UI │ │                       │
              │                  │ │ Shopping Phase 3      │
              │ Agent Phase 4    │ │  RecipeCacheService   │
              │  Finalize        │ │                       │
              │                  │ │ Shopping Phase 4      │
              │                  │ │  ShoppingListBuilder  │
              │                  │ │                       │
              │                  │ │ Shopping Phase 5      │
              │                  │ │  Clipboard formatter  │
              └────────┬─────────┘ └───────────┬──────────┘
                       │                       │
                       ▼                       │
              ┌──────────────────┐             │
STEP 4 (seq)  │ AGENT iOS        │             │
              │                  │             │
              │ Agent Phase 5    │             │
              │  iOS data layer  │             │
              │                  │             │
              │ Agent Phase 6    │             │
              │  iOS views       │             │
              └────────┬─────────┘             │
                       │                       │
                       ▼                       ▼
              ┌────────────────────────────────────────────┐
STEP 5 (seq)  │ SHOPPING LIST iOS INTEGRATION              │
              │                                            │
              │ Shopping Phase 6 — ViewModel integration   │
              │ Shopping Phase 7 — ShoppingListView UI     │
              └────────────────────────────────────────────┘
```

---

## Step 1: Firebase Migration (sequential, in progress)

Currently being implemented. Creates all Firestore collections from the PostgreSQL dump.

| Phase | What | Output |
|-------|------|--------|
| Migration Phase 1 | Build `ingredients` collection from mapping JSON | 232 ingredient docs |
| Migration Phase 2 | Extract/reconcile `last_planned` dates from checkpoints | Lookup map for Phase 3 |
| Migration Phase 3 | Migrate meals + recipes | 82 meal docs, 82 recipe docs |
| Migration Phase 4 | Migrate conversations + messages | 140 conversation docs, 723 messages |
| Migration Phase 5 | Skip checkpoints/unused tables | Nothing to do |
| Migration Phase 6 | Validate counts and referential integrity | Green/red report |

**Blocks:** Everything below.

---

## Step 2: Three Parallel Streams

Launch immediately after migration completes. All three are independent of each other.

### Stream A1: Agent Backend — CRUD + Generation (Phases 1-2)

One subagent. **Stops after Phase 2 and reports back for human review.**

**Agent Phase 1 — Meal CRUD**
- Types: `meal.ts`, `mealplan.ts`
- Schemas: `meal.schema.ts`, `mealplan.schema.ts`
- Repository: `meal.repository.ts`, `mealplan-session.repository.ts`
- Handler: `meals.ts`
- Exports: `devMeals`, `prodMeals`
- Tests: repo CRUD, handler validation, schema valid/invalid
- Gate: `npm run typecheck && npm run lint && npm test`

**Agent Phase 2 — Meal Plan Generation**
- Service: `mealplan-generation.service.ts`
- Handler: `mealplans.ts` (POST /generate, GET /:sessionId)
- Tests: every constraint isolated + 100-run stress test
- Gate: `npm run typecheck && npm run lint && npm test`

**⛔ HARD STOP — HUMAN SIGN-OFF REQUIRED**
- Subagent stops here and reports results
- User reviews 3+ generated plans via emulator endpoint
- User confirms algorithmic rules produce acceptable plans
- Only after approval does Stream A2 begin

### Stream A2: Agent Backend — Critique + Finalize (Phases 3-4)

Separate subagent, launched only after human sign-off on Phase 2.

**Agent Phase 3 — Critique Loop**
- Service: `mealplan-critique.service.ts`, `mealplan-operations.service.ts`
- Handler route: POST /:sessionId/critique
- Debug HTML UI: `mealplan-debug.ts` (emulator only)
- OpenAI setup: `npm install openai`, `defineSecret('OPENAI_API_KEY')`
- Tests: prompt construction, operation application, mocked OpenAI, integration
- Gate: debug UI end-to-end against emulator, 5+ manual critiques

**Agent Phase 4 — Finalize Endpoint**
- Handler route: POST /:sessionId/finalize
- Tests: lastPlanned updates, double-finalize rejection
- Gate: `npm run typecheck && npm run lint && npm test`

### Stream B: Shopping List Backend (Phase 1 only)

Single phase, one subagent. The remaining shopping list phases (2-5) need `storeSection` data from Stream C.

**Shopping Phase 1 — Ingredients & Recipes API Endpoints**
- Types: `ingredient.ts`, `recipe.ts`
- Schemas: `ingredient.schema.ts`, `recipe.schema.ts`
- Repositories: `ingredient.repository.ts`, `recipe.repository.ts`
- Handlers: `ingredients.ts`, `recipes.ts`
- Exports: `devIngredients`, `prodIngredients`, `devRecipes`, `prodRecipes`
- Tests: repository findAll, handler response shape
- Gate: `npm run typecheck && npm run lint && npm test`

### Stream C: Store Section Assignment Script

Small standalone script, one subagent. Adds `storeSection` to all 232 ingredients in Firestore.

**What it does:**
1. Read all docs from `ingredients` collection (or `dev_ingredients` in emulator)
2. Match each ingredient name to a store section using a hardcoded mapping object
3. Update each doc with the `storeSection` field
4. Report: count per section, any unmatched ingredients

**Store sections (11 total):**

| Order | Section | Examples |
|-------|---------|----------|
| 1 | Produce | strawberries, garlic, fresh basil, lemons |
| 2 | Dairy & Eggs | milk, cheddar cheese, eggs, butter |
| 3 | Meat & Seafood | chicken breasts, ground beef, salmon |
| 4 | Deli | sliced turkey, sliced ham, salami |
| 5 | Bakery & Bread | bread, tortillas, pita bread, naan |
| 6 | Frozen | frozen broccoli, Eggo waffles, fish sticks |
| 7 | Canned & Jarred | crushed tomatoes, black beans, chicken broth |
| 8 | Pasta & Grains | spaghetti, microwave rice, rolled oats |
| 9 | Snacks & Cereal | Goldfish crackers, Cheerios, granola |
| 10 | Condiments & Spreads | mayonnaise, peanut butter, soy sauce |
| 11 | Pantry Staples | cinnamon, cumin, garlic powder, paprika |

**Classification guidelines:**
- Fresh herbs → Produce
- Branded frozen items (Eggo, Tyson, Freschetta) → Frozen
- Branded cereals → Snacks & Cereal
- Spices, seasonings, baking basics, vinegars → Pantry Staples
- Sauces (soy, Worcestershire, hot sauce, BBQ) → Condiments & Spreads
- Honey → Pantry Staples

**Gate:** Every ingredient has a `storeSection`. No nulls.

---

## Step 3: Shopping List iOS (Phases 2-5, parallel with Step 4 if possible)

Can start as soon as Stream B (Shopping Phase 1) and Stream C (storeSection script) are done. Independent of the Agent backend — only needs the API endpoints and ingredient data.

**Shopping Phase 2 — iOS Models & API Client**
- Models: `Ingredient.swift`, `Recipe.swift`, `ShoppingList.swift`
- API protocol additions: `getIngredients()`, `getRecipes()`
- API client + mock implementations
- Tests: decoding tests from captured JSON
- Gate: Xcode build succeeds

**Shopping Phase 3 — RecipeCacheService**
- `RecipeCacheService.swift` (singleton, in-memory cache)
- Loads all ingredients + recipes once, keyed lookups
- Tests: idempotent load, lookup by ID, ingredient tuples
- Gate: Xcode build succeeds

**Shopping Phase 4 — Shopping List Computation**
- `ShoppingListBuilder.swift` (pure function, no side effects)
- Aggregation: group by ingredientId, sum quantities, group by storeSection
- Tests: aggregation rules, sectioning, sort order, edge cases, stress test with 82 meals
- Gate: all unit tests pass

**Shopping Phase 5 — Clipboard Formatter**
- `ShoppingListFormatter.swift`
- Plain text format, one item per line, section headers, pantry note
- Tests: format output, empty list, pantry note
- Gate: unit tests pass

**Parallelization note:** Steps 3 and 4 can overlap if Streams B and C finish before Stream A. In practice, Stream C (store section script) will finish quickly, and Shopping Phase 1 is a single phase — so Step 3 will likely start while Step 2's Stream A is still running. This is fine and desirable.

---

## Step 4: Agent iOS (Phases 5-6, sequential)

Requires Agent Phases 1-4 (Streams A1 + A2) to be complete (needs stable API contract).

**Agent Phase 5 — iOS Data Layer**
- Models: `Meal.swift`, `MealPlan.swift`
- API protocol: `generateMealPlan()`, `getMealPlanSession()`, `critiqueMealPlan()`, `finalizeMealPlan()`
- API client + mock implementations
- Tests: decoding tests from captured JSON fixtures
- Gate: Xcode build succeeds

**Agent Phase 6 — iOS Views**
- ViewModel: `MealPlanViewModel.swift`
- Views: `MealPlanView.swift`, `MealPlanGridView.swift`, `CritiqueInputView.swift`
- Navigation: entry point in MainTabView or ActivitiesView
- Tests: manual on simulator (generate → critique → finalize)
- Gate: full flow works on simulator

---

## Step 5: Shopping List iOS Integration (Phases 6-7, sequential)

Requires **both** Agent Phase 6 (creates MealPlanViewModel and MealPlanView) **and** Shopping Phases 2-5 (creates ShoppingListBuilder, RecipeCacheService, formatter).

**Shopping Phase 6 — ViewModel Integration**
- Modify `MealPlanViewModel.swift`: add `shoppingList`, `didCopyToClipboard`, `recipeCache` dependency
- Recompute shopping list after `generatePlan()` and `sendCritique()`
- `copyShoppingList()` method
- Gate: shopping list updates after plan changes

**Shopping Phase 7 — Shopping List View**
- Create `ShoppingListView.swift`
- Modify `MealPlanView.swift`: add Plan/Shopping List segment toggle
- Section headers, items, pantry visual distinction, copy button, feedback toast
- Gate: full manual flow on simulator

---

## Summary: Subagent Allocation

| Step | Subagents | Work | Depends On |
|------|-----------|------|------------|
| 1 | 1 | Firebase Migration (6 phases) | — |
| 2 | **3 parallel** | Agent CRUD+Gen (2 phases) + Shopping backend (1 phase) + Store section script | Step 1 |
| ⛔ | 0 | **Human reviews generated plans** | Step 2 Stream A1 |
| 3 | **3 parallel** | Agent Critique+Finalize (2 phases) + Shopping iOS (4 phases) + any remaining from Step 2 | Human sign-off + Step 2 Streams B+C |
| 4 | 1 | Agent iOS (2 phases) | Step 3 Stream A2 |
| 5 | 1 | Shopping iOS integration (2 phases) | Steps 3+4 |

Maximum parallelism timeline:

```
Time →
────────────────────────────────────────────────────────────────────────────────
Step 1:   [Firebase Migration ████████████████████]
Step 2:   ······························[Agent CRUD+Gen ██████████████]
          ······························[Shopping Backend ████]
          ······························[StoreSection ██]
    ⛔:   ············································ HUMAN REVIEW ···
Step 3:   ··················································[Agent Critique+Finalize ██████████████]
          ······································[Shopping iOS ████████████████]
Step 4:   ··································································[Agent iOS █████████████]
Step 5:   ··············································································[Integration ████████]
────────────────────────────────────────────────────────────────────────────────
```

Peak concurrency: **3 subagents** (Steps 2 and 3). The human review checkpoint between Steps 2 and 3 guarantees you see and approve generated plans before any LLM/critique work begins.

---

## Human Checkpoints

| When | What | Why |
|------|------|-----|
| After Step 1 | Verify migration counts in emulator UI | Catch data issues before building on top |
| After Agent Phase 2 | Review 3+ generated plans | Validate algorithmic rules before adding LLM layer |
| After Agent Phase 3 | Test debug HTML UI with 5+ critiques | Validate LLM interaction before building iOS |
| After Step 5 | Full end-to-end on simulator | Generate → critique → view shopping list → copy → paste |
