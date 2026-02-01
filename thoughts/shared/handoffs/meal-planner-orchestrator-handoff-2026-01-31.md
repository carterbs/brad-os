# Meal Planner Orchestrator Handoff

## Overview

- **Project**: Meal Planner feature for brad-os
- **Status**: In Progress — Step 2 complete, at human review checkpoint before Step 3
- **Primary Goal**: Full meal planning system: algorithmic generation, LLM critique loop, shopping list, iOS UI
- **Your Role**: Orchestrator. You dispatch subagents to do implementation work. You do NOT write code yourself. You read plans, give detailed instructions, review results, resolve issues, and make go/no-go decisions.

## The Master Plan

The sequencing plan at `thoughts/shared/plans/2026-01-31-meal-planner-sequencing.md` is the source of truth. It defines 5 steps with parallelization opportunities and human checkpoints. Three detailed implementation plans feed into it:

| Plan | File | Covers |
|------|------|--------|
| Firebase Migration | `thoughts/shared/plans/2026-01-31-mealplanner-firebase-migration.md` | Step 1 (complete) |
| Agent Critique Loop | `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` | Phases 1-6 of the agent backend + iOS |
| Shopping List | `thoughts/shared/plans/2026-01-31-shopping-list-generation.md` | Phases 1-7 of shopping list backend + iOS |

## Current State

### Completed

- [x] **Step 1: Firebase Migration** — All Firestore collections populated (232 ingredients, 82 meals, 82 recipes, 140 conversations, 723 messages)
- [x] **Step 2, Stream A1: Agent Backend Phases 1-2** — Meal CRUD (types, schemas, repos, handlers, tests) + meal plan generation service with all constraint rules. Branch merged to main.
- [x] **Step 2, Stream B: Shopping Backend Phase 1** — Ingredients and recipes read-only API endpoints (types, schemas, repos, handlers, tests). Branch merged to main.
- [x] **Step 2, Stream C: Store Section Script** — Script assigns `store_section` to all 232 ingredients. Executed against emulator, all ingredients classified.
- [x] **Migration field name fix** — Migration script corrected from camelCase to snake_case to match codebase convention. Project ID fixed from `brad-os-app` to `brad-os`.
- [x] **3 meal plans generated for human review** — All constraints verified passing (effort ranges, red meat rules, no duplicates, Friday eating out).

### Validation State

- **737 tests passing** across 35 test files
- Typecheck clean, lint clean
- Emulator seeded with correct snake_case field data
- All worktrees cleaned up, everything merged to main

### Key Commits on Main

```
f9ebe1a Fix type errors in meal planner migration script
3fa5b50 Merge branch 'store-section-script'
1a36801 Merge branch 'shopping-backend'
02f8e73 Add meal plan generation service with constraint-based algorithm
f8c13ed Add read-only ingredients and recipes API endpoints
ed096bd Add Meal CRUD with types, schemas, repository, handler, and tests
984123e Add store section assignment script for meal planner ingredients
```

Plus a subsequent commit fixing migration script field names to snake_case.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Field naming | snake_case everywhere (TS types + Firestore) | Matches existing exercise/workout codebase convention |
| Generation algorithm | Greedy, no backtracking | Processes breakfast/lunch first, then dinners in day order. Red meat filtered before selection. |
| Insufficient meals | 422 `INSUFFICIENT_MEALS` error | Distinct from 400 validation errors |
| `validatePlan` | Exported from generation service | Reusable in critique loop (Phase 3) |
| Read-only repos (shopping) | `Promise.reject()` stubs for abstract write methods | BaseRepository requires them; these repos are read-only |
| Spaghetti similarity | Deferred | User noted "Baked Spaghetti + Spaghetti is too much spaghetti" but said to handle it another day |
| Store section edge cases | Accepted as-is | chocolate chips → Snacks, guacamole/hummus → Condiments, beer/vermouth → Pantry Staples |

## What You Need to Know

### Your Operating Rules
1. **You are an orchestrator, not an implementer.** Dispatch subagents for all code changes, validation, and exploration. Protect your context window.
2. **All code changes happen in git worktrees** per CLAUDE.md. Branch from main, work in `../lifting-worktrees/<branch-name>`, merge back.
3. **Validation runs in subagents.** `npm run typecheck && npm run lint && npm test` produces verbose output — always delegate.
4. **The plans are detailed.** Each phase lists exact files, types, test cases, and success criteria. Feed these details to subagents.

### Gotchas
- **Barrel file conflicts**: Streams A1 and B both modified `index.ts`, `types/index.ts`, `schemas/index.ts`. Future parallel streams touching these files will need conflict resolution during merge. The fix is straightforward — keep all export lines from all branches.
- **Emulator state**: The emulator may not be running when you start. Data was exported/seeded. Check for `emulator-data/` directory or re-run the migration script if needed.
- **Migration script project ID**: Was fixed to `brad-os` (matching `.firebaserc`). If re-running migration, this is already correct.
- **Pork = red meat**: Pork chops and pork tenderloin are `has_red_meat: true` in the meal data. User hasn't objected.

## Next Steps

### Immediate: Human Review Checkpoint (YOU ARE HERE)

The user needs to approve the generated plans before proceeding. Three plans were already generated and presented. The user's only feedback was the spaghetti similarity issue (deferred). **Ask the user if the plans are approved to proceed to Step 3.**

### Step 3: Three Parallel Streams (after approval)

Per the sequencing plan, launch 3 streams simultaneously:

**Stream A2: Agent Backend — Critique + Finalize (Phases 3-4)**
- Plan: `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` Phases 3-4
- Creates: `mealplan-critique.service.ts`, `mealplan-operations.service.ts`, debug HTML UI, finalize endpoint
- Requires: `npm install openai` in packages/functions
- Requires: OpenAI API key via `defineSecret('OPENAI_API_KEY')`
- Gate: Debug HTML UI end-to-end against emulator, 5+ manual critiques

**Shopping List iOS (Phases 2-5)**
- Plan: `thoughts/shared/plans/2026-01-31-shopping-list-generation.md` Phases 2-5
- Creates: iOS models, RecipeCacheService, ShoppingListBuilder, ShoppingListFormatter
- All Swift code in `ios/BradOS/BradOSCore/`
- Gate: Xcode build + unit tests

**Note**: The sequencing plan shows these as Step 3 streams. Stream A2 depends on human sign-off (which is the current checkpoint). Shopping iOS Phases 2-5 depend on Streams B+C being done (they are).

### Step 4: Agent iOS (Phases 5-6)
- Depends on: Stream A2 complete (stable API contract)
- Creates: iOS models, API client, ViewModel, SwiftUI views for meal planning

### Step 5: Shopping List iOS Integration (Phases 6-7)
- Depends on: Steps 3 + 4 both complete
- Integrates shopping list into MealPlanViewModel and MealPlanView

### Human Checkpoints Remaining

| When | What |
|------|------|
| **NOW** | Approve generated plans → unblocks Step 3 |
| After Agent Phase 3 | Test debug HTML UI with 5+ critiques |
| After Step 5 | Full end-to-end on simulator |

## References

- Sequencing plan: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/2026-01-31-meal-planner-sequencing.md`
- Agent plan: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md`
- Shopping plan: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/2026-01-31-shopping-list-generation.md`
- Migration plan: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/2026-01-31-mealplanner-firebase-migration.md`
- Ingredient mapping: `/Users/bradcarter/Documents/Dev/brad-os/mealplanner-ingredient-mapping.json`
- Store section script: `/Users/bradcarter/Documents/Dev/brad-os/scripts/assign-store-sections.ts`
- Previous handoff: `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/handoffs/meal-planner-handoff-2026-01-31.md`
