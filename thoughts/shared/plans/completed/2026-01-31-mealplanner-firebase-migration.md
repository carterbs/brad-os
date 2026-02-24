# Meal Planner: Firebase Schema & Migration Plan

## Current State Analysis

### Size breakdown (30 MB PostgreSQL dump)

| Table | Rows | Size | % |
|---|---|---|---|
| `workflow_checkpoints` | 2,494 | 29.50 MB | 99.5% |
| `messages` | 723 | 0.12 MB | 0.4% |
| `ingredients` | 486 | 0.01 MB | <0.1% |
| `meals` | 82 | 0.007 MB | <0.1% |
| `recipe_steps` | 7 | 0.001 MB | <0.1% |
| `meal_plan_items` | 0 | — | — |
| `meal_plans` | 0 | — | — |

### Root cause

`workflow_checkpoints` stores LangGraph-style full-state snapshots at every agent workflow step. Each checkpoint contains the **entire meal plan** (21 slots × full meal objects with all ingredients + full shopping list) re-serialized as a ~12 KB JSON blob. With ~7.4 checkpoints per conversation across 336 threads, this produces 30 MB of nearly-identical repeated data.

### Data quality notes

- **Quantities are broken in the DB.** All 486 ingredient rows have `quantity = 0` and `unit = ''`. The real quantities only exist inside checkpoint JSON blobs (set by the agent at planning time). The migration must source quantities from checkpoint data, not the ingredients table.
- **`meal_plan_items` and `meal_plans` are unused** (0 rows). The workflow checkpoints replaced their purpose.
- **`recipe_steps` has only 7 rows** (one recipe: pizza sticks, meal_id=51). Most meals have no recipe steps.
- **77 of 82 meals have `last_planned` dates.** Range: Jan 2025 – Jul 2025.
- **11 meals have URLs** (recipe links).
- **Meal types:** 51 dinner, 18 breakfast, 12 lunch.
- **Effort scale:** 1–10 (mostly 1–4, one outlier at 6, one at 10).

---

## Firebase Schema Design

### Collection: `ingredients`

Canonical ingredient names. Single source of truth for what an ingredient _is_.

```
ingredients/{ingredientId}
├── name: string                    // "strawberries", "tortillas", "93% lean ground beef"
├── createdAt: timestamp
└── updatedAt: timestamp
```

**~150 unique ingredients** across all meals. Small enough to cache entirely client-side on app load. This collection exists so that shopping list aggregation can group by ID instead of fuzzy-matching strings like "strawberries" vs "Strawberries" vs "frozen strawberries".

### Collection: `meals`

Meal metadata only. No ingredients here — those live on the recipe.

```
meals/{mealId}
├── name: string                    // "Beef Tacos, tortilla chips"
├── mealType: string                // "breakfast" | "lunch" | "dinner"
├── effort: number                  // 1-5 relative effort scale
├── redMeat: boolean                // true/false
├── url: string | null              // recipe URL
├── lastPlannedAt: timestamp | null // last time this meal was used in a plan
├── recipeId: string | null         // ref to recipes collection (null for "Eating out")
├── createdAt: timestamp
└── updatedAt: timestamp
```

**Estimated size per document:** ~200 bytes. **Total: ~16 KB** for 82 meals.

### Collection: `recipes`

What you need and how to make it. One recipe per meal (1:1 relationship, but separated because recipe data is only needed when building a shopping list or viewing cooking instructions — not when browsing/selecting meals).

```
recipes/{recipeId}
├── mealId: string                  // back-reference for queries
├── ingredients: array              // what to buy
│   └── [{ ingredientId: string, quantity: number | null, unit: string | null }]
├── steps: array | null             // how to cook (only 1 meal has these currently)
│   └── [{ stepNumber: number, instruction: string }]
├── createdAt: timestamp
└── updatedAt: timestamp
```

**Why separate from meals?** Two distinct read patterns: (1) browsing meals to build a plan (need name/type/effort, don't need ingredients), and (2) generating a shopping list or viewing cooking instructions (need the recipe). Separating them means plan browsing reads 0 recipe documents.

**Why embed ingredients as an array rather than a subcollection?** Max ~12 ingredients per recipe, always read together as a batch, never queried independently. An array avoids 12 subcollection reads per recipe.

**Why quantities live here, not on ingredients?** An ingredient is "strawberries." A recipe says "2 cups of strawberries." Different recipes use different amounts of the same ingredient.

**Estimated size per document:** ~400 bytes. **Total: ~33 KB** for 82 recipes.

### Collection: `meal_plans`

One document per weekly plan. Replaces `meal_plan_items`, `meal_plans`, and the plan data currently buried in checkpoints.

```
meal_plans/{planId}
├── weekStartDate: timestamp        // Monday of the plan week
├── status: string                  // "draft" | "finalized" | "archived"
├── createdAt: timestamp
├── updatedAt: timestamp
├── threadId: string | null         // links to the conversation that created it
└── slots: array                    // 21 slots (7 days × 3 meals)
    └── [{
          dayIndex: number,         // 0-6 (Mon-Sun)
          mealType: string,         // "breakfast" | "lunch" | "dinner"
          mealId: string | null,    // reference to meals collection (null for "eating out")
          mealName: string          // denormalized for display without join
        }]
```

**Why `mealName` in slots?** Avoids 21 extra reads every time you display a plan. It's a display-only cache — the `mealId` is the source of truth. When a meal is renamed, existing plans keep their historical name (which is correct behavior for a plan that was already created).

**Shopping list derivation:**
1. Read `meal_plans/{planId}` → collect unique `mealId`s from slots
2. Batch-read those `meals` docs → collect `recipeId`s
3. Batch-read those `recipes` docs → collect `{ ingredientId, quantity, unit }` tuples
4. Group by `ingredientId`, sum quantities
5. Look up names from `ingredients` collection (cached client-side)

Three batch reads total. At this scale (~15 unique meals per plan), this is trivial.

**Estimated size per document:** ~1.5 KB. **Total for a year of plans: ~78 KB.**

### Collection: `conversations`

Lightweight conversation state for the agent. Replaces both `messages` and `workflow_checkpoints`.

```
conversations/{threadId}
├── status: string                  // "active" | "completed" | "abandoned"
├── currentStep: string             // "generate_plan" | "optimize_plan" | "present_plan" | "await_feedback"
├── planId: string | null           // reference to the mealPlan being worked on
├── createdAt: timestamp
├── updatedAt: timestamp
└── messages: subcollection
    └── messages/{messageId}
        ├── sender: string          // "user" | "agent" | "system"
        ├── content: string         // the message text
        └── createdAt: timestamp
```

**Why subcollection for messages?** Messages are loaded incrementally/paginated during a conversation. Subcollection allows Firestore query ordering and pagination. Average conversation is ~5 messages (94 bytes avg), so this is negligible.

**What we're dropping:** The entire `workflow_checkpoints` concept. No more full-state snapshots. The conversation tracks its `currentStep` and `planId` reference — that's all the agent needs to resume. If the agent needs the current plan state, it reads `meal_plans/{planId}`.

**Estimated size:** ~200 bytes per conversation doc + ~500 bytes per message subcollection. **Total: ~110 KB** for all historical data.

---

## Schema Summary

```
Firestore (prod)                       Firestore (dev)
├── ingredients/{id}                   ├── dev_ingredients/{id}
├── meals/{id}                         ├── dev_meals/{id}
├── recipes/{id}                       ├── dev_recipes/{id}
├── meal_plans/{id}                    ├── dev_meal_plans/{id}
└── conversations/{id}                 └── dev_conversations/{id}
    └── messages/{id}                      └── messages/{id}
```

**Collection naming convention:** All collection names use `snake_case` with `dev_` prefix for development, matching the existing brad-os pattern (e.g., `workout_sets` / `dev_workout_sets`). The migration script targets `dev_` collections by default and accepts a `--prod` flag for production.

**Projected total size: ~250 KB** (down from 30 MB — 99.2% reduction).

### Firestore indexes needed

```
meals:         mealType ASC, lastPlannedAt ASC    (query meals by type, sorted by staleness)
meals:         recipeId ASC                        (auto-indexed, lookup by recipe)
recipes:       mealId ASC                          (auto-indexed, lookup by meal)
meal_plans:     weekStartDate DESC                  (get most recent plan)
meal_plans:     status ASC, weekStartDate DESC      (get active/draft plans)
conversations: updatedAt DESC                      (recent conversations)
```

---

## Prerequisites

### Ingredient deduplication mapping (COMPLETE)

**File:** `mealplanner-ingredient-mapping.json` (repo root)

The existing `ingredients` table has 485 rows with 295 unique names. These contain case variants ("strawberries" / "Strawberries"), singular/plural duplicates ("egg" / "eggs"), semantic duplicates ("93% lean ground beef" / "lean ground beef"), and garbage data (truncated recipe instructions pasted as ingredient names).

Additionally, 72 ingredient IDs were deleted from the PG table but survive in checkpoint JSON blobs. Most are pantry staples (salt, pepper, olive oil) intentionally excluded from shopping lists. Some are real ingredients from newer meals that were caught in the cleanup.

The mapping file contains:
- **`mapping`**: Every raw name → canonical name, with decision rationale. 295/295 raw names covered.
- **`deleted_from_table`**: Categorized handling for the 72 checkpoint-only ingredients:
  - `pantry_staples_exclude`: salt, pepper, olive oil — skip, don't create ingredients
  - `pantry_staples_include`: honey, breakfast sausage, etc. — recover these
  - `garbage_exclude`: truncated instructions — skip
  - `real_ingredients_recover`: 21 real items from newer meals — recover these

**Result:** 295 raw names + recovered items → **232 canonical ingredients**

Decision breakdown: 160 kept as-is, 83 merged, 37 cleaned from garbage, 15 case-normalized, 6 singular→plural, 2 dropped.

---

## Migration Plan

### Phase 1: Build the `ingredients` collection

Consume `mealplanner-ingredient-mapping.json` to create the canonical ingredients collection.

**Migration script logic:**
1. Read the mapping file
2. Collect all unique canonical names from the `mapping` section
3. Collect additional canonical names from `deleted_from_table.pantry_staples_include` and `deleted_from_table.real_ingredients_recover`
4. Assign each canonical ingredient a Firestore document ID
5. Build a reverse mapping: `(old_ingredient_id) → (new_ingredientId)` by joining the PG `ingredients` table rows through the mapping
6. For checkpoint-only ingredients, map their old IDs through the `deleted_from_table` sections
7. Write to Firestore:

```javascript
db.collection('ingredients').doc(ingredientId).set({
  name: 'strawberries',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
})
```

**Expected result:** 232 ingredient documents.

### Phase 2: Extract and reconcile `last_planned` dates

The `meals` table has `last_planned` on 77/82 meals. The checkpoint JSON blobs also contain `last_planned` on meals embedded in the plan state. We need the **most recent** value from either source per meal.

**Migration script logic:**
1. Read all meals from the `meals` table with their `last_planned` values
2. Scan all `workflow_checkpoints` rows, parse JSON, extract `last_planned` per meal ID from the embedded meal objects
3. For each meal, take `MAX(db_last_planned, checkpoint_last_planned)`
4. Store in a lookup map for use in Phase 3

### Phase 3: Migrate meals + recipes

For each of the 82 meals:

1. Read the meal row from `meals` table
2. Read `ingredients` rows for that meal_id from the PG table
3. For meals with missing ingredients (IDs deleted from the table), recover ingredient data from the latest checkpoint JSON that references that meal. Cross-reference against `deleted_from_table` in the mapping file to determine handling (skip pantry staples/garbage, recover real items).
4. Map each ingredient raw name → canonical name using the mapping file, then canonical name → `ingredientId` from Phase 1
5. Skip any ingredient whose mapping decision is `"drop"` or that falls in `pantry_staples_exclude`
6. Read `recipe_steps` for this meal_id (only meal 51 has any)
7. Generate a `recipeId` for this meal
8. Write the meal document:

```javascript
db.collection('meals').doc(mealId).set({
  name,
  mealType,
  effort,
  redMeat,
  url: url || null,
  lastPlannedAt: reconciledDate,    // from Phase 2
  recipeId,                          // reference to recipe doc
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
})
```

9. Write the recipe document:

```javascript
db.collection('recipes').doc(recipeId).set({
  mealId,
  ingredients: [
    { ingredientId: 'abc', quantity: null, unit: null },
    { ingredientId: 'def', quantity: null, unit: null },
  ],
  steps: recipeSteps.length ? recipeSteps : null,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
})
```

**Note on quantities:** All 485 ingredient rows in the PG table have `quantity = 0` and `unit = ''`. The checkpoint JSON has some quantity data but it's inconsistent and agent-generated. Recipe ingredient quantities will migrate as `null` and can be populated later through the UI. The app functions without quantities — the shopping list shows what to buy, just not how much.

### Phase 4: Migrate conversations (messages only)

For each of the 140 unique thread_ids in `messages`:

1. Determine conversation status from the latest checkpoint for that thread (if it exists):
   - Has `current_step = 'await_feedback'` → `"completed"` or `"abandoned"` based on message content
   - No checkpoint → `"completed"` (historical)
2. Create conversation doc in Firestore
3. Batch-write all messages for that thread as subcollection docs

```javascript
// Conversation doc
db.collection('conversations').doc(threadId).set({
  status: derivedStatus,
  currentStep: latestCheckpointStep || null,
  planId: null,  // historical conversations don't link to plans
  createdAt: firstMessageDate,
  updatedAt: lastMessageDate,
})

// Messages subcollection
messages.forEach(msg => {
  db.collection('conversations').doc(threadId)
    .collection('messages').add({
      sender: msg.sender,
      content: msg.content,
      createdAt: msg.created_at,
    })
})
```

### Phase 5: Skip `workflow_checkpoints`, `meal_plan_items`, `meal_plans`

- **`workflow_checkpoints`** (29.5 MB): Do not migrate. All useful data (last_planned dates) has been extracted in Phase 2. The checkpoint replay mechanism is not being carried forward.
- **`meal_plan_items`** (0 rows): Nothing to migrate.
- **`meal_plans`** (0 rows): Nothing to migrate.

### Phase 6: Validate

After migration:
1. Verify ingredient count: 232 documents in `ingredients`
2. Verify meal count: 82 documents in `meals`, each with a `recipeId`
3. Verify recipe count: 82 documents in `recipes`, each with an `ingredients` array
4. Verify every recipe's `ingredientId` references resolve to a doc in `ingredients`
5. Verify no orphaned canonical names (every ingredient doc is referenced by at least one recipe)
6. Verify `lastPlannedAt` is set on 77+ meals
7. Verify conversation count: 140 documents in `conversations`
8. Verify total message count: 723 across all message subcollections
9. Spot-check 5 meals: name, type, effort, ingredient count match the original DB
10. Verify Firestore usage is under 500 KB total

---

## What Changes in the Agent Service

The agent-service currently uses LangGraph (or similar) with PostgreSQL checkpoint persistence. After migration:

1. **Drop checkpoint persistence entirely.** The agent reads/writes `conversations/{threadId}` for step tracking and `meal_plans/{planId}` for the plan being built. No more snapshotting full state.

2. **Workflow state is derived, not stored.** The agent's state at any point is:
   - What step am I on? → `conversations/{threadId}.currentStep`
   - What's the current plan? → `meal_plans/{planId}` (read it fresh)
   - What did the user say? → `conversations/{threadId}/messages` (query recent)

3. **When generating a plan**, the agent:
   - Queries `meals` by `mealType` sorted by `lastPlannedAt` ASC (prioritize stale meals)
   - Writes slot assignments to `meal_plans/{planId}`
   - On finalization, batch-updates `meals/{id}.lastPlannedAt` for every meal in the plan

4. **Shopping list** is computed on demand:
   - Read plan slots → collect mealIds
   - Batch-read meals → collect recipeIds
   - Batch-read recipes → collect `{ ingredientId, quantity, unit }` tuples
   - Group by `ingredientId`, sum quantities
   - Resolve names from cached `ingredients` collection
