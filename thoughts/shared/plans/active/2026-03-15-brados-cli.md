# BradOS CLI — Implementation Plan

## Overview

A single Rust binary `brados` that hits the Firebase API. Designed as a scriptable CLI for AI agents — JSON on stdout, errors on stderr, meaningful exit codes. Top-level noun subcommands (`meals`, `mealplan`, `shoppinglist`) with an architecture that makes adding new resource nouns (e.g. `workouts`) mechanical.

Includes a backend prerequisite: a new server-side shopping list generation endpoint so the aggregation logic lives in one place (not duplicated between iOS and CLI).

## Current State

- Rust workspace at repo root: `tools/dev-cli`, `tools/arch-lint`
- No existing cross-compilation setup
- No HTTP client dependencies in workspace yet
- API gated by Firebase App Check (debug token in `x-firebase-appcheck` header)
- Target host: `openclaw-vm`, Linux x86_64
- Shopping list generation currently lives entirely client-side in iOS (`ShoppingListBuilder.swift`)
- Backend already has `GET /recipes` and `GET /ingredients` endpoints that the iOS client uses

## Desired End State

```
brados mealplan generate          # POST /api/prod/mealplans/generate
brados mealplan latest            # GET  /api/prod/mealplans/latest
brados mealplan get <session_id>  # GET  /api/prod/mealplans/:sessionId
brados mealplan critique <session_id> "swap Monday dinner with pasta"
                                  # POST /api/prod/mealplans/:sessionId/critique
brados mealplan finalize <sid>    # POST /api/prod/mealplans/:sessionId/finalize

brados meals list                 # GET    /api/prod/meals
brados meals get <id>             # GET    /api/prod/meals/:id
brados meals create --name "Tacos" --meal-type dinner --effort 3 --url "..."
                                  # POST   /api/prod/meals
brados meals update <id> --effort 5
                                  # PUT    /api/prod/meals/:id
brados meals delete <id>          # DELETE /api/prod/meals/:id

brados shoppinglist generate              # from latest session
brados shoppinglist generate <session_id> # from specific session
                                  # GET /api/prod/mealplans/:sessionId/shopping-list

# --dev flag hits dev endpoints instead of prod
brados --dev meals list           # GET /api/dev/meals
brados --dev mealplan generate    # POST /api/dev/mealplans/generate
```

All output is JSON to stdout. Errors are JSON to stderr with non-zero exit.

Config via env vars:
- `BRADOS_API_URL` — base URL (default `https://brad-os.web.app/api/prod`)
- `BRADOS_APPCHECK_TOKEN` — App Check debug token

Global flag:
- `--dev` — hit dev endpoints (`/api/dev/...` instead of `/api/prod/...`)

## What We're NOT Doing

- Interactive prompts or TUI — this is for agents
- Local caching or state
- Colored terminal output — JSON only
- Reminders/todo integration (future — agent can read shopping list output and add items itself)
- Migrating iOS to use the new shopping list endpoint (future — could replace ShoppingListBuilder)

## Architecture

### CLI crate

```
tools/brados-cli/
├── Cargo.toml
└── src/
    ├── main.rs              # Parse top-level noun, dispatch
    ├── cli.rs               # clap derive structs (Cli, Commands, MealplanCmd, MealsCmd, ShoppingListCmd)
    ├── client.rs            # ApiClient: base URL, token, request helpers
    ├── error.rs             # CliError enum, JSON error output
    ├── output.rs            # Write JSON to stdout, errors to stderr
    ├── types.rs             # Rust structs mirroring API response types
    └── commands/
        ├── mod.rs
        ├── mealplan.rs      # mealplan subcommand handlers
        ├── meals.rs         # meals subcommand handlers
        └── shoppinglist.rs  # shopping list command (just hits the new endpoint)
```

### Backend addition

```
packages/functions/src/
├── services/
│   └── shopping-list.service.ts   # NEW: ShoppingListBuilder (port from iOS)
└── handlers/
    └── mealplans.ts               # ADD: GET /:sessionId/shopping-list route
```

### Extending to new resources

Adding `brados workouts list` requires:
1. Add `WorkoutsCmd` enum to `cli.rs`
2. Add `commands/workouts.rs` with handler functions
3. Add variant to top-level `Commands` enum in `cli.rs`
4. Wire dispatch in `main.rs`

The `ApiClient` is resource-agnostic — it provides `get()`, `post()`, `put()`, `delete()` that take a path and optional body. Each command module uses these primitives.

### Key Type Mappings (TS → Rust)

```rust
// API envelope
struct ApiSuccess<T> { success: bool, data: T }
struct ApiError { success: bool, error: ErrorDetail }
struct ErrorDetail { code: String, message: String, details: Option<serde_json::Value> }

// Meal
struct Meal {
    id: String,
    name: String,
    meal_type: MealType,     // "breakfast" | "lunch" | "dinner"
    effort: u8,
    has_red_meat: bool,
    prep_ahead: bool,
    url: String,
    last_planned: Option<String>,
    created_at: String,
    updated_at: String,
}

// MealPlan
struct MealPlanEntry {
    day_index: u8,
    meal_type: MealType,
    meal_id: Option<String>,
    meal_name: Option<String>,
}

struct MealPlanSession {
    id: String,
    plan: Vec<MealPlanEntry>,
    meals_snapshot: Vec<Meal>,
    history: Vec<ConversationMessage>,
    is_finalized: bool,
    created_at: String,
    updated_at: String,
}

struct ConversationMessage {
    role: String,  // "user" | "assistant"
    content: String,
    operations: Option<Vec<CritiqueOperation>>,
}

struct CritiqueOperation {
    day_index: u8,
    meal_type: MealType,
    new_meal_id: Option<String>,
}

// Critique response (returned by POST /:sessionId/critique)
struct CritiqueResult {
    plan: Vec<MealPlanEntry>,
    explanation: String,
    operations: Vec<CritiqueOperation>,
    errors: Vec<String>,
}

// Shopping list (returned by GET /:sessionId/shopping-list)
struct ShoppingList {
    sections: Vec<ShoppingListSection>,
}

struct ShoppingListSection {
    name: String,
    sort_order: u8,
    items: Vec<ShoppingListItem>,
}

struct ShoppingListItem {
    ingredient_id: String,
    name: String,
    store_section: String,
    total_quantity: Option<f64>,
    unit: Option<String>,
    meal_count: u32,
    display_text: String,  // "2 cups Broccoli" or just "Broccoli"
}
```

### Dependencies

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
ureq = { version = "3", features = ["json"] }
```

Minimal footprint. `ureq` is blocking (no tokio), compiles fast, produces small binaries.

## Implementation Phases

### Phase 0: Backend — Shopping list endpoint

Port the iOS `ShoppingListBuilder` logic to a server-side endpoint so both iOS and CLI can use it.

**New endpoint:** `GET /api/{env}/mealplans/:sessionId/shopping-list`

**Flow (mirrors iOS `ShoppingListBuilder.build()` + `RecipeCacheService.loadIfNeeded()`):**
1. Load session by `sessionId` → 404 if not found
2. Extract non-null `meal_id` values from `session.plan`
3. Fetch all recipes via `RecipeRepository.findAll()`
4. Fetch all ingredients via `IngredientRepository.findAll()`
5. Build lookup maps: `recipesByMealId`, `ingredientsById`
6. For each meal ID: find recipe → for each recipe ingredient → resolve ingredient name/section
7. Aggregate: group by ingredient ID, sum quantities when units match (null out both if units differ)
8. Group by `store_section`, sort sections by `sortOrder`, sort items alphabetically within sections
9. Build `display_text` for each item (e.g. "2 cups Broccoli" or just "Broccoli")

**Changes:**
- `packages/functions/src/services/shopping-list.service.ts` — NEW: `buildShoppingList(session, recipes, ingredients)` pure function
- `packages/functions/src/handlers/mealplans.ts` — ADD: `GET /:sessionId/shopping-list` route
- `packages/functions/src/schemas/mealplan.schema.ts` — ADD: `shoppingListResponseSchema` (Zod)
- `packages/functions/src/types/mealplan.ts` — ADD: `ShoppingList`, `ShoppingListSection`, `ShoppingListItem` types
- Tests: `packages/functions/src/__tests__/services/shopping-list.service.test.ts`

**Store section sort order (from iOS `StoreSection` enum):**
1. produce
2. dairy_and_eggs
3. meat_and_seafood
4. deli
5. bakery_and_bread
6. frozen
7. canned_and_jarred
8. pasta_and_grains
9. snacks_and_cereal
10. condiments_and_spreads
11. pantry_staples

**Response shape:**
```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "name": "Produce",
        "sort_order": 1,
        "items": [
          {
            "ingredient_id": "abc123",
            "name": "Broccoli",
            "store_section": "produce",
            "total_quantity": 2.0,
            "unit": "cups",
            "meal_count": 2,
            "display_text": "2 cups Broccoli"
          }
        ]
      }
    ]
  }
}
```

**Success criteria:**
- `npm run validate` passes
- Unit tests for `buildShoppingList` cover: normal aggregation, mixed units → null quantity, meals with no recipe, empty plan
- Deploy to dev: `npm run deploy:functions:dev`
- Manual test: `curl -H "x-firebase-appcheck: <token>" https://brad-os.web.app/api/dev/mealplans/<session_id>/shopping-list`

**Gate:** Endpoint returns correct shopping list for an existing session.

### Phase 1: Crate scaffold + ApiClient

**Changes:**
- `Cargo.toml` (workspace root): add `"tools/brados-cli"` to members
- `tools/brados-cli/Cargo.toml`: package, single `[[bin]] name = "brados"`, dependencies
- `src/main.rs`: clap parse → dispatch skeleton returning "not implemented" JSON
- `src/cli.rs`: full clap derive tree for all commands, `--dev` global flag
- `src/client.rs`: `ApiClient::new(base_url, token)` with `get()`, `post_empty()`, `post_json()`, `put_json()`, `delete()` — each returns `Result<serde_json::Value, CliError>`
- `src/error.rs`: `CliError` enum (MissingConfig, HttpError, ApiError, DeserializeError), implements Display, writes JSON to stderr
- `src/output.rs`: `fn print_json<T: Serialize>(data: &T)` → stdout, `fn print_error(err: &CliError)` → stderr
- `src/types.rs`: all Rust structs from the type mapping above

The `--dev` flag swaps the URL path segment: `base_url` defaults to `https://brad-os.web.app/api/prod` but becomes `https://brad-os.web.app/api/dev` with `--dev`. If `BRADOS_API_URL` is set, it's used as-is (no path swapping).

**Success criteria:**
- `cargo build -p brados-cli` compiles
- `BRADOS_APPCHECK_TOKEN=x brados mealplan generate` prints `{"error": "not implemented"}` and exits 1
- Missing `BRADOS_APPCHECK_TOKEN` prints a JSON error to stderr and exit 1
- `--dev` flag is accepted and changes the base URL

**Gate:** Confirm scaffold builds, then proceed.

### Phase 2: Mealplan commands

**Changes:**
- `src/commands/mealplan.rs`: implement all 5 handlers
  - `generate()` → `POST /mealplans/generate`, print session
  - `latest()` → `GET /mealplans/latest`, print session or null
  - `get(session_id)` → `GET /mealplans/{session_id}`, print session
  - `critique(session_id, message)` → `POST /mealplans/{session_id}/critique` with `{"critique": message}`, print critique result
  - `finalize(session_id)` → `POST /mealplans/{session_id}/finalize`, print result

Each handler: call `ApiClient`, deserialize into typed struct, serialize to stdout as JSON.

**Success criteria:**
- `brados --dev mealplan latest` returns real data from dev API
- `brados --dev mealplan generate` creates a session and prints the plan
- `brados --dev mealplan critique <sid> "remove Tuesday lunch"` returns updated plan
- `brados --dev mealplan finalize <sid>` returns `{"finalized": true}`
- API errors (404, 401, etc.) print JSON error to stderr, exit non-zero

**Gate:** Smoke test against dev.

### Phase 3: Meals CRUD + Shopping list commands

**Changes:**
- `src/commands/meals.rs`: implement all 5 handlers
  - `list()` → `GET /meals`
  - `get(id)` → `GET /meals/{id}`
  - `create(flags)` → `POST /meals` with JSON body built from --name, --meal-type, --effort, --has-red-meat, --prep-ahead, --url
  - `update(id, flags)` → `PUT /meals/{id}` with only provided flags
  - `delete(id)` → `DELETE /meals/{id}`
- `src/commands/shoppinglist.rs`: implement generate handler
  - `generate(session_id?)` → if no session_id, fetch latest first, then `GET /mealplans/{session_id}/shopping-list`

For `create`: all flags required (clap enforces).
For `update`: all flags optional, build JSON body from only what's provided.

**Success criteria:**
- `brados --dev meals list` returns array of meals
- `brados --dev meals create --name "Test" --meal-type dinner --effort 3 --url ""` creates and returns meal
- `brados --dev meals update <id> --effort 5` updates only effort
- `brados --dev meals delete <id>` deletes and exits 0
- `brados --dev shoppinglist generate` returns grouped shopping list from latest session
- `brados --dev shoppinglist generate <session_id>` returns shopping list for specific session
- Clean up test meal after verification

**Gate:** Smoke test against dev.

### Phase 4: Cross-compile + deploy

**Approach:** Use `cross` tool for cross-compilation (docker-based, zero config).

```bash
# One-time setup
cargo install cross

# Build
cross build -p brados-cli --release --target x86_64-unknown-linux-gnu

# Deploy
scp target/x86_64-unknown-linux-gnu/release/brados openclaw-vm:~/bin/brados
```

Alternative if `cross` is problematic: just `cargo build --release` on the remote via ssh.

**Changes:**
- Add a `scripts/deploy-brados.sh` thin wrapper:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  cross build -p brados-cli --release --target x86_64-unknown-linux-gnu
  scp target/x86_64-unknown-linux-gnu/release/brados openclaw-vm:~/bin/brados
  echo "Deployed brados to openclaw-vm:~/bin/brados"
  ```
- On remote: set `BRADOS_APPCHECK_TOKEN` in `~/.bashrc` or a `.env` file

**Success criteria:**
- `ssh openclaw-vm 'BRADOS_APPCHECK_TOKEN=xxx brados meals list'` returns meal data
- `ssh openclaw-vm 'BRADOS_APPCHECK_TOKEN=xxx brados --dev meals list'` hits dev

**Gate:** Works on remote.

### Phase 5: Tests

**Unit tests (inline `#[cfg(test)]`):**
- `cli.rs`: clap parsing produces correct command variants, `--dev` flag works
- `types.rs`: deserialize real API response JSON into typed structs (including shopping list)
- `error.rs`: CliError produces valid JSON
- `client.rs`: builds correct URLs and headers, `--dev` swaps path correctly
- `commands/*.rs`: given a mock client response, handlers produce correct stdout JSON

**Contract tests (`tests/`):**
- Binary exists and `--help` exits 0
- Missing env vars → JSON error on stderr, exit 1
- Invalid subcommand → clap error, exit 2
- `--dev` flag changes URL in output

**Coverage target:** 90%+ per AGENTS.md policy.

**Success criteria:**
- `cargo test -p brados-cli` passes
- Coverage meets floor

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit (TS) | `buildShoppingList` service | vitest, inline fixtures |
| Unit (Rust) | Arg parsing, type deserialization, error formatting, URL construction | `#[cfg(test)]` inline |
| Contract (Rust) | Binary behavior (env vars, help, bad args) | `tests/` calling compiled binary |
| Smoke | Real API round-trip (all endpoints) | Manual with dev env vars + `--dev` flag |

## References

- API types: `packages/functions/src/types/meal.ts`, `mealplan.ts`, `api.ts`
- Schemas: `packages/functions/src/schemas/mealplan.schema.ts`, `meal.schema.ts`
- Endpoints: `packages/functions/src/handlers/mealplans.ts`, `meals.ts`
- Auth middleware: `packages/functions/src/middleware/app-check.ts`
- iOS shopping list logic: `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/ShoppingListBuilder.swift`
- iOS store sections: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/ShoppingList.swift` (StoreSection enum, sort orders)
- Existing Rust patterns: `tools/dev-cli/`
