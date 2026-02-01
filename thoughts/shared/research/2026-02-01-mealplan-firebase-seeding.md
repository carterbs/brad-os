# Meal Plan Firebase Seeding: Research Findings

## Date: 2026-02-01

## Summary

The migration script (`packages/functions/src/scripts/migrate-mealplanner.ts`) already handles dev/prod collection prefixing and emulator targeting. The gap is that it **only runs against the emulator** — there's no path for getting this data into the real Firebase project's Firestore (both dev and prod collections).

## Current State

### Migration Script (`migrate-mealplanner.ts`)

**What it does well:**
- Parses the PostgreSQL dump (`mealplanner.sql`, 30 MB) to extract meals, ingredients, recipe steps, messages, and checkpoint data
- Applies the canonical ingredient mapping (`mealplanner-ingredient-mapping.json`) to deduplicate 295 raw names → ~232 canonical ingredients
- Recovers "deleted" ingredients from checkpoint JSON where they're real items vs pantry staples
- Uses `dev_` prefix (default) or no prefix (`--prod` flag) for collection names
- Batched writes (450 per batch, under Firestore's 500 limit)
- Built-in validation phase that checks counts, referential integrity, and spot-checks specific documents

**What it writes (5 collections):**
1. `[dev_]ingredients` — ~232 canonical ingredient documents
2. `[dev_]meals` — 82 meal documents with metadata + `last_planned` dates
3. `[dev_]recipes` — 82 recipe documents with ingredient references + steps
4. `[dev_]conversations` — historical conversation threads
5. `[dev_]conversations/{id}/messages` — message subcollection

**Current limitation:** The script **requires** `FIRESTORE_EMULATOR_HOST` to be set — it exits immediately if not. This is a hard guard preventing accidental writes to production Firestore.

### Dev/Prod Separation Pattern

The codebase already has a well-established pattern for dev/prod:

- **`firebase.ts:getEnvironment()`** — detects env from Cloud Function name prefix (`devXxx` → dev, `prodXxx` → prod)
- **`firebase.ts:getCollectionName(baseName)`** — returns `dev_${baseName}` for dev, `baseName` for prod
- **`BaseRepository`** — calls `getCollectionName()` in its constructor, so all repos automatically use the correct prefix
- **`firebase.json`** — routes `/api/dev/*` to `devXxx` functions, `/api/prod/*` to `prodXxx` functions
- **Emulator config** — `export_on_exit: "emulator-data"` + `import: "emulator-data"` persists emulator data across restarts

### Collections in Scope

| Collection | Dev Name | Prod Name | Docs | Status |
|---|---|---|---|---|
| ingredients | `dev_ingredients` | `ingredients` | ~232 | Script writes these |
| meals | `dev_meals` | `meals` | 82 | Script writes these |
| recipes | `dev_recipes` | `recipes` | 82 | Script writes these |
| conversations | `dev_conversations` | `conversations` | ~140 | Script writes these |
| meal_plan_sessions | `dev_meal_plan_sessions` | `meal_plan_sessions` | 0 | Runtime-only, not seeded |

### Data Sources

1. **`mealplanner.sql`** (30 MB) — PostgreSQL dump with meals, ingredients, recipe_steps, messages, workflow_checkpoints
2. **`mealplanner-ingredient-mapping.json`** (22 KB) — Hand-curated canonical ingredient mapping with dedup decisions

## Key Architectural Facts

- The script initializes its own Firebase app with `projectId: 'brad-os'` — it doesn't go through the app's `firebase.ts` init
- The emulator auto-imports/exports data from `emulator-data/` directory
- The real Firestore project is `brad-os` (per `.firebaserc`)
- There are no Firestore security rules files in the repo (the emulator runs without rules)
- The script hardcodes the repo path: `/Users/bradcarter/Documents/Dev/brad-os`

## Open Questions for Plan

1. **Should the script target real Firestore directly?** Or should we use `firebase emulators:export` → some intermediate step → `gcloud firestore import`?
2. **Idempotency** — the script uses `batch.set()` which overwrites. Running it twice on the same target is safe (same doc IDs → overwrites with same data). But should we add a `--dry-run` mode?
3. **Firestore indexes** — the migration plan doc lists needed indexes. Are these deployed yet?
4. **Should conversations be seeded into prod?** They're historical agent conversations. Might only make sense for dev.
