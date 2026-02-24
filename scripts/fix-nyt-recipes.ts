#!/usr/bin/env npx tsx
/**
 * Fix NYT Recipe Ingredients in Prod and Dev Firestore
 *
 * Corrects ingredient data for 12 NYT-sourced meals across both
 * prod ("") and dev ("dev_") collection prefixes.
 *
 * Usage:
 *   # Dry run (preview changes):
 *   npx tsx scripts/fix-nyt-recipes.ts --dry-run
 *
 *   # Apply changes:
 *   npx tsx scripts/fix-nyt-recipes.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

// ─── Init ────────────────────────────────────────────────────────────────────

const serviceAccountPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  '/Users/bradcarter/Downloads/firebase-service-account.json';

initializeApp({
  credential: cert(serviceAccountPath),
  projectId: 'brad-os',
});

const db = getFirestore();
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

class BatchWriter {
  private batch: WriteBatch;
  private count = 0;
  private totalWrites = 0;
  private readonly MAX_BATCH = 450;

  constructor(private db: Firestore) {
    this.batch = db.batch();
  }

  set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): void {
    this.batch.set(ref, data);
    this.count++;
    this.totalWrites++;
  }

  update(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): void {
    this.batch.update(ref, data);
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface IngredientFix {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Store section for new ingredients */
  store_section?: string;
}

interface RecipeFix {
  meal_id: string;
  meal_name: string;
  /** 'replace' = overwrite entire ingredients array; 'merge' = update quantities on existing + add new */
  mode: 'replace' | 'merge';
  ingredients: IngredientFix[];
  /** Ingredients to remove (by name slug) — only used in 'replace' mode implicitly */
}

// ─── Recipe Fix Data ─────────────────────────────────────────────────────────

const RECIPE_FIXES: RecipeFix[] = [
  // ── Tier 1: Major Fixes ──────────────────────────────────────────────────

  // Butter Chicken — fix garam masala qty, add cumin seeds
  // Note: "red chiles" is too recipe-specific; skipping that optional garnish
  {
    meal_id: 'r1GXgfzygTGx6R7GIjS6',
    meal_name: 'Slow-Cooker Butter Chicken',
    mode: 'replace',
    ingredients: [
      { name: 'greek yogurt', quantity: 1.5, unit: 'cups' },
      { name: 'lemon juice', quantity: 2, unit: 'tbsp' },
      { name: 'turmeric', quantity: 1.5, unit: 'tbsp', store_section: 'Pantry Staples' },
      { name: 'ground cumin', quantity: 2, unit: 'tbsp' },
      { name: 'garam masala', quantity: 2, unit: 'tbsp' },
      { name: 'chicken thighs', quantity: 3, unit: 'lbs' },
      { name: 'butter', quantity: 0.25, unit: 'lbs' },
      { name: 'vegetable oil', quantity: 4, unit: 'tsp', store_section: 'Pantry Staples' },
      { name: 'yellow onion', quantity: 2, unit: 'medium' },
      { name: 'garlic', quantity: 4, unit: 'cloves' },
      { name: 'fresh ginger', quantity: 3, unit: 'tbsp', store_section: 'Produce' },
      { name: 'cinnamon stick', quantity: 1, unit: null, store_section: 'Pantry Staples' },
      { name: 'cumin seeds', quantity: 1, unit: 'tbsp', store_section: 'Pantry Staples' },
      { name: 'tomatoes', quantity: 2, unit: 'medium' },
      { name: 'sea salt', quantity: null, unit: 'to taste' },
      { name: 'chicken broth', quantity: 0.67, unit: 'cups' },
      { name: 'heavy cream', quantity: 1.5, unit: 'cups' },
      { name: 'tomato paste', quantity: 1.5, unit: 'tsp' },
      { name: 'almonds', quantity: 3, unit: 'tbsp', store_section: 'Pantry Staples' },
      { name: 'cilantro', quantity: 0.5, unit: 'bunch' },
    ],
  },

  // 5-Minute Hummus — fix quantities, add ice water
  {
    meal_id: '4NeYxsFp1lo9vA411Loj',
    meal_name: '5-Minute Hummus',
    mode: 'replace',
    ingredients: [
      { name: 'garlic', quantity: 0.25, unit: 'clove' },
      { name: 'lemon juice', quantity: 0.25, unit: 'cups' },
      { name: 'tahini', quantity: 2, unit: 'cups', store_section: 'Condiments & Spreads' },
      { name: 'sea salt', quantity: 1, unit: 'tbsp' },
      { name: 'ground cumin', quantity: 1, unit: 'tsp' },
      { name: 'chickpeas', quantity: 2, unit: 'cans', store_section: 'Canned & Jarred' },
      { name: 'ice water', quantity: 1.25, unit: 'cups', store_section: 'Pantry Staples' },
    ],
  },

  // Easy Burritos — replace entirely with correct recipe
  {
    meal_id: 'dNK9TFA3tBZvQnMfSyTe',
    meal_name: 'Easy Burritos',
    mode: 'replace',
    ingredients: [
      { name: 'lean ground beef', quantity: 1, unit: 'pound' },
      { name: 'yellow onion', quantity: 1, unit: 'medium' },
      { name: 'ground cumin', quantity: 1.5, unit: 'tsp' },
      { name: 'paprika', quantity: 0.5, unit: 'tsp' },
      { name: 'dried oregano', quantity: 0.5, unit: 'tsp' },
      { name: 'black beans', quantity: 1, unit: 'can' },
      { name: 'tomatoes', quantity: 1, unit: 'large' },
      { name: 'lime juice', quantity: 2, unit: 'tsp' },
      { name: 'hot sauce', quantity: null, unit: 'to taste' },
      { name: 'tortillas', quantity: 6, unit: 'large' },
      { name: 'shredded mexican cheese', quantity: 2, unit: 'cups' },
    ],
  },

  // Roasted Cod — add missing ingredients, add quantities to existing
  // Keep red potatoes and salad greens as meal sides
  {
    meal_id: 'meal_84',
    meal_name: 'Roasted Cod with Cherry Tomatoes',
    mode: 'replace',
    ingredients: [
      { name: 'cherry tomatoes', quantity: 1, unit: 'pint' },
      { name: 'shallots', quantity: 0.5, unit: 'cups' },
      { name: 'garlic', quantity: 2, unit: 'cloves' },
      { name: 'olive oil', quantity: 2, unit: 'tbsp', store_section: 'Pantry Staples' },
      { name: 'red wine vinegar', quantity: 1, unit: 'tbsp' },
      { name: 'honey', quantity: 1, unit: 'tsp' },
      { name: 'sea salt', quantity: null, unit: 'to taste' },
      { name: 'black pepper', quantity: null, unit: 'to taste' },
      { name: 'white fish fillets', quantity: 4, unit: 'fillets' },
      { name: 'lemons', quantity: 0.5, unit: 'whole' },
      { name: 'fresh basil', quantity: null, unit: 'for serving' },
      { name: 'fresh mint', quantity: null, unit: 'for serving' },
      // Meal sides (not in NYT recipe but part of the meal plan)
      { name: 'red potatoes', quantity: null, unit: null },
      { name: 'salad greens', quantity: null, unit: null },
    ],
  },

  // Pasta Salad — add quantities to all, add missing ingredients
  {
    meal_id: 'meal_86',
    meal_name: 'Pasta Salad',
    mode: 'replace',
    ingredients: [
      { name: 'red wine vinegar', quantity: 3, unit: 'tbsp' },
      { name: 'garlic', quantity: 1, unit: 'clove' },
      { name: 'dried oregano', quantity: 1, unit: 'tsp' },
      { name: 'sea salt', quantity: null, unit: 'to taste' },
      { name: 'black pepper', quantity: null, unit: 'to taste' },
      { name: 'olive oil', quantity: 0.33, unit: 'cups', store_section: 'Pantry Staples' },
      { name: 'short pasta', quantity: 1, unit: 'pound' },
      { name: 'cherry tomatoes', quantity: 1, unit: 'pint' },
      { name: 'mozzarella cheese', quantity: 8, unit: 'oz' },
      { name: 'salami', quantity: 4, unit: 'oz' },
      { name: 'kalamata olives', quantity: 0.75, unit: 'cups', store_section: 'Canned & Jarred' },
      { name: 'cucumber', quantity: 0.5, unit: 'cups' },
      { name: 'red onion', quantity: 3, unit: 'tbsp' },
      { name: 'fresh herbs', quantity: 1, unit: 'cups' },
    ],
  },

  // Spaghetti Carbonara — add egg yolks
  {
    meal_id: 'qpk7VFwSavDizSyrRmJC',
    meal_name: 'Spaghetti Carbonara',
    mode: 'merge',
    ingredients: [
      { name: 'egg yolks', quantity: 2, unit: 'large', store_section: 'Dairy & Eggs' },
    ],
  },

  // ── Tier 2: Add Quantities ───────────────────────────────────────────────

  // Chicken Provençal — add quantities to all 8 existing (skip adding pantry staples)
  {
    meal_id: 'meal_83',
    meal_name: 'Chicken Provençal',
    mode: 'merge',
    ingredients: [
      { name: 'bone-in chicken', quantity: 8, unit: 'pieces' },
      { name: 'flour', quantity: 0.67, unit: 'cups' },
      { name: 'herbes de Provence', quantity: 2, unit: 'tbsp' },
      { name: 'lemons', quantity: 1, unit: 'whole' },
      { name: 'garlic', quantity: 10, unit: 'cloves' },
      { name: 'shallots', quantity: 5, unit: 'medium' },
      { name: 'dry vermouth', quantity: 0.33, unit: 'cups' },
      { name: 'fresh thyme', quantity: 4, unit: 'sprigs' },
    ],
  },

  // Fried Mozzarella — add quantities to all 5 existing (skip adding pantry staples)
  {
    meal_id: 'meal_91',
    meal_name: 'Fried Mozzarella Sandwiches',
    mode: 'merge',
    ingredients: [
      { name: 'eggs', quantity: 3, unit: null },
      { name: 'garlic', quantity: 1, unit: 'clove' },
      { name: 'panko bread crumbs', quantity: 1, unit: 'cups' },
      { name: 'bread', quantity: 8, unit: 'slices' },
      { name: 'mozzarella cheese', quantity: 1, unit: 'pound' },
    ],
  },

  // Cinnamon Toast — add quantities to all 4 existing (skip adding pantry staples)
  {
    meal_id: 'meal_89',
    meal_name: 'Cinnamon Toast',
    mode: 'merge',
    ingredients: [
      { name: 'brown sugar', quantity: 3, unit: 'tbsp' },
      { name: 'cinnamon', quantity: 2, unit: 'tsp' },
      { name: 'butter', quantity: null, unit: 'to taste' },
      { name: 'bread', quantity: 4, unit: 'slices' },
    ],
  },

  // Extra-Crispy BLT — add quantities to all 5 existing (skip adding pantry staples)
  {
    meal_id: 'meal_92',
    meal_name: 'Extra-Crispy BLT',
    mode: 'merge',
    ingredients: [
      { name: 'bacon', quantity: 1, unit: 'pound' },
      { name: 'tomatoes', quantity: 2, unit: 'large' },
      { name: 'lettuce', quantity: 1, unit: 'head' },
      { name: 'bread', quantity: 8, unit: 'slices' },
      { name: 'mayonnaise', quantity: null, unit: 'to taste' },
    ],
  },

  // Grilled Cheese w/ Apples — add quantities to all 7 existing (skip adding pantry staples)
  {
    meal_id: 'meal_93',
    meal_name: 'Grilled Cheese with Apples',
    mode: 'merge',
    ingredients: [
      { name: 'butter', quantity: 5, unit: 'tbsp' },
      { name: 'apples', quantity: 1, unit: 'large' },
      { name: 'shallots', quantity: 1, unit: 'small' },
      { name: 'fresh rosemary', quantity: 1, unit: 'tsp' },
      { name: 'apple butter', quantity: 0.5, unit: 'cups' },
      { name: 'country bread', quantity: 8, unit: 'slices' },
      { name: 'cheddar cheese', quantity: 4, unit: 'oz' },
    ],
  },

  // Turkey/Apple Sandwiches — add quantities to all 4 existing
  {
    meal_id: 'meal_85',
    meal_name: 'Turkey & Apple Sandwiches',
    mode: 'merge',
    ingredients: [
      { name: 'mayonnaise', quantity: 0.25, unit: 'cups' },
      { name: 'maple syrup', quantity: 1.5, unit: 'tsp' },
      { name: 'sliced turkey', quantity: 0.5, unit: 'pound' },
      { name: 'apples', quantity: 1, unit: 'whole' },
    ],
  },
];

// ─── Core Logic ──────────────────────────────────────────────────────────────

async function ensureIngredientExists(
  writer: BatchWriter,
  ingredientCollection: string,
  existingIngredients: Map<string, string>,
  fix: IngredientFix,
): Promise<string> {
  const slug = slugify(fix.name);

  if (existingIngredients.has(slug)) {
    return slug;
  }

  // Check if the ingredient doc exists in Firestore (might not be in our local cache)
  const docRef = db.collection(ingredientCollection).doc(slug);
  const doc = await docRef.get();

  if (doc.exists) {
    existingIngredients.set(slug, fix.name);
    return slug;
  }

  // Create new ingredient
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    name: fix.name,
    created_at: now,
    updated_at: now,
  };

  if (fix.store_section) {
    data.store_section = fix.store_section;
  }

  console.log(`  [CREATE] ingredient "${fix.name}" (${slug}) in ${ingredientCollection}${fix.store_section ? ` [${fix.store_section}]` : ''}`);

  if (!DRY_RUN) {
    writer.set(docRef, data);
    await writer.flushIfNeeded();
  }

  existingIngredients.set(slug, fix.name);
  return slug;
}

async function applyRecipeFix(
  writer: BatchWriter,
  prefix: string,
  fix: RecipeFix,
  existingIngredients: Map<string, string>,
): Promise<void> {
  const recipesCollection = `${prefix}recipes`;
  const ingredientCollection = `${prefix}ingredients`;

  console.log(`\n── ${fix.meal_name} (${fix.meal_id}) [${prefix || 'prod'}] ──`);

  // Find the recipe doc by meal_id
  const recipesSnap = await db
    .collection(recipesCollection)
    .where('meal_id', '==', fix.meal_id)
    .get();

  if (recipesSnap.empty) {
    console.log(`  [WARN] No recipe found for meal_id=${fix.meal_id} in ${recipesCollection}`);
    return;
  }

  const recipeDoc = recipesSnap.docs[0];
  const recipeData = recipeDoc.data();
  const existingRecipeIngredients: Array<{ ingredient_id: string; quantity: number | null; unit: string | null }> =
    recipeData.ingredients ?? [];

  if (fix.mode === 'replace') {
    // Build entirely new ingredients array
    const newIngredients: Array<{ ingredient_id: string; quantity: number | null; unit: string | null }> = [];

    for (const ing of fix.ingredients) {
      const slug = await ensureIngredientExists(writer, ingredientCollection, existingIngredients, ing);
      newIngredients.push({
        ingredient_id: slug,
        quantity: ing.quantity,
        unit: ing.unit,
      });
    }

    // Log the diff
    const oldNames = existingRecipeIngredients.map((i) => i.ingredient_id).sort();
    const newNames = newIngredients.map((i) => i.ingredient_id).sort();
    const added = newNames.filter((n) => !oldNames.includes(n));
    const removed = oldNames.filter((n) => !newNames.includes(n));

    if (added.length > 0) console.log(`  [ADD] ${added.join(', ')}`);
    if (removed.length > 0) console.log(`  [REMOVE] ${removed.join(', ')}`);

    // Log quantity changes for ingredients that exist in both
    for (const newIng of newIngredients) {
      const oldIng = existingRecipeIngredients.find((i) => i.ingredient_id === newIng.ingredient_id);
      if (oldIng) {
        const qtyChanged = oldIng.quantity !== newIng.quantity;
        const unitChanged = oldIng.unit !== newIng.unit;
        if (qtyChanged || unitChanged) {
          console.log(
            `  [UPDATE] ${newIng.ingredient_id}: ${oldIng.quantity ?? 'null'} ${oldIng.unit ?? 'null'} → ${newIng.quantity ?? 'null'} ${newIng.unit ?? 'null'}`,
          );
        }
      }
    }

    if (!DRY_RUN) {
      writer.update(recipeDoc.ref, {
        ingredients: newIngredients,
        updated_at: new Date().toISOString(),
      });
      await writer.flushIfNeeded();
    }
  } else {
    // merge mode: update quantities on existing ingredients, add new ones
    const updatedIngredients = [...existingRecipeIngredients];
    let changed = false;

    for (const ing of fix.ingredients) {
      const slug = await ensureIngredientExists(writer, ingredientCollection, existingIngredients, ing);
      const existingIdx = updatedIngredients.findIndex((i) => i.ingredient_id === slug);

      if (existingIdx >= 0) {
        const old = updatedIngredients[existingIdx];
        const qtyChanged = old.quantity !== ing.quantity;
        const unitChanged = old.unit !== ing.unit;

        if (qtyChanged || unitChanged) {
          console.log(
            `  [UPDATE] ${slug}: ${old.quantity ?? 'null'} ${old.unit ?? 'null'} → ${ing.quantity ?? 'null'} ${ing.unit ?? 'null'}`,
          );
          updatedIngredients[existingIdx] = {
            ingredient_id: slug,
            quantity: ing.quantity,
            unit: ing.unit,
          };
          changed = true;
        }
      } else {
        console.log(`  [ADD] ${slug}: ${ing.quantity ?? 'null'} ${ing.unit ?? 'null'}`);
        updatedIngredients.push({
          ingredient_id: slug,
          quantity: ing.quantity,
          unit: ing.unit,
        });
        changed = true;
      }
    }

    if (changed && !DRY_RUN) {
      writer.update(recipeDoc.ref, {
        ingredients: updatedIngredients,
        updated_at: new Date().toISOString(),
      });
      await writer.flushIfNeeded();
    }

    if (!changed) {
      console.log('  [SKIP] No changes needed');
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`NYT Recipe Ingredient Fix Script`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Fixes: ${RECIPE_FIXES.length} recipes\n`);

  const prefixes = ['', 'dev_'];

  for (const prefix of prefixes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing ${prefix || 'prod'} collections`);
    console.log('='.repeat(60));

    const writer = new BatchWriter(db);

    // Load existing ingredients into a map (slug → name)
    const ingredientCollection = `${prefix}ingredients`;
    const ingredientsSnap = await db.collection(ingredientCollection).get();
    const existingIngredients = new Map<string, string>();
    for (const doc of ingredientsSnap.docs) {
      existingIngredients.set(doc.id, doc.data().name ?? doc.id);
    }
    console.log(`Loaded ${existingIngredients.size} existing ingredients from ${ingredientCollection}`);

    // Apply each fix
    for (const fix of RECIPE_FIXES) {
      await applyRecipeFix(writer, prefix, fix, existingIngredients);
    }

    if (!DRY_RUN) {
      await writer.flush();
    }

    console.log(`\nTotal writes for ${prefix || 'prod'}: ${writer.total}`);
  }

  console.log('\nDone!');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
