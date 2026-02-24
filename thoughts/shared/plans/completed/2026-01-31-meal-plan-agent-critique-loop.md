# Meal Plan Agent Critique Loop

## Overview

Add meal planning to brad-os: algorithmic plan generation + an LLM-powered critique loop where users iteratively refine their weekly meal plan. The full meal library (<100 items) is injected into the system message — no MCP or agent framework needed. Direct OpenAI SDK call with structured output per critique.

## Current State

- Meal data exists in a PostgreSQL dump (`mealplanner.sql`, 30 MB) that needs to be migrated to Firestore
- No meal-related code exists in brad-os yet (backend or iOS)
- Backend uses Cloud Functions v2 (Express apps) with Firestore, following repository pattern
- iOS app uses MVVM with protocol-based API client, SwiftUI views, BradOSCore package

## Desired End State

1. Meals collection in Firestore with full CRUD
2. Cloud Function that generates a 7-day meal plan algorithmically
3. Cloud Function that takes a critique string, calls OpenAI with structured output, returns updated plan
4. Cloud Function to finalize a plan (updates lastPlanned dates)
5. Firestore session documents storing plan state + conversation history
6. iOS views: meal plan grid, critique chat input, finalize button

## What We're NOT Doing

- Recipe steps/ingredients management (just meals for now — name, type, effort, redMeat, url)
- Shopping list generation (can add later from meal ingredients)
- Full recipe editor UI on iOS (add/edit meals can come later)
- Streaming responses (single request/response per critique is fine)
- MCP, LangGraph, or any agent framework

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM orchestration | Direct OpenAI SDK | Single call per critique, no multi-step reasoning needed |
| Agent framework | None | <100 meals fit in system message, structured output handles all operations |
| Initial generation | Algorithmic | Deterministic, fast, cheap. Agent only for critiques |
| Conversation state | Firestore server-side | Survives app kills |
| Finalize | Button, not agent action | Deliberate user action, prevent accidental finalization |
| Secrets | Firebase defineSecret() | OPENAI_API_KEY via Google Secret Manager |

## Structured Output Schema

The model returns a list of operations per critique:

```typescript
interface CritiqueResponse {
  explanation: string;  // "Swapped Tuesday dinner from X to Y because..."
  operations: Array<{
    dayIndex: number;          // 0-6 (Mon-Sun)
    mealType: 'breakfast' | 'lunch' | 'dinner';
    newMealId: string | null;  // Firestore doc ID, or null to remove
  }>;
}
```

Operations cover: **swap** (set slot to different meal), **add** (fill empty slot), **remove** (clear slot, newMealId=null).

---

## ~~Phase 0: Emulator Setup & Data Migration~~ (REMOVED)

> **Removed.** This phase is fully covered by the Firebase Migration plan (`2026-01-31-mealplanner-firebase-migration.md`). The migration script handles parsing `mealplanner.sql`, deduplicating ingredients, and populating all Firestore collections. This plan assumes migration is complete before Phase 1 begins.

---

## Phase 1: Data Model & Meal CRUD

Port meal data to Firestore and build standard CRUD following existing patterns. **Prerequisite:** Firebase migration complete with meals in Firestore emulator.

### Files to create:

**Types** — `packages/functions/src/types/meal.ts`
```typescript
interface Meal extends BaseEntity {
  name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  effort: number;            // 1-10
  has_red_meat: boolean;
  url: string;
  last_planned: string | null;  // ISO timestamp
}

interface CreateMealDTO { name, meal_type, effort, has_red_meat, url }
interface UpdateMealDTO { name?, meal_type?, effort?, has_red_meat?, url?, last_planned? }
```

**Types** — `packages/functions/src/types/mealplan.ts`
```typescript
interface MealPlanEntry {
  day_index: number;    // 0-6
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  meal_id: string | null;
  meal_name: string | null;
}

interface MealPlanSession extends BaseEntity {
  plan: MealPlanEntry[];
  meals_snapshot: Meal[];    // frozen copy of meal library at generation time
  history: ConversationMessage[];
  is_finalized: boolean;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  operations?: CritiqueOperation[];
}

interface CritiqueOperation {
  day_index: number;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  new_meal_id: string | null;
}
```

**Schema** — `packages/functions/src/schemas/meal.schema.ts`
- Zod schemas for CreateMealDTO, UpdateMealDTO

**Schema** — `packages/functions/src/schemas/mealplan.schema.ts`
- Zod schema for critique input: `{ critique: string }`
- Zod schema for finalize: (no body needed, sessionId from URL param)

**Repository** — `packages/functions/src/repositories/meal.repository.ts`
- Extends BaseRepository<Meal, CreateMealDTO, UpdateMealDTO>
- Collection: `'meals'`
- Additional method: `findByType(mealType)`, `updateLastPlanned(id, timestamp)`

**Repository** — `packages/functions/src/repositories/mealplan-session.repository.ts`
- Extends BaseRepository for MealPlanSession
- Collection: `'meal_plan_sessions'`
- Methods: standard CRUD + `appendHistory(sessionId, message)`, `updatePlan(sessionId, entries)`

**Handler** — `packages/functions/src/handlers/meals.ts`
- Express app following barcodes.ts pattern exactly
- Routes: GET /, GET /:id, POST /, PUT /:id, DELETE /:id
- stripPathPrefix('meals'), requireAppCheck, validate middleware

**Exports** — `packages/functions/src/index.ts`
- Add `devMeals` and `prodMeals` exports

**Shared** — Update `types/index.ts`, `schemas/index.ts` with new exports

### Testing:

**Unit tests:**
- Repository: create, findById, findAll, findByType, update, delete, updateLastPlanned
- Handler: request validation (bad meal_type rejected, missing name rejected), CRUD responses
- Schema: valid/invalid inputs for create and update schemas

**Integration test:**
- Full CRUD lifecycle: create → read → update → read → delete → confirm gone

**Manual gate:**
- Start emulator, run migration from Phase 0
- curl each endpoint against the emulator:
  - `GET /api/dev/meals` — returns all migrated meals
  - `GET /api/dev/meals/:id` — returns single meal
  - `POST /api/dev/meals` — creates a meal, verify in emulator UI
  - `PUT /api/dev/meals/:id` — updates a field
  - `DELETE /api/dev/meals/:id` — removes it
- Confirm Firestore documents in emulator UI match expected shape

### Success criteria:
- `npm run typecheck && npm run lint && npm test` passes
- All curl commands above return correct responses
- Emulator UI shows correct Firestore documents

---

## Phase 2: Meal Plan Generation

Algorithmic generation matching original meal-service rules.

### Files to create:

**Service** — `packages/functions/src/services/mealplan-generation.service.ts`

Generation rules:
- 7 days (Mon-Sun) × 3 meal types = 21 slots
- Breakfast/lunch: select from meals with effort ≤ 2
- Dinner effort varies: Mon 3-5, Tue 3-6, Wed 3-6, Thu 3-6, Fri skip ("Eating out"), Sat 4-8, Sun 4-10
- Exclude meals where last_planned is within 3 weeks
- Red meat: non-consecutive dinner days, **max 2 red meat dinners per week**
- No meal repeated in the plan
- Random selection within constraints

Input: full meals array
Output: MealPlanEntry[]

**Handler** — `packages/functions/src/handlers/mealplans.ts`

Routes:
- `POST /generate` — calls generation service, creates Firestore session, returns { session_id, plan }
- `GET /:sessionId` — returns current session state
- `POST /:sessionId/critique` — Phase 3
- `POST /:sessionId/finalize` — Phase 4

**Exports** — Add `devMealplans` and `prodMealplans` to index.ts

### Testing:

**Unit tests — each constraint isolated:**
- Effort filtering: given meals with various efforts, breakfast/lunch slots only contain effort ≤ 2
- Dinner effort per day: Monday dinner is effort 3-5, Sunday dinner is effort 4-10, etc.
- Recency exclusion: meals with last_planned < 3 weeks ago are excluded
- Red meat non-consecutive: no two adjacent dinner days both have red meat
- Red meat max 2/week: at most 2 dinners in a plan have red meat
- No duplicates: no meal ID appears twice in the plan
- Friday dinner: always "Eating out" (null meal_id with meal_name "Eating out")
- Edge case: insufficient meals in pool — service returns partial plan or clear error

**Stress test:**
- Run generation 100 times against the real meal dataset
- Assert all constraints hold on every run (randomness must not break invariants)

**Integration test:**
- POST /generate → verify session created in Firestore with plan + meals_snapshot
- GET /:sessionId → returns same session

**Manual gate:**
- curl `POST /api/dev/mealplans/generate` against emulator with migrated meals
- Inspect returned plan: eyeball effort levels per slot, check red meat distribution
- Inspect Firestore session document: plan array, meals_snapshot populated

### Success criteria:
- All unit tests pass including 100-run stress test
- `npm run typecheck && npm run lint && npm test` passes
- Manual inspection of 3+ generated plans looks reasonable

### **HUMAN SIGN-OFF REQUIRED before proceeding to Phase 3**
Generate several plans via the emulator endpoint. Review them for sanity. Confirm the algorithmic rules produce plans you'd actually want to eat. Adjust effort ranges or constraints if needed before the agent layer builds on top of this.

---

## Phase 3: Agent Critique Loop

The core feature: OpenAI structured output for plan modifications.

### Files to create:

**Service** — `packages/functions/src/services/mealplan-critique.service.ts`

```typescript
async function processCritique(
  session: MealPlanSession,
  critique: string,
  apiKey: string
): Promise<CritiqueResponse>
```

1. Build system message with:
   - Role description
   - Full meal table from `session.meals_snapshot` (id, name, type, effort, redMeat)
   - Current plan grid
   - Constraint rules (including max 2 red meat/week)
   - JSON output schema description
2. Build messages array from `session.history` + new critique
3. Call `openai.chat.completions.create()` with:
   - model: configurable (default `gpt-4o`)
   - response_format: `{ type: 'json_schema', json_schema: critiqueResponseSchema }`
   - messages: system + history + user critique
4. Parse response, validate operations (meal IDs exist, slot indices valid)
5. Return CritiqueResponse

**Service** — `packages/functions/src/services/mealplan-operations.service.ts`

Pure function that applies operations to a plan:

```typescript
function applyOperations(
  plan: MealPlanEntry[],
  operations: CritiqueOperation[],
  mealsSnapshot: Meal[]
): { updatedPlan: MealPlanEntry[]; errors: string[] }
```

Validates each operation:
- dayIndex 0-6, mealType valid
- newMealId exists in meals_snapshot (or is null for remove)
- No duplicate meals after applying all operations
- Skips invalid operations, collects errors

**Handler route** — `POST /:sessionId/critique` in mealplans.ts

1. Validate body with Zod (`{ critique: string }`)
2. Fetch session from Firestore (404 if not found, 400 if finalized)
3. Call critique service
4. Apply operations via operations service
5. Append user message + assistant response to history
6. Update Firestore session
7. Return updated plan + explanation + operations + any validation errors

**OpenAI setup:**
- `npm install openai` in packages/functions
- Secret: `defineSecret('OPENAI_API_KEY')` in index.ts
- Pass to handler via function options: `{ secrets: [openaiApiKey] }`

**Dry-run HTML UI** — `packages/functions/src/handlers/mealplan-debug.ts`

A simple HTML page served by a Cloud Function for manually testing the critique loop against the emulator. No frameworks, no build step — just inline HTML + JS.

```
GET /debug — serves the HTML page
```

The page:
- Calls POST /generate on load to get a session
- Displays the plan as an HTML table (day rows × meal type columns)
- Has a text input + "Send Critique" button
- On submit: calls POST /:sessionId/critique, displays updated plan + explanation
- Shows conversation history below the table
- Shows raw JSON responses in a collapsible debug section
- "Finalize" button at the bottom
- "Regenerate" button to start over

This is throwaway test tooling — does NOT need to be pretty. Purpose is to:
1. Verify the full generate → critique → critique → finalize flow end-to-end
2. See what the model actually returns for various critiques
3. Catch prompt engineering issues before building the iOS UI
4. Test edge cases interactively (ask for impossible things, remove all meals, etc.)

Only runs in emulator (gated by `FUNCTIONS_EMULATOR` check). Not deployed to prod.

### Testing:

**Unit tests — prompt construction:**
- Given a session with 5 meals and a 3-entry plan, verify system message contains correct meal table and plan grid
- Given history with 2 previous critiques, verify messages array has correct role/content pairs
- Verify constraint rules text includes "max 2 red meat dinners per week"

**Unit tests — operation application (mealplan-operations.service.ts):**
- Swap: valid meal ID replaces existing slot
- Add: null slot gets filled with valid meal
- Remove: existing slot set to null
- Invalid meal ID: operation skipped, error collected
- Out-of-range dayIndex: operation skipped, error collected
- Duplicate after swap: operation skipped, error collected
- Multiple operations in one response: all applied in order
- Empty operations array: plan unchanged

**Unit tests — critique service with mocked OpenAI:**
- Mock `openai.chat.completions.create()` to return canned CritiqueResponse JSON
- Verify service parses response correctly
- Verify service handles malformed JSON from model (fallback/error)
- Verify service handles OpenAI API errors (rate limit, timeout)

**Integration test:**
- Full flow against emulator: generate → critique → verify plan changed → critique again → finalize
- Verify Firestore session has correct history length and plan state after each step

**Manual gate — the HTML debug UI:**
- Open debug page in browser pointing at emulator
- Generate a plan, review it
- Send 3-5 different critiques:
  - "Swap Monday dinner for something easier"
  - "I don't want red meat on Tuesday"
  - "Remove all of Monday's meals, I'm starting on Tuesday"
  - "This looks good" (should return empty operations)
  - Something adversarial: "Replace everything with pizza"
- Verify the model's responses are sensible
- Verify the plan updates correctly after each critique
- Finalize and confirm lastPlanned timestamps updated

### Success criteria:
- All unit tests pass
- `npm run typecheck && npm run lint && npm test` passes
- Debug UI works end-to-end against emulator
- 5+ manual critiques produce sensible results
- Finalize updates lastPlanned correctly

---

## Phase 4: Finalize Endpoint

**Handler route** — `POST /:sessionId/finalize` in mealplans.ts

1. Fetch session
2. Reject if already finalized (400)
3. For each meal in the plan (non-null meal_id entries):
   - Update `last_planned` to current timestamp via meal repository
4. Set `session.is_finalized = true`
5. Update Firestore session
6. Return success

### Testing:

**Unit tests:**
- lastPlanned updated for all non-null meal_id entries
- Null meal_id entries (removed slots, "Eating out") skipped
- Double-finalize returns 400 error
- Session marked as finalized in Firestore

**Integration test:**
- Generate → finalize → verify meal documents have updated last_planned
- Generate → finalize → finalize again → 400

**Manual gate:**
- Already covered by the debug UI in Phase 3

### Success criteria:
- All unit tests pass
- `npm run typecheck && npm run lint && npm test` passes

---

## Phase 5: iOS Data Layer

Add meal plan models and API methods to the iOS app.

### Files to create:

**Model** — `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Meal.swift`
- `Meal` struct (Identifiable, Codable, Hashable, Sendable)
- CodingKeys mapping: meal_type, has_red_meat, last_planned, etc.

**Model** — `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MealPlan.swift`
- `MealPlanEntry` struct
- `MealPlanSession` struct (id, plan, history, isFinalized)
- `ConversationMessage` struct
- `CritiqueResponse` struct (explanation, operations)

**API Protocol** — Add to `APIClientProtocol.swift`:
```swift
// MARK: - Meal Plans
func generateMealPlan() async throws -> MealPlanSession
func getMealPlanSession(id: String) async throws -> MealPlanSession
func critiqueMealPlan(sessionId: String, critique: String) async throws -> CritiqueResponse
func finalizeMealPlan(sessionId: String) async throws
```

**API Client** — Add implementations to `APIClient.swift`:
- `generateMealPlan()` → POST /mealplans/generate
- `getMealPlanSession(id:)` → GET /mealplans/{id}
- `critiqueMealPlan(sessionId:critique:)` → POST /mealplans/{id}/critique
- `finalizeMealPlan(sessionId:)` → POST /mealplans/{id}/finalize

**Mock Client** — Add mock implementations to `MockAPIClient.swift`

### Testing:

**Decoding tests:**
- Capture real JSON responses from emulator (from Phase 3 debug UI testing)
- Save as test fixtures
- Write Swift tests that decode each fixture into the corresponding model
- Assert all fields populated correctly — catches CodingKeys mismatches

**Compile gate:**
- Xcode build succeeds with new models, protocol methods, client methods, and mock methods

### Success criteria:
- All decoding tests pass
- Xcode build succeeds
- API methods added to protocol, real client, and mock client

---

## Phase 6: iOS Views

### Files to create:

**ViewModel** — `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift`

```swift
@MainActor public class MealPlanViewModel: ObservableObject {
  @Published public var session: MealPlanSession?
  @Published public var isLoading = false
  @Published public var isSending = false
  @Published public var error: String?
  @Published public var critiqueText = ""
  @Published public var lastExplanation: String?

  func generatePlan() async       // POST /generate
  func sendCritique() async       // POST /critique with critiqueText
  func finalize() async           // POST /finalize
}
```

**View** — `ios/BradOS/BradOS/Views/MealPlan/MealPlanView.swift`

Main container with states:
- No session: "Generate Plan" button
- Has session: plan grid + critique input + finalize button
- Finalized: plan grid with "Finalized" badge

**View** — `ios/BradOS/BradOS/Views/MealPlan/MealPlanGridView.swift`

Weekly grid display:
- 7 day rows (Mon-Sun)
- 3 columns per day (breakfast, lunch, dinner)
- Meal name + effort emoji (<=3 easy, 4-5 medium, 6-7 hard, >=8 very hard)
- Empty slots show "—"
- Highlight animation on recently changed slots (optional, nice-to-have)

**View** — `ios/BradOS/BradOS/Views/MealPlan/CritiqueInputView.swift`

Chat-like input area:
- TextField for critique text
- Send button (disabled while sending)
- Last explanation displayed above input (assistant's response)
- Conversation history scrollable above that

**Navigation** — Add to `MainTabView.swift` or `ActivitiesView.swift`:
- Entry point to meal planning (button or tab)

### Testing:

**By this point, risk is low** — the backend contract is validated (Phase 3 debug UI), the models decode correctly (Phase 5 decoding tests), and the ViewModel is straightforward async wiring.

**Manual testing on simulator:**
- Run iOS app against emulator
- Generate a plan → verify grid displays correctly
- Send a critique → verify plan updates and explanation shows
- Send 2-3 more critiques → verify history accumulates
- Finalize → verify badge shows, critique input disabled
- Kill and relaunch app → verify session restored from UserDefaults + API

### Success criteria:
- Can generate a plan and see it displayed
- Can type a critique and see the plan update
- Can finalize and see confirmation
- Session persists across app kills (session ID in UserDefaults, fetched from Firestore on launch)

---

## Testing Strategy Summary

| Phase | Automated Tests | Manual Gate | Blocks |
|-------|----------------|-------------|--------|
| ~~0~~ | ~~Removed — covered by Firebase Migration plan~~ | — | — |
| 1 | Repo + handler + schema unit tests, integration test | curl all CRUD endpoints | Phase 2 |
| 2 | Constraint unit tests (each rule isolated), 100-run stress test, integration test | **HUMAN SIGN-OFF**: review generated plans for sanity | Phase 3 |
| 3 | Prompt construction tests, operation application tests, mocked OpenAI tests, integration test | **Debug HTML UI**: 5+ manual critiques with eyeball verification | Phase 4, 5 |
| 4 | Finalize unit tests, double-finalize rejection | Covered by Phase 3 debug UI | Phase 5 |
| 5 | Model decoding tests from captured JSON fixtures, Xcode build | — | Phase 6 |
| 6 | — | Full flow on iOS simulator against emulator | Done |

**Key risk mitigation:**
- Phase 2 human sign-off prevents building an agent on top of broken generation
- Phase 3 debug HTML UI lets you test the LLM interaction cheaply before building iOS views
- Phase 5 decoding tests catch serialization mismatches before any UI work
- Every phase runs `npm run typecheck && npm run lint && npm test` before moving on

---

## References

- Full meal planner research: `thoughts/shared/research/2026-01-31-meal-planner-full-reference.md`
- Remote reference: `thoughts/shared/mealplanner-remote-reference.md`
- DB dump: `mealplanner.sql` (repo root)
- Existing handler pattern: `packages/functions/src/handlers/barcodes.ts`
- Existing repo pattern: `packages/functions/src/repositories/barcode.repository.ts`
- iOS view pattern: `ios/BradOS/BradOS/Views/Barcode/BarcodeWalletView.swift`
- iOS ViewModel pattern: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/BarcodeWalletViewModel.swift`
