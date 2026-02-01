# Meal Planner Feature — Handoff

## Overview

- **Status**: Research & planning complete. No code written yet.
- **Primary Goal**: Port the meal planner from a standalone microservices app (linux-machine) into brad-os as Cloud Functions + iOS feature
- **Next Priority**: **Shopping list generation** — this is the most important next piece of work

## Context & Decisions

### What happened this session

1. Pulled a fresh PostgreSQL dump and Docker logs from linux-machine via SSH
2. Analyzed the entire original meal-planner codebase (6 microservices, Go + TypeScript, 35 HTTP endpoints, PostgreSQL)
3. Mapped all endpoints to proto definitions with line references
4. Derived the full frontend featureset from tests and UI code
5. Designed the agent critique loop for iOS
6. Researched Claude Agent SDK — determined it **does not work** (no OpenAI support, can't run in Cloud Functions)
7. Wrote a 7-phase implementation plan with per-phase testing strategy

### Key decisions made

| Decision | Choice | Why |
|----------|--------|-----|
| LLM orchestration | Direct OpenAI SDK | Single call per critique, structured output, no multi-step needed |
| Agent framework | None | <100 meals fit in system message. No MCP, no LangGraph, no Agent SDK |
| Initial plan generation | Algorithmic | Deterministic, fast, cheap. Agent only handles critiques |
| Conversation state | Firestore server-side | Survives app kills |
| Finalize | Button (not agent action) | Deliberate user action |
| Red meat limit | Max 2/week | User preference (original was 3) |
| Phase 3 testing | Throwaway HTML debug UI | Test LLM interaction before building iOS views |

### What we ruled out

- **Claude Agent SDK**: Only supports Claude models, requires persistent CLI runtime, incompatible with Cloud Functions
- **MCP**: Unnecessary — meal list is small enough to inject into system message
- **Streaming**: Single request/response per critique is sufficient
- **Recipe steps/ingredients in v1**: Just meals (name, type, effort, redMeat, url) for now

## Current State

### Completed
- [x] Database dump pulled: `/Users/bradcarter/Documents/Dev/brad-os/mealplanner.sql` (30 MB)
- [x] Logs pulled: `/Users/bradcarter/Documents/Dev/brad-os/mealplanner-logs/` (docker-compose.log 128 MB, backend.log, gateway.log)
- [x] Full endpoint reference with proto line numbers
- [x] Feature catalog documenting all 10 features
- [x] Implementation plan with 8 phases (0-7) and testing gates
- [x] Remote reference cheat sheet

### Not started
- [ ] Phase 0: Emulator setup & data migration
- [ ] Phase 1: Meal CRUD
- [ ] Phase 2: Meal plan generation
- [ ] Phase 3: Agent critique loop
- [ ] Phase 4: Finalize endpoint
- [ ] Phase 5: iOS data layer
- [ ] Phase 6: iOS views
- [ ] **Shopping list generation** (not yet planned — THIS IS NEXT)

### Blockers
- None. All research complete, plan approved.

## What's Missing: Shopping List Generation

The user explicitly stated **shopping list generation is the most important feature**. It is not yet covered in the implementation plan. The original meal-planner had this:

**Original implementation** (from research doc):
- `POST /api/shoppinglist` — accepts array of meal IDs, returns aggregated items
- Fetches all ingredients for the given meals
- Sums quantities for duplicate ingredient names
- Sorts alphabetically
- Returns items with `ingredient`, `quantity`, `category` fields

**What needs to happen**:
1. Decide whether to port ingredients into Firestore (required for shopping list) or find another approach
2. Design the shopping list data model for Cloud Functions
3. Add shopping list generation to the plan (probably as a new phase between current Phase 4 and Phase 5)
4. Plan the iOS UI for shopping list display (the original had a tabbed view: Meal Plan | Shopping List)
5. Consider clipboard/share export (original supported rich HTML + plain text copy)

**Key question**: The current plan explicitly scoped out ingredients ("just meals for now"). Shopping list generation **requires** ingredients. This needs to be reconciled — either bring ingredients into scope for v1 or find an alternative approach.

## File Locations

| File | What it is |
|------|-----------|
| `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md` | Implementation plan (7 phases + phase 0) |
| `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/research/2026-01-31-meal-planner-full-reference.md` | Complete reference: architecture, data model, all 35 endpoints, all 10 features, frontend architecture |
| `/Users/bradcarter/Documents/Dev/brad-os/thoughts/shared/mealplanner-remote-reference.md` | Service credentials, local file locations |
| `/Users/bradcarter/Documents/Dev/brad-os/mealplanner.sql` | Fresh PostgreSQL dump (2026-01-31) |
| `/Users/bradcarter/Documents/Dev/brad-os/mealplanner-logs/` | Docker container logs, backend.log, gateway.log |
| `/Users/bradcarter/Documents/Dev/brad-os/.claude/plans/enumerated-purring-blum.md` | Earlier draft plan (superseded by the thoughts/shared/plans version) |

### Original meal-planner codebase (local copy)

| Path | What it is |
|------|-----------|
| `/Users/bradcarter/Documents/Dev/meal-planner/` | Full original codebase |
| `/Users/bradcarter/Documents/Dev/meal-planner/api-gateway/main.go` | All 35 endpoint handlers with line references |
| `/Users/bradcarter/Documents/Dev/meal-planner/proto/api.proto` | Proto definitions for all request/response types |
| `/Users/bradcarter/Documents/Dev/meal-planner/meal-service/` | Go service with generation logic, shopping list, CRUD |
| `/Users/bradcarter/Documents/Dev/meal-planner/ui/` | React frontend |

### Brad-os patterns to follow

| Pattern | Reference file |
|---------|---------------|
| Cloud Function handler | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/handlers/barcodes.ts` |
| Repository (Firestore) | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/repositories/barcode.repository.ts` |
| Base repository | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/repositories/base.repository.ts` |
| Firebase init + env detection | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/firebase.ts` |
| Zod validation middleware | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/middleware/validate.ts` |
| Function exports (dev/prod) | `/Users/bradcarter/Documents/Dev/brad-os/packages/functions/src/index.ts` |
| iOS ViewModel | `/Users/bradcarter/Documents/Dev/brad-os/ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/BarcodeWalletViewModel.swift` |
| iOS Model + DTOs | `/Users/bradcarter/Documents/Dev/brad-os/ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Barcode.swift` |
| iOS API protocol | `/Users/bradcarter/Documents/Dev/brad-os/ios/BradOS/BradOSCore/Sources/BradOSCore/Protocols/APIClientProtocol.swift` |
| iOS View | `/Users/bradcarter/Documents/Dev/brad-os/ios/BradOS/BradOS/Views/Barcode/BarcodeWalletView.swift` |

## Next Steps (Prioritized)

1. **Plan shopping list generation** — Reconcile "no ingredients in v1" with "shopping list is most important". Likely need to bring ingredients into scope. Check the SQL dump for ingredient data, design Firestore schema, add to implementation plan.

2. **Start Phase 0** — Parse `mealplanner.sql`, write migration script, get emulator running with real meal data (and ingredients if shopping list is in scope).

3. **Execute phases sequentially** — Each phase has automated tests + manual gate. Phase 2 has a human sign-off requirement before Phase 3.

## Gotchas

- **linux-machine is no longer accessible** — we're not on the same network. All data has been pulled locally already. Don't try to SSH.
- **The `.claude/plans/enumerated-purring-blum.md` file is stale** — the real plan is in `thoughts/shared/plans/`. The .claude/plans version was an earlier draft before we added Phase 0, the debug UI, the testing strategy, and the red meat correction.
- **OpenAI API key** — will need `firebase functions:secrets:set OPENAI_API_KEY` before Phase 3 can work against real OpenAI. Emulator testing in Phase 3 can use the key from a local `.env` file.
- **The SQL dump is 30 MB** — it contains the full PostgreSQL database including schema, data, and sequences. The meal data is a small fraction. Parsing will need to extract just the INSERT statements for the meals (and ingredients) tables.
