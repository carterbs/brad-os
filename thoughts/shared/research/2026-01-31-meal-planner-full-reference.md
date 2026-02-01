# Meal Planner: Full Reference for iOS Port

## Architecture

Microservices app with 6 services:

| Service | Language | Protocol | Port | Role |
|---------|----------|----------|------|------|
| API Gateway | Go | REST | 8090 | REST-to-gRPC translation for UI |
| Meal Service | Go | gRPC | 50051 | Meal CRUD, plan generation, shopping lists |
| Agent Service | TypeScript/LangGraph | gRPC | 50053 | AI meal planning workflows |
| MCP Service | TypeScript | HTTP | 3001 | Model Context Protocol tools for agent |
| Logging Service | Go | gRPC | 50052 | Centralized logging |
| UI | React/TypeScript | HTTP | 3000 | Web frontend |

Database: PostgreSQL 14 (`mealuser` / `mealpass` / `mealplanner`)

---

## Data Model

| Entity | Key Fields |
|--------|------------|
| **Meal** | id, name, mealType (breakfast/lunch/dinner), effort (1-10), hasRedMeat (bool), url, lastPlanned (timestamp), ingredients[], steps[] |
| **Ingredient** | id, mealId, name, quantity, unit |
| **Step** | id, mealId, stepNumber, instruction |
| **MealPlanEntry** | dayIndex (0-6), mealType, meal |
| **WeeklyMealPlan** | days[] |
| **ShoppingListItem** | ingredient, quantity, category |
| **Message** | threadId, sender, content, createdAt |
| **CheckpointState** | threadId, participants, currentStep, mealPlan, shoppingList, feedbackHistory, iterationCount, isFinalized |

---

## Complete API Endpoint Reference

Proto definitions are in `/Users/bradcarter/Documents/Dev/meal-planner/proto/api.proto`.
Gateway handlers are in `/Users/bradcarter/Documents/Dev/meal-planner/api-gateway/main.go`.

### Health

| Method | Path | Handler (main.go) | Request Proto (api.proto) | Response Proto (api.proto) |
|--------|------|--------------------|---------------------------|---------------------------|
| GET | /api/health | :283 | Empty | HealthCheckResponse :129-133 |

Checks all 4 backend services (meal-service gRPC, agent-service gRPC, logging-service test message, MCP HTTP /health with 2s timeout). Returns "ok" or "degraded" with per-service status map.

### Meals

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| GET | /api/meals?type= | :491 | GetAllMealsRequest :162-164 | GetAllMealsResponse :166-168 |
| POST | /api/meals | :510 | CreateMealRequest :170-172 | CreateMealResponse :174-176 |
| PUT | /api/meals/{mealId} | :542 | UpdateMealRequest :224-227 | UpdateMealResponse :229-231 |
| DELETE | /api/meals/{mealId} | :744 | DeleteMealRequest :233-235 | DeleteMealResponse :237-239 |
| POST | /api/meals/swap | :590 | SwapMealRequest :178-181 | SwapMealResponse :183-185 |

### Meal Ingredients

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| POST | /api/meals/{mealId}/ingredients | :618 | CreateMealIngredientRequest :196-199 | CreateMealIngredientResponse :201-203 |
| PUT | /api/meals/{mealId}/ingredients/{ingredientId} | :659 | UpdateMealIngredientRequest :205-209 | UpdateMealIngredientResponse :211-213 |
| DELETE | /api/meals/{mealId}/ingredients/{ingredientId} | :709 | DeleteMealIngredientRequest :215-218 | DeleteMealIngredientResponse :220-222 |

### Recipe Steps

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| GET | /api/meals/{mealId}/steps | :799 | GetStepsRequest :242-244 | GetStepsResponse :246-248 |
| POST | /api/meals/{mealId}/steps | :827 | AddStepRequest :250-253 | AddStepResponse :255-257 |
| POST | /api/meals/{mealId}/steps/bulk | :868 | AddBulkStepsRequest :259-262 | AddBulkStepsResponse :264-266 |
| PUT | /api/meals/{mealId}/steps/{stepId} | :912 | UpdateStepRequest :268-272 | UpdateStepResponse :274-276 |
| DELETE | /api/meals/{mealId}/steps/{stepId} | :961 | DeleteStepRequest :278-281 | DeleteStepResponse :283-285 |
| PUT | /api/meals/{mealId}/steps/reorder | :997 | ReorderStepsRequest :287-290 | ReorderStepsResponse :292-294 |
| DELETE | /api/meals/{mealId}/steps | :1039 | DeleteAllStepsRequest :296-298 | DeleteAllStepsResponse :300-302 |

### Meal Plan

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| GET | /api/mealplan | :394 | Empty | GetMealPlanResponse :136-138 |
| POST | /api/mealplan/generate | :407 | Empty | GenerateMealPlanResponse :140-142 |
| POST | /api/mealplan/finalize | :422 | FinalizeMealPlanRequest :144-146 | FinalizeMealPlanResponse :148-150 |
| POST | /api/mealplan/replace | :771 | ReplaceMealRequest :187-191 | ReplaceMealResponse :192-194 |

### Shopping List

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| POST | /api/shoppinglist | :463 | GetShoppingListRequest :153-155 | GetShoppingListResponse :157-159 |

Accepts array of meal IDs, returns aggregated items with ingredient, quantity, category. Sums duplicate ingredient names, sorts alphabetically.

### Agent Workflows

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| POST | /api/agent/start | :1068 | StartAgentWorkflowRequest :305-307 | StartAgentWorkflowResponse :309-311 |
| POST | /api/agent/message | :1108 | MessageAgentRequest :313-315 | MessageAgentResponse :317-319 |
| GET | /api/agent/status/{threadId} | :1148 | GetWorkflowStatusRequest :321-323 | GetWorkflowStatusResponse :325-327 |
| GET | /api/agent/workflows | :1167 | Empty | ListWorkflowsResponse :329-331 |
| DELETE | /api/agent/workflows/{threadId} | :1182 | CancelWorkflowRequest :333-335 | CancelWorkflowResponse :337-339 |

### Workflow State

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| GET | /api/workflows/{threadId} | :1204 | GetWorkflowStateRequest :342-344 | GetWorkflowStateResponse :346-350 |
| POST | /api/workflows/{threadId}/abandon | :1225 | AbandonWorkflowRequest :352-354 | AbandonWorkflowResponse :356-358 |
| GET | /api/workflows/{threadId}/messages | :1285 | GetMessagesRequest :370-372 | GetMessagesResponse :374-376 |
| POST | /api/workflows/{threadId}/messages | :1247 | AddMessageRequest :360-364 | AddMessageResponse :366-368 |

### Checkpoints

| Method | Path | Handler | Request Proto | Response Proto |
|--------|------|---------|---------------|----------------|
| GET | /api/checkpoints/{thread_id}?checkpoint_ns= | :1313 | GetCheckpointRequest :419-422 | GetCheckpointResponse :424-427 |
| POST | /api/checkpoints | :1336 | PutCheckpointRequest :429-435 | PutCheckpointResponse :437-441 |
| GET | /api/checkpoints?limit=&before_thread_id= | :1363 | ListCheckpointsRequest :443-446 | ListCheckpointsResponse :448-450 |

---

## Features

### 1. Meal/Recipe CRUD

Core data management for the recipe library.

**UI: Library Panel**
- DataGrid with sortable columns (name, mealType, effort, actions)
- Text search (debounced, case-insensitive on name)
- Type filter buttons: All / Breakfast / Lunch / Dinner
- Row count display
- Click row to open editor, delete button per row

**UI: Add Recipe Form**
- Fields: name, URL, effort (1-10 slider), mealType dropdown, hasRedMeat toggle
- Ingredient textarea with smart parsing:
  - Unicode fraction conversion (½→0.5, ¼→0.25, ⅓→0.33, ¾→0.75, mixed like 1½→1.5)
  - Parses quantity, unit, ingredient name
  - Unknown units become part of ingredient name
  - "Double Quantities" button multiplies all amounts by 2
- StepsEditor with two modes:
  - Individual: add one at a time, inline edit, drag-and-drop reorder via @dnd-kit
  - Bulk: paste block of text, parses numbered lists, bullets (-, *, •), double-newline paragraphs, single-newline lines, or sentences

**UI: Recipe Editor**
- View/edit mode toggle
- Inline ingredient editing (add/update/delete)
- Steps editing with save
- Recipe URL shown as "View Recipe Online" link

### 2. Meal Plan Generation

Algorithmically generates a 7-day plan (21 slots: breakfast/lunch/dinner).

**Generation rules (meal-service):**
- Effort ranges per slot: breakfast/lunch 0-2; dinner varies by day (Mon 3-5, Sun 4-10)
- Excludes meals planned within last 3 weeks (lastPlanned filter)
- Red meat limited to non-consecutive dinners
- Friday dinner hardcoded to "Eating out"
- Random selection via `ORDER BY RANDOM() LIMIT 1`

**Finalization** updates lastPlanned dates for all meals in the plan.

### 3. Shopping List Generation

Aggregates ingredients from a set of meals into a consolidated list.

- Sums quantities for duplicate ingredient names
- Formats as "quantity unit name"
- Sorts alphabetically
- Returns items with ingredient, quantity, category fields

### 4. AI Agent Chat Workflow

LangGraph + OpenAI GPT-4.1 meal planning assistant.

**Workflow steps:**
1. **Initiate** — generate initial meal plan via MCP tools
2. **Optimize** — LLM validates constraints (max 2 consecutive high-effort meals, max 3 red meat/week, no duplicates) and fixes violations
3. **Present** — show plan to user
4. **Await Feedback** — pause for user input
5. **Apply Feedback** — LLM analyzes feedback, makes replacements using meal database
6. **Analyze Satisfaction** — nano LLM determines if user is satisfied
7. **Finalize** — persist plan, generate shopping list

**State:** LangGraph checkpoints in PostgreSQL `workflow_checkpoints` table as JSONB. Dual namespace strategy ("latest" + unique per save).

### 5. Session Persistence

Sessions survive page reloads via localStorage + checkpoint API.

1. On start: threadId → `localStorage['sessionId']`
2. On load: read threadId → fetch checkpoint → parse (handles multiple JSON encoding layers) → restore mealPlan + shoppingList + messages
3. On logout: abandon workflow → clear localStorage

### 6. Chat UI

Split-panel: chat (400px fixed left) + meal plan (flexible right).

- **ChatHeader**: Start Session / Logout buttons, Open Meal Library button
- **ChatMessages**: Welcome screen when empty, message bubbles with sender labels (AI/You), pre-wrap formatting
- **ChatInput**: TextField + Send button, Enter to send (Shift+Enter for newline), disabled during processing
- **TypingIndicator**: 3 animated bouncing dots with staggered 0.2s delays

**State flow:** Optimistic message append → API call → checkpoint sync → message history refresh

### 7. Meal Plan Display

Weekly card-based layout grouped Monday→Sunday.

- 3-column grid per day: breakfast | lunch | dinner
- Effort emoji: <=3 🙂 / 4-5 😅 / 6-7 😫 / >=8 🥵
- Placeholder `---` for empty slots
- **Highlight animation**: 5-second fade on changed meals, keyed by `{dayIndex}-{mealType}`
- Tabbed view: Meal Plan | Shopping List (disabled when no data)

### 8. Share/Export

Clipboard copy in dual format (rich HTML + plain text).

- Meal plan: HTML table with Day/Meals columns, formatted as "MealType: name (effort)"
- Shopping list: HTML unordered list or plain text bullets
- Uses ClipboardItem API with text/html + text/plain blobs, fallback to writeText()

### 9. Health Monitoring

Polls GET /api/health every 3 seconds on startup. Shows `<Connecting>` component with per-service status until all healthy. Ignores network exceptions (treats as healthy to allow loading).

### 10. Theming

Material-UI with custom color schemes. Three predefined schemes (sageAndCream, earthyNeutrals, naturalLinen), currently using earthyNeutrals. Fonts: Montserrat + Playfair Display. Custom MUI overrides for AppBar, Button, Card, Paper, Table, Tabs with sage-green tinted shadows.

---

## Frontend Architecture (React UI)

**No router** — conditional rendering based on state:
- Main view: AgentPage (chat + plan panel)
- Modal overlay: MealManagementPage (library/editor/add)

**Key hooks:**
- `useSession` — localStorage session restore + checkpoint fetch
- `useAgentController` — orchestrates sub-hooks below
- `useAgentSession` — session lifecycle (start/resume/logout)
- `useAgentMessages` — message history fetch + formatting
- `useAgentMealSync` — meal plan sync from checkpoints, send messages, shopping list fetch
- `useMealManagementController` — meal library CRUD, filtering, view switching
- `useMealPlanHighlights` — change detection + 5-second highlight animation

**Type system:** Protobuf-generated types (`@mealplanner/generated`) + OpenAPI gateway types (`GoMeal`, `GoIngredient` etc.) with converters between formats.

**API base URL:** `REACT_APP_API_URL` or `${window.location.protocol}//${window.location.hostname}:8090/api`

---

## Local Copies (in brad-os repo)

- `mealplanner.sql` — fresh DB dump (30 MB, taken 2026-01-31)
- `mealplanner-logs/docker-compose.log` — all container logs (128 MB)
- `mealplanner-logs/backend.log` (434 B)
- `mealplanner-logs/gateway.log` (258 B)

See also: `thoughts/shared/mealplanner-remote-reference.md` for service/credential details.
