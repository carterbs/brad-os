# Meal Plan Data: Firebase Seeding Plan

## Overview

Modify the existing migration script (`packages/functions/src/scripts/migrate-mealplanner.ts`) to support writing directly to real Firebase Firestore, not just the emulator. Remove conversation migration (Phase 4). Support both dev and prod collections.

## Current State

The script at `migrate-mealplanner.ts` already:
- Parses `mealplanner.sql` and `mealplanner-ingredient-mapping.json`
- Writes `ingredients`, `meals`, `recipes`, `conversations` to Firestore
- Supports `dev_` prefix (default) or no prefix (`--prod`)
- Uses batched writes (450/batch) with validation
- **Hard-requires** `FIRESTORE_EMULATOR_HOST` — exits if not set (line 731-736)
- Initializes its own Firebase app with `projectId: 'brad-os'` (line 742)

## Desired End State

```bash
# Emulator (existing behavior, still works):
FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx packages/functions/src/scripts/migrate-mealplanner.ts

# Real Firebase — dev collections:
npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase

# Real Firebase — prod collections:
npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase --prod

# Seed BOTH dev and prod in one go:
npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase --all
```

Script writes 3 collections (conversations removed):
- `[dev_]ingredients` — ~232 docs
- `[dev_]meals` — 82 docs (with `last_planned` dates)
- `[dev_]recipes` — 82 docs

## What We're NOT Doing

- **Conversations** — skipped entirely. Historical agent threads aren't needed.
- **Firestore indexes** — not part of this script. Deploy separately if needed.
- **New data model changes** — the document shapes stay the same.

---

## Implementation

### Changes to `migrate-mealplanner.ts`

**1. Replace emulator guard with target detection**

Current (line 731-736):
```typescript
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('ERROR: FIRESTORE_EMULATOR_HOST is not set.');
  // ...
  process.exit(1);
}
```

New:
```typescript
const isFirebase = process.argv.includes('--firebase');
const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (!isFirebase && !isEmulator) {
  console.error('ERROR: Must specify target.');
  console.error('  Emulator: FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx <script>');
  console.error('  Firebase:  npx tsx <script> --firebase [--prod | --all]');
  process.exit(1);
}

if (isFirebase && isEmulator) {
  console.error('ERROR: --firebase and FIRESTORE_EMULATOR_HOST are mutually exclusive.');
  process.exit(1);
}
```

**2. Add `--all` flag for seeding both dev and prod**

```typescript
const isProd = process.argv.includes('--prod');
const isAll = process.argv.includes('--all');
const prefixes: string[] = isAll ? ['dev_', ''] : [isProd ? '' : 'dev_'];
```

Then wrap the phase execution in a loop over `prefixes`.

**3. Add confirmation prompt for real Firebase**

When `--firebase` is used (no emulator), print a confirmation before writing:

```typescript
if (isFirebase) {
  const targets = prefixes.map(p => p === '' ? 'PROD (no prefix)' : `DEV (${p})`).join(', ');
  console.log(`\n⚠ WRITING TO REAL FIREBASE: project "brad-os"`);
  console.log(`  Target collections: ${targets}`);
  console.log(`  Press Ctrl+C within 5 seconds to abort...`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

**4. Firebase init: handle both emulator and real**

Current (line 742):
```typescript
const app = initializeApp({ projectId: 'brad-os' });
```

For real Firebase, the admin SDK needs credentials. Use a **service account key** from the Firebase Console (Project Settings → Service Accounts → Generate New Private Key). Pass it via `GOOGLE_APPLICATION_CREDENTIALS`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npx tsx ... --firebase --all
```

The `initializeApp({ projectId: 'brad-os' })` call works for both targets — when `FIRESTORE_EMULATOR_HOST` is set, firebase-admin automatically routes to the emulator. When it's not set and `GOOGLE_APPLICATION_CREDENTIALS` points to a service account key, it authenticates with real Firestore. No init code change needed.

**Important:** Add `service-account*.json` to `.gitignore` if not already there.

**5. Remove Phase 4 (conversations) and related code**

- Delete `parseMessages()` function and `PgMessage` interface
- Delete `phase4MigrateConversations()` function
- Remove `pgMessages` parsing from main
- Remove conversation validation checks from `phase6Validate`
- Update validation signature to drop `expectedThreads` / `expectedMessages` params

**6. Update validation to skip conversation checks**

Remove these checks from `phase6Validate`:
- "Conversations collection has N documents"
- "Total messages: N"

**7. Update file header comments**

Replace the usage block with the new CLI options.

### Execution order

For each prefix in `prefixes`:
1. Phase 1: Build `{prefix}ingredients`
2. Phase 2: Extract `last_planned` dates (pure computation, no Firestore)
3. Phase 3: Migrate `{prefix}meals` + `{prefix}recipes`
4. Validate

### Running it

```bash
# Prerequisite: download service account key from Firebase Console
# (Project Settings → Service Accounts → Generate New Private Key)
# Save as service-account.json in the repo root (gitignored)

# Seed dev collections
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase

# Seed prod collections
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase --prod

# Seed both
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --firebase --all
```

## Success Criteria

**Automated** (validation phase in script):
- `[dev_]ingredients` has ~232 docs
- `[dev_]meals` has 82 docs, each with `recipe_id`
- `[dev_]recipes` has 82 docs, each with `ingredients` array
- All `ingredient_id` refs in recipes resolve
- 77+ meals have `last_planned` set
- Spot-check: Beef Tacos (meal_5), Pizza Rolls recipe (recipe_51)

**Manual**:
- Open Firebase console → Firestore → verify `dev_ingredients`, `dev_meals`, `dev_recipes` exist with data
- Verify `ingredients`, `meals`, `recipes` (prod) exist with data
- Hit the dev and prod meal plan API endpoints and confirm they return data
