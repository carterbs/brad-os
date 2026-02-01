# Meal Planner Step 3 Handoff

## Overview

- **Project**: Meal Planner feature for brad-os
- **Status**: Step 3 complete, ready for Step 4 (Agent iOS) and Step 5 (Shopping Integration)
- **Your Role**: Orchestrator. You dispatch subagents for implementation. You do NOT write code yourself.

## The Master Plan

Source of truth: `thoughts/shared/plans/2026-01-31-meal-planner-sequencing.md`

| Plan | File | Covers |
|------|------|--------|
| Firebase Migration | `thoughts/shared/plans/2026-01-31-mealplanner-firebase-migration.md` | Step 1 (complete) |
| Agent Critique Loop | `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` | Phases 1-6 |
| Shopping List | `thoughts/shared/plans/2026-01-31-shopping-list-generation.md` | Phases 1-7 |

## What's Complete

### Step 1: Firebase Migration
- All Firestore collections populated (232 ingredients, 82 meals, 82 recipes, 140 conversations, 723 messages)

### Step 2: Three Parallel Streams (all merged to main)
- **Stream A1**: Meal CRUD (types, schemas, repos, handlers, tests) + meal plan generation service
- **Stream B**: Ingredients and recipes read-only API endpoints
- **Stream C**: Store section assignment script (all 232 ingredients classified)

### Step 3: Two Parallel Streams (all merged to main)
- **Stream A2**: Agent critique + finalize backend (Phases 3-4)
  - `mealplan-critique.service.ts` — OpenAI structured output for plan modifications
  - `mealplan-operations.service.ts` — pure function to apply operations to plan
  - `mealplan-debug.ts` — inline HTML debug UI (emulator only)
  - Critique route: `POST /:sessionId/critique`
  - Finalize route: `POST /:sessionId/finalize`
  - `defineSecret('OPENAI_API_KEY')` with 120s timeout
  - 26 new tests (operations: 9, critique: 8, handler: 9)
- **Shopping iOS** (Phases 2-5)
  - `Ingredient.swift`, `Recipe.swift`, `ShoppingList.swift` — iOS models with CodingKeys
  - `RecipeCacheService.swift` — singleton in-memory cache for ingredients + recipes
  - `ShoppingListBuilder.swift` — aggregation, sectioning, sorting (takes `[String]` meal IDs)
  - `ShoppingListFormatter.swift` — plain text clipboard format with pantry note
  - API client methods: `getIngredients()`, `getRecipes()`
  - 14 new tests (builder: 8, formatter: 6, cache: 6)

### Post-merge fixes (on main, not yet committed)
- **Prompt engineering fixes**:
  - Plan grid uses `[meal_id] meal_name` format to prevent model from including names in IDs
  - System message explicitly states current plan already reflects all previous changes
  - History instructions: "Do NOT re-apply operations from earlier turns"
  - These fixed the multi-turn re-execution bug
- **Model**: Changed from gpt-4o → gpt-5-nano (testing; user may want to revert to gpt-5-mini)
- **Debug UI BASE_URL**: Falls back to hosting URL when accessed from functions emulator port
- **index.ts**: Debug handler changed from async dynamic import to static import/export (dynamic export didn't register with emulator)
- **firebase.json**: Added hosting rewrites for meals, mealplans, ingredients, recipes, debug
- **Function timeout**: `withOpenAiOptions` has `timeoutSeconds: 120` for OpenAI latency

## Validation State

- **767 tests passing** across 37 test files (as of last merge; prompt fixes haven't been re-validated)
- Typecheck clean, lint clean at last merge
- Emulator tested end-to-end: generate → critique → critique → critique → finalize
- Multi-turn history bug verified fixed (turn 3 only acts on new request, not re-applying turns 1-2)

### Uncommitted changes on main

The post-merge fixes above need to be committed. Run typecheck/lint/test first:
```bash
npm run typecheck && npm run lint && npm test
```

Files changed on main (uncommitted):
- `packages/functions/src/services/mealplan-critique.service.ts` — prompt fixes + model change
- `packages/functions/src/handlers/mealplan-debug.ts` — BASE_URL fix
- `packages/functions/src/index.ts` — static debug export + timeout
- `firebase.json` — new hosting rewrites

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OpenAI model | gpt-5-nano (testing) | 1500-token system message is small enough. User may revert to gpt-5-mini if quality is insufficient |
| Prompt: plan grid format | `[meal_id] meal_name` | Prevents model from concatenating name into ID field |
| Prompt: history handling | Explicit "do NOT re-apply" instruction | Fixed multi-turn re-execution bug |
| Debug handler export | Static import, not dynamic | Async `void import()` didn't register with emulator function scanner |
| Function timeout | 120s for OpenAI functions | OpenAI can take 15-20s; default 60s caused occasional 504s |
| ShoppingListBuilder input | `[String]` meal IDs | MealPlanEntry doesn't exist in iOS yet; will integrate in Step 5 |
| RecipeCacheService | `@MainActor` | Required because it's an ObservableObject; ShoppingListBuilder.build() also @MainActor as a result |

## Your Operating Rules

1. **You are an orchestrator, not an implementer.** Dispatch subagents for all code changes, validation, and exploration. Protect your context window.
2. **All code changes happen in git worktrees** per CLAUDE.md. Branch from main, work in `../lifting-worktrees/<branch-name>`, merge back.
3. **Validation runs in subagents.** `npm run typecheck && npm run lint && npm test` produces verbose output — always delegate.
4. **The plans are detailed.** Each phase lists exact files, types, test cases, and success criteria. Feed these details to subagents.
5. **Commit after each phase.** Don't batch commits at the end. Smaller commits = easier rollback.
6. **When launching parallel subagents**, give each its own worktree. Merge sequentially back to main, resolving conflicts as needed.

## Gotchas

- **Emulator data doesn't persist** between restarts unless `emulator-data/` directory exists from a clean export. After a fresh start, re-run migration + store section scripts.
- **OPENAI_API_KEY**: Must be set as env var when starting emulator (`export OPENAI_API_KEY=$(cat .secret.local | cut -d= -f2)`). The `.secret.local` file at project root has the key but `defineSecret` doesn't auto-load it in the emulator.
- **Debug UI routing**: Access via `http://localhost:5001/brad-os/us-central1/devMealplanDebug`. The hosting rewrite for `/debug` doesn't work (hosting emulator doesn't see the function). API calls route to hosting port 5002 via the BASE_URL fallback.
- **Barrel file pattern**: Streams touching `index.ts`, `types/index.ts`, `schemas/index.ts` will conflict on merge. Resolution is straightforward — keep all export lines.

## Next Steps

### Step 4: Agent iOS (Phases 5-6)

**Depends on**: Step 3 complete (stable API contract) ✅

**Agent Phase 5 — iOS Data Layer**
- Plan: `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` Phase 5
- Models: `Meal.swift`, `MealPlan.swift` (MealPlanEntry, MealPlanSession, ConversationMessage, CritiqueResponse)
- API protocol: `generateMealPlan()`, `getMealPlanSession()`, `critiqueMealPlan()`, `finalizeMealPlan()`
- API client + mock implementations
- Tests: decoding tests from captured JSON fixtures

**Agent Phase 6 — iOS Views**
- Plan: `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` Phase 6
- ViewModel: `MealPlanViewModel.swift`
- Views: `MealPlanView.swift`, `MealPlanGridView.swift`, `CritiqueInputView.swift`
- Navigation: entry point in MainTabView or ActivitiesView
- **USER REQUEST**: When AI changes a meal, add a green highlight to the changed cell that fades after 2 seconds (replicating old app behavior). Track `changedSlots` from critique response operations and apply highlight animation.

### Step 5: Shopping List iOS Integration (Phases 6-7)

**Depends on**: Steps 3 + 4 both complete

**Shopping Phase 6 — ViewModel Integration**
- Modify `MealPlanViewModel.swift`: add `shoppingList`, `didCopyToClipboard`, `recipeCache`
- Recompute shopping list after `generatePlan()` and `sendCritique()`

**Shopping Phase 7 — Shopping List View**
- `ShoppingListView.swift` — sectioned list with copy button
- Modify `MealPlanView.swift` — Plan/Shopping List segment toggle

### Parallelization

Steps 4 and 5 are sequential (Step 5 depends on Step 4's ViewModel/View). Step 4 has two phases that are also sequential (Phase 5 data layer before Phase 6 views). So this is a single-stream pipeline:

```
Phase 5 (iOS data layer) → Phase 6 (iOS views + green highlight) → Phase 6-7 (shopping integration)
```

### Human Checkpoints Remaining

| When | What |
|------|------|
| After Step 4 Phase 6 | Test full flow on iOS simulator against emulator |
| After Step 5 | End-to-end: generate → critique → view shopping list → copy → paste |

### Before Starting Step 4

1. Commit the uncommitted prompt/debug fixes on main (validate first)
2. Create worktree for the iOS work
3. Capture JSON response fixtures from the emulator for iOS decoding tests:
   - POST /mealplans/generate response
   - GET /mealplans/:sessionId response
   - POST /mealplans/:sessionId/critique response
4. These fixtures go into the iOS test bundle

## Key Commits on Main

```
91f3a8f Fix migration and store-section scripts to write snake_case fields
bff0d4c Add meal plan critique loop, operations service, finalize endpoint, and debug UI
<merge>  Add iOS shopping list models, services, and builder
```

Plus uncommitted fixes for prompt engineering, model change, debug UI routing, hosting rewrites, and timeout.

## References

- Sequencing plan: `thoughts/shared/plans/2026-01-31-meal-planner-sequencing.md`
- Agent plan: `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md`
- Shopping plan: `thoughts/shared/plans/2026-01-31-shopping-list-generation.md`
- Previous handoff: `thoughts/shared/handoffs/meal-planner-orchestrator-handoff-2026-01-31.md`
- Debug UI: `packages/functions/src/handlers/mealplan-debug.ts`
- Critique service: `packages/functions/src/services/mealplan-critique.service.ts`
- Operations service: `packages/functions/src/services/mealplan-operations.service.ts`
- iOS shopping models: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/ShoppingList.swift`
- iOS recipe cache: `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/RecipeCacheService.swift`
- iOS shopping builder: `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/ShoppingListBuilder.swift`
