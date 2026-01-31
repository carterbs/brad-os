/**
 * Meal Planner Migration Script
 *
 * Migrates PostgreSQL meal planner data to Firestore (dev collections).
 * Run against the Firebase Emulator first, then production.
 *
 * Usage:
 *   # Start emulator first:
 *   npx firebase emulators:start
 *
 *   # Run migration (dev collections):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx packages/functions/src/scripts/migrate-mealplanner.ts
 *
 *   # Run migration (prod collections):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx packages/functions/src/scripts/migrate-mealplanner.ts --prod
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PgMeal {
  id: number;
  name: string;
  effort: number;
  lastPlanned: string | null;
  redMeat: boolean;
  url: string | null;
  mealType: 'breakfast' | 'lunch' | 'dinner';
}

interface PgIngredient {
  id: number;
  mealId: number;
  name: string;
}

interface PgRecipeStep {
  mealId: number;
  stepNumber: number;
  instruction: string;
}

interface PgMessage {
  id: number;
  threadId: string;
  sender: string;
  content: string;
  createdAt: string;
}

interface CheckpointIngredient {
  id: number;
  name: string;
}

interface CheckpointMeal {
  mealId: number;
  ingredients: CheckpointIngredient[];
  lastPlanned: string | null;
}

interface MappingEntry {
  canonical: string;
  decision: string;
}

interface DeletedIdInfo {
  action: 'include' | 'exclude';
  canonical: string;
}

// ─── SQL Parsing ─────────────────────────────────────────────────────────────

function extractCopyBlock(sql: string, tableName: string): string[] {
  // Find the COPY line for this table
  const copyRegex = new RegExp(`^COPY public\\.${tableName} \\([^)]+\\) FROM stdin;$`, 'm');
  const match = copyRegex.exec(sql);
  if (!match) throw new Error(`COPY block not found for ${tableName}`);

  const dataStart = sql.indexOf('\n', match.index) + 1;
  const dataEnd = sql.indexOf('\n\\.', dataStart);
  if (dataEnd === -1) throw new Error(`End of COPY block not found for ${tableName}`);

  const block = sql.substring(dataStart, dataEnd);
  return block.split('\n').filter((line) => line.length > 0);
}

function parseNull(val: string): string | null {
  return val === '\\N' ? null : val;
}

function parseMeals(sql: string): PgMeal[] {
  const lines = extractCopyBlock(sql, 'meals');
  return lines.map((line) => {
    const [id, name, effort, lastPlanned, redMeat, url, mealType] = line.split('\t');
    return {
      id: parseInt(id, 10),
      name,
      effort: parseInt(effort, 10),
      lastPlanned: parseNull(lastPlanned),
      redMeat: redMeat === 't',
      url: parseNull(url) || null,
      mealType: mealType as 'breakfast' | 'lunch' | 'dinner',
    };
  });
}

function parseIngredients(sql: string): PgIngredient[] {
  const lines = extractCopyBlock(sql, 'ingredients');
  return lines
    .map((line) => {
      const parts = line.split('\t');
      // Columns: id, meal_id, quantity, unit, name
      return {
        id: parseInt(parts[0], 10),
        mealId: parseInt(parts[1], 10),
        name: parts[4] || '',
      };
    })
    .filter((ing) => ing.name.length > 0);
}

function parseRecipeSteps(sql: string): PgRecipeStep[] {
  const lines = extractCopyBlock(sql, 'recipe_steps');
  return lines.map((line) => {
    const [, mealId, stepNumber, instruction] = line.split('\t');
    return {
      mealId: parseInt(mealId, 10),
      stepNumber: parseInt(stepNumber, 10),
      instruction,
    };
  });
}

function parseMessages(sql: string): PgMessage[] {
  const lines = extractCopyBlock(sql, 'messages');
  return lines.map((line) => {
    const [id, threadId, sender, content, createdAt] = line.split('\t');
    return {
      id: parseInt(id, 10),
      threadId,
      sender,
      content,
      createdAt,
    };
  });
}

/**
 * Parse workflow_checkpoints to extract per-meal ingredient lists and last_planned dates.
 * Returns a map: mealId → { ingredients, lastPlanned } from the LATEST checkpoint per meal.
 */
function parseCheckpointMeals(sql: string): Map<number, CheckpointMeal> {
  const lines = extractCopyBlock(sql, 'workflow_checkpoints');
  // Track the latest checkpoint data per meal (by updated_at timestamp)
  const mealMap = new Map<number, CheckpointMeal>();
  const mealTimestamps = new Map<number, string>();

  for (const line of lines) {
    // Columns: thread_id, workflow_type, checkpoint_ns, checkpoint_data, metadata, created_at, updated_at
    const cols = line.split('\t');
    const checkpointDataStr = cols[3];
    const updatedAt = cols[6];
    if (!checkpointDataStr) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(checkpointDataStr);
    } catch {
      continue; // Skip unparseable checkpoints
    }

    const state = parsed['state'] as Record<string, unknown> | undefined;
    if (!state) continue;

    const mealPlan = state['meal_plan'] as Record<string, unknown> | undefined;
    if (!mealPlan) continue;

    const days = mealPlan['days'] as Array<Record<string, unknown>> | undefined;
    if (!days) continue;

    for (const day of days) {
      const meal = day['meal'] as Record<string, unknown> | undefined;
      if (!meal || !meal['id']) continue;

      const mealId = meal['id'] as number;
      const existingTs = mealTimestamps.get(mealId);

      // Only keep the latest checkpoint data per meal
      if (existingTs && existingTs > updatedAt) continue;

      const ingredients = (meal['ingredients'] as Array<Record<string, unknown>> || []).map((ing) => ({
        id: ing['id'] as number,
        name: ing['name'] as string,
      }));

      let lastPlanned = (meal['last_planned'] as string) || null;
      // Treat epoch sentinel as null
      if (lastPlanned && lastPlanned.startsWith('1970-')) lastPlanned = null;

      mealMap.set(mealId, { mealId, ingredients, lastPlanned });
      mealTimestamps.set(mealId, updatedAt);
    }
  }

  return mealMap;
}

// ─── Ingredient Mapping ──────────────────────────────────────────────────────

function buildCanonicalSet(mappingJson: Record<string, unknown>): Set<string> {
  const canonicals = new Set<string>();

  // From mapping section
  const mapping = mappingJson['mapping'] as Record<string, MappingEntry>;
  for (const entry of Object.values(mapping)) {
    if (entry.decision !== 'drop') {
      canonicals.add(entry.canonical);
    }
  }

  // From deleted_from_table: pantry_staples_include
  const deleted = mappingJson['deleted_from_table'] as Record<string, unknown>;
  const pantryInclude = deleted['pantry_staples_include'] as Record<string, unknown>;
  const pantryItems = pantryInclude['items'] as Array<Record<string, unknown>>;
  for (const item of pantryItems) {
    canonicals.add(item['canonical'] as string);
  }

  // From deleted_from_table: real_ingredients_recover
  const realRecover = deleted['real_ingredients_recover'] as Record<string, unknown>;
  const realItems = realRecover['items'] as Array<Record<string, unknown>>;
  for (const item of realItems) {
    canonicals.add(item['canonical'] as string);
  }

  return canonicals;
}

function buildDeletedIdMap(mappingJson: Record<string, unknown>): Map<number, DeletedIdInfo> {
  const map = new Map<number, DeletedIdInfo>();
  const deleted = mappingJson['deleted_from_table'] as Record<string, unknown>;

  // pantry_staples_exclude → skip
  const excludeSection = deleted['pantry_staples_exclude'] as Record<string, unknown>;
  const excludeItems = excludeSection['items'] as Array<Record<string, unknown>>;
  for (const item of excludeItems) {
    for (const id of item['ids'] as number[]) {
      map.set(id, { action: 'exclude', canonical: item['name'] as string });
    }
  }

  // pantry_staples_include → include
  const includeSection = deleted['pantry_staples_include'] as Record<string, unknown>;
  const includeItems = includeSection['items'] as Array<Record<string, unknown>>;
  for (const item of includeItems) {
    for (const id of item['ids'] as number[]) {
      map.set(id, { action: 'include', canonical: item['canonical'] as string });
    }
  }

  // garbage_exclude → skip
  const garbageSection = deleted['garbage_exclude'] as Record<string, unknown>;
  const garbageItems = garbageSection['items'] as Array<Record<string, unknown>>;
  for (const item of garbageItems) {
    map.set(item['id'] as number, { action: 'exclude', canonical: item['raw'] as string });
  }

  // real_ingredients_recover → include
  const recoverSection = deleted['real_ingredients_recover'] as Record<string, unknown>;
  const recoverItems = recoverSection['items'] as Array<Record<string, unknown>>;
  for (const item of recoverItems) {
    map.set(item['id'] as number, { action: 'include', canonical: item['canonical'] as string });
  }

  return map;
}

function buildRawNameToCanonical(mappingJson: Record<string, unknown>): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const mapping = mappingJson['mapping'] as Record<string, MappingEntry>;
  for (const [rawName, entry] of Object.entries(mapping)) {
    if (entry.decision === 'drop') {
      map.set(rawName.toLowerCase(), null); // null = drop
    } else {
      map.set(rawName.toLowerCase(), entry.canonical);
    }
  }
  return map;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

// ─── Batch Helper ────────────────────────────────────────────────────────────

class BatchWriter {
  private batch: WriteBatch;
  private count = 0;
  private totalWrites = 0;
  private readonly MAX_BATCH = 450; // Stay under Firestore's 500 limit

  constructor(private db: Firestore) {
    this.batch = db.batch();
  }

  set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): void {
    this.batch.set(ref, data);
    this.count++;
    this.totalWrites++;
  }

  async flushIfNeeded(): Promise<void> {
    if (this.count >= this.MAX_BATCH) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
    }
  }

  async flush(): Promise<void> {
    if (this.count > 0) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
    }
  }

  get total(): number {
    return this.totalWrites;
  }
}

// ─── Phase 1: Build Ingredients ──────────────────────────────────────────────

async function phase1BuildIngredients(
  db: Firestore,
  prefix: string,
  mappingJson: Record<string, unknown>,
): Promise<{ canonicalToId: Map<string, string>; count: number }> {
  const canonicals = buildCanonicalSet(mappingJson);
  const canonicalToId = new Map<string, string>();
  const usedSlugs = new Set<string>();

  const writer = new BatchWriter(db);
  const collRef = db.collection(`${prefix}ingredients`);
  const now = new Date().toISOString();

  for (const name of [...canonicals].sort()) {
    let slug = slugify(name);
    // Handle slug collisions
    if (usedSlugs.has(slug)) {
      let counter = 2;
      while (usedSlugs.has(`${slug}-${counter}`)) counter++;
      slug = `${slug}-${counter}`;
    }
    usedSlugs.add(slug);
    canonicalToId.set(name, slug);

    writer.set(collRef.doc(slug), {
      name,
      createdAt: now,
      updatedAt: now,
    });
    await writer.flushIfNeeded();
  }

  await writer.flush();
  return { canonicalToId, count: canonicals.size };
}

// ─── Phase 2: Extract last_planned dates ─────────────────────────────────────

function phase2ExtractLastPlanned(
  pgMeals: PgMeal[],
  checkpointMeals: Map<number, CheckpointMeal>,
): Map<number, string> {
  const result = new Map<number, string>();

  // Start with PG meals table dates
  for (const meal of pgMeals) {
    if (meal.lastPlanned) {
      result.set(meal.id, meal.lastPlanned);
    }
  }

  // Merge checkpoint dates (take the later one)
  for (const [mealId, cpMeal] of checkpointMeals) {
    if (!cpMeal.lastPlanned) continue;
    const existing = result.get(mealId);
    if (!existing || cpMeal.lastPlanned > existing) {
      result.set(mealId, cpMeal.lastPlanned);
    }
  }

  return result;
}

// ─── Phase 3: Migrate Meals + Recipes ────────────────────────────────────────

async function phase3MigrateMealsAndRecipes(
  db: Firestore,
  prefix: string,
  pgMeals: PgMeal[],
  pgIngredients: PgIngredient[],
  pgRecipeSteps: PgRecipeStep[],
  checkpointMeals: Map<number, CheckpointMeal>,
  mappingJson: Record<string, unknown>,
  canonicalToId: Map<string, string>,
  lastPlannedMap: Map<number, string>,
): Promise<void> {
  const rawNameToCanonical = buildRawNameToCanonical(mappingJson);
  const deletedIdMap = buildDeletedIdMap(mappingJson);

  // Group PG ingredients by meal_id
  const pgIngByMeal = new Map<number, PgIngredient[]>();
  for (const ing of pgIngredients) {
    const list = pgIngByMeal.get(ing.mealId) || [];
    list.push(ing);
    pgIngByMeal.set(ing.mealId, list);
  }

  // Group recipe steps by meal_id
  const stepsByMeal = new Map<number, PgRecipeStep[]>();
  for (const step of pgRecipeSteps) {
    const list = stepsByMeal.get(step.mealId) || [];
    list.push(step);
    stepsByMeal.set(step.mealId, list);
  }

  const mealsRef = db.collection(`${prefix}meals`);
  const recipesRef = db.collection(`${prefix}recipes`);
  const writer = new BatchWriter(db);
  const now = new Date().toISOString();
  let unmappedWarnings: string[] = [];

  for (const meal of pgMeals) {
    const mealDocId = `meal_${meal.id}`;
    const recipeDocId = `recipe_${meal.id}`;

    // Resolve last_planned
    const lastPlanned = lastPlannedMap.get(meal.id) || null;

    // Write meal document
    writer.set(mealsRef.doc(mealDocId), {
      name: meal.name,
      mealType: meal.mealType,
      effort: meal.effort,
      redMeat: meal.redMeat,
      url: meal.url,
      lastPlannedAt: lastPlanned,
      recipeId: recipeDocId,
      createdAt: now,
      updatedAt: now,
    });
    await writer.flushIfNeeded();

    // Build ingredient list for recipe
    const pgIngs = pgIngByMeal.get(meal.id) || [];
    const pgIngIds = new Set(pgIngs.map((i) => i.id));
    const cpMeal = checkpointMeals.get(meal.id);

    // Collect all raw ingredient names for this meal
    const resolvedIngredients: Array<{ ingredientId: string }> = [];
    const seenCanonicals = new Set<string>();

    // Helper to resolve a raw name to a canonical ingredient ID (no warnings)
    const resolveByName = (rawName: string | undefined): string | null => {
      if (!rawName) return null;
      const canonical = rawNameToCanonical.get(rawName.toLowerCase());
      if (canonical === undefined || canonical === null) return null;
      return canonicalToId.get(canonical) || null;
    };

    // Process PG table ingredients
    for (const ing of pgIngs) {
      let ingredientId = resolveByName(ing.name);
      // If unmapped by name, check deleted_from_table by PG id
      if (!ingredientId) {
        const deletedInfo = deletedIdMap.get(ing.id);
        if (deletedInfo) {
          if (deletedInfo.action === 'exclude') continue; // pantry staple or garbage
          ingredientId = canonicalToId.get(deletedInfo.canonical) || null;
        }
      }
      if (!ingredientId && ing.name) {
        unmappedWarnings.push(`  [meal ${meal.id}] unmapped ingredient: "${ing.name}" (id ${ing.id})`);
        continue;
      }
      if (ingredientId && !seenCanonicals.has(ingredientId)) {
        seenCanonicals.add(ingredientId);
        resolvedIngredients.push({ ingredientId });
      }
    }

    // Process checkpoint-only ingredients (those not in PG table)
    if (cpMeal) {
      for (const cpIng of cpMeal.ingredients) {
        if (pgIngIds.has(cpIng.id)) continue; // Already handled from PG table

        // Check deleted_from_table mapping
        const deletedInfo = deletedIdMap.get(cpIng.id);
        if (deletedInfo) {
          if (deletedInfo.action === 'exclude') continue;
          // action === 'include': use the canonical from deleted mapping
          const ingredientId = canonicalToId.get(deletedInfo.canonical);
          if (ingredientId && !seenCanonicals.has(ingredientId)) {
            seenCanonicals.add(ingredientId);
            resolvedIngredients.push({ ingredientId });
          }
        } else {
          // Not in deleted map — try regular name mapping
          const ingredientId = resolveByName(cpIng.name);
          if (ingredientId && !seenCanonicals.has(ingredientId)) {
            seenCanonicals.add(ingredientId);
            resolvedIngredients.push({ ingredientId });
          }
        }
      }
    }

    // Build recipe steps (only meal 51 has any)
    const steps = (stepsByMeal.get(meal.id) || [])
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((s) => ({ stepNumber: s.stepNumber, instruction: s.instruction }));

    // Write recipe document
    writer.set(recipesRef.doc(recipeDocId), {
      mealId: mealDocId,
      ingredients: resolvedIngredients,
      steps: steps.length > 0 ? steps : null,
      createdAt: now,
      updatedAt: now,
    });
    await writer.flushIfNeeded();
  }

  await writer.flush();

  if (unmappedWarnings.length > 0) {
    console.log(`  Warnings (${unmappedWarnings.length} unmapped ingredients):`);
    for (const w of unmappedWarnings.slice(0, 20)) console.log(w);
    if (unmappedWarnings.length > 20) console.log(`  ... and ${unmappedWarnings.length - 20} more`);
  }
}

// ─── Phase 4: Migrate Conversations ──────────────────────────────────────────

async function phase4MigrateConversations(
  db: Firestore,
  prefix: string,
  pgMessages: PgMessage[],
): Promise<{ threadCount: number; messageCount: number }> {
  // Group messages by thread
  const threads = new Map<string, PgMessage[]>();
  for (const msg of pgMessages) {
    const list = threads.get(msg.threadId) || [];
    list.push(msg);
    threads.set(msg.threadId, list);
  }

  const convRef = db.collection(`${prefix}conversations`);
  const writer = new BatchWriter(db);
  let totalMessages = 0;

  for (const [threadId, messages] of threads) {
    messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];

    // Write conversation document
    writer.set(convRef.doc(threadId), {
      status: 'completed', // All historical conversations are completed
      currentStep: null,
      planId: null,
      createdAt: firstMsg.createdAt,
      updatedAt: lastMsg.createdAt,
    });
    await writer.flushIfNeeded();

    // Write messages subcollection
    const msgsRef = convRef.doc(threadId).collection('messages');
    for (const msg of messages) {
      writer.set(msgsRef.doc(`msg_${msg.id}`), {
        sender: msg.sender,
        content: msg.content,
        createdAt: msg.createdAt,
      });
      await writer.flushIfNeeded();
      totalMessages++;
    }
  }

  await writer.flush();
  return { threadCount: threads.size, messageCount: totalMessages };
}

// ─── Phase 6: Validate ──────────────────────────────────────────────────────

async function phase6Validate(
  db: Firestore,
  prefix: string,
  expectedMeals: number,
  expectedIngredients: number,
  expectedMealsWithLastPlanned: number,
  expectedThreads: number,
  expectedMessages: number,
): Promise<boolean> {
  let allPassed = true;

  const check = async (label: string, test: () => Promise<boolean>): Promise<void> => {
    const passed = await test();
    const icon = passed ? '✓' : '✗';
    console.log(`  ${icon} ${label}`);
    if (!passed) allPassed = false;
  };

  // Count ingredients
  await check(`Ingredients collection has documents`, async () => {
    const snap = await db.collection(`${prefix}ingredients`).get();
    const actual = snap.size;
    console.log(`    Expected: ${expectedIngredients}, Actual: ${actual}`);
    return actual === expectedIngredients;
  });

  // Count meals
  await check(`Meals collection has ${expectedMeals} documents`, async () => {
    const snap = await db.collection(`${prefix}meals`).get();
    return snap.size === expectedMeals;
  });

  // Every meal has a recipeId
  await check('Every meal has a recipeId', async () => {
    const snap = await db.collection(`${prefix}meals`).get();
    return snap.docs.every((doc) => doc.data()['recipeId']);
  });

  // Count recipes
  await check(`Recipes collection has ${expectedMeals} documents`, async () => {
    const snap = await db.collection(`${prefix}recipes`).get();
    return snap.size === expectedMeals;
  });

  // Every recipe has an ingredients array
  await check('Every recipe has an ingredients array', async () => {
    const snap = await db.collection(`${prefix}recipes`).get();
    return snap.docs.every((doc) => Array.isArray(doc.data()['ingredients']));
  });

  // Recipe ingredientIds resolve to actual ingredients
  await check('All recipe ingredientId refs resolve', async () => {
    const ingredientSnap = await db.collection(`${prefix}ingredients`).get();
    const ingredientIds = new Set(ingredientSnap.docs.map((d) => d.id));
    const recipeSnap = await db.collection(`${prefix}recipes`).get();
    let orphanCount = 0;
    for (const doc of recipeSnap.docs) {
      const ingredients = doc.data()['ingredients'] as Array<{ ingredientId: string }>;
      for (const ing of ingredients) {
        if (!ingredientIds.has(ing.ingredientId)) {
          orphanCount++;
          if (orphanCount <= 3) console.log(`    Orphan: recipe ${doc.id} → ingredient ${ing.ingredientId}`);
        }
      }
    }
    if (orphanCount > 3) console.log(`    ... and ${orphanCount - 3} more orphans`);
    return orphanCount === 0;
  });

  // Meals with lastPlannedAt
  await check(`${expectedMealsWithLastPlanned}+ meals have lastPlannedAt`, async () => {
    const snap = await db.collection(`${prefix}meals`).get();
    const withDate = snap.docs.filter((d) => d.data()['lastPlannedAt'] !== null).length;
    console.log(`    Meals with lastPlannedAt: ${withDate}`);
    return withDate >= expectedMealsWithLastPlanned;
  });

  // Conversations count
  await check(`Conversations collection has ${expectedThreads} documents`, async () => {
    const snap = await db.collection(`${prefix}conversations`).get();
    return snap.size === expectedThreads;
  });

  // Total messages across all conversations
  await check(`Total messages: ${expectedMessages}`, async () => {
    const convSnap = await db.collection(`${prefix}conversations`).get();
    let total = 0;
    for (const doc of convSnap.docs) {
      const msgSnap = await doc.ref.collection('messages').get();
      total += msgSnap.size;
    }
    console.log(`    Actual messages: ${total}`);
    return total === expectedMessages;
  });

  // Spot-check a few meals
  await check('Spot-check: Beef Tacos (meal 5)', async () => {
    const doc = await db.collection(`${prefix}meals`).doc('meal_5').get();
    if (!doc.exists) return false;
    const data = doc.data()!;
    return data['name'] === 'Beef Tacos, tortilla chips' && data['mealType'] === 'dinner' && data['redMeat'] === true;
  });

  await check('Spot-check: Pizza Rolls recipe has steps (meal 51)', async () => {
    const doc = await db.collection(`${prefix}recipes`).doc('recipe_51').get();
    if (!doc.exists) return false;
    const data = doc.data()!;
    const steps = data['steps'] as Array<unknown> | null;
    return steps !== null && steps.length === 7;
  });

  console.log(allPassed ? '\n  All validations passed.' : '\n  Some validations FAILED.');
  return allPassed;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isProd = process.argv.includes('--prod');
  const prefix = isProd ? '' : 'dev_';

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('ERROR: FIRESTORE_EMULATOR_HOST is not set.');
    console.error('Start the emulator first: npx firebase emulators:start');
    console.error('Then run: FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx <this-script>');
    process.exit(1);
  }

  console.log(`Target: ${isProd ? 'PRODUCTION' : 'dev'} collections (prefix: "${prefix}")`);
  console.log(`Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);

  // Initialize Firebase
  const app = initializeApp({ projectId: 'brad-os-app' });
  const db = getFirestore(app);

  // Resolve paths — data files live in the main repo (not worktrees)
  const mainRepo = '/Users/bradcarter/Documents/Dev/brad-os';
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, '../../../..');
  const sqlPath = resolve(mainRepo, 'mealplanner.sql');
  const mappingPath = resolve(mainRepo, 'mealplanner-ingredient-mapping.json');

  console.log(`\nReading ${sqlPath}`);
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log(`Reading ${mappingPath}`);
  const mappingJson = JSON.parse(readFileSync(mappingPath, 'utf-8')) as Record<string, unknown>;

  // Parse SQL dump
  console.log('\n── Parsing SQL dump ──');
  const pgMeals = parseMeals(sql);
  const pgIngredients = parseIngredients(sql);
  const pgRecipeSteps = parseRecipeSteps(sql);
  const pgMessages = parseMessages(sql);
  const checkpointMeals = parseCheckpointMeals(sql);

  console.log(`  Meals: ${pgMeals.length}`);
  console.log(`  Ingredients (PG rows): ${pgIngredients.length}`);
  console.log(`  Recipe steps: ${pgRecipeSteps.length}`);
  console.log(`  Messages: ${pgMessages.length}`);
  console.log(`  Meals found in checkpoints: ${checkpointMeals.size}`);

  // Phase 1
  console.log('\n── Phase 1: Build ingredients collection ──');
  const { canonicalToId, count: ingredientCount } = await phase1BuildIngredients(db, prefix, mappingJson);
  console.log(`  Canonical ingredients written: ${ingredientCount}`);

  // Phase 2
  console.log('\n── Phase 2: Extract last_planned dates ──');
  const lastPlannedMap = phase2ExtractLastPlanned(pgMeals, checkpointMeals);
  console.log(`  Meals with last_planned: ${lastPlannedMap.size}`);

  // Phase 3
  console.log('\n── Phase 3: Migrate meals + recipes ──');
  await phase3MigrateMealsAndRecipes(
    db, prefix, pgMeals, pgIngredients, pgRecipeSteps,
    checkpointMeals, mappingJson, canonicalToId, lastPlannedMap,
  );
  console.log(`  Meals written: ${pgMeals.length}`);
  console.log(`  Recipes written: ${pgMeals.length}`);

  // Phase 4
  console.log('\n── Phase 4: Migrate conversations ──');
  const { threadCount, messageCount } = await phase4MigrateConversations(db, prefix, pgMessages);
  console.log(`  Conversations: ${threadCount}`);
  console.log(`  Messages: ${messageCount}`);

  // Phase 6: Validate
  console.log('\n── Phase 6: Validate ──');
  const passed = await phase6Validate(
    db, prefix,
    pgMeals.length,
    ingredientCount,
    lastPlannedMap.size,
    threadCount,
    messageCount,
  );

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
