#!/usr/bin/env npx tsx
/**
 * Assign Store Sections to Ingredients
 *
 * One-time script that adds a `storeSection` field to every ingredient
 * document in the Firestore emulator (or production).
 *
 * Usage:
 *   # Start emulator first:
 *   npm run emulators
 *
 *   # Run against dev_ingredients (emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/assign-store-sections.ts
 *
 *   # Run against production ingredients collection:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/assign-store-sections.ts --prod
 *
 *   # Dry run (shows what would happen without writing):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/assign-store-sections.ts --dry-run
 */

import { initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

// ─── Store Sections (ordered by typical grocery store layout) ────────────────

const STORE_SECTIONS = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Deli',
  'Bakery & Bread',
  'Frozen',
  'Canned & Jarred',
  'Pasta & Grains',
  'Snacks & Cereal',
  'Condiments & Spreads',
  'Pantry Staples',
] as const;

type StoreSection = (typeof STORE_SECTIONS)[number];

// ─── Classification Mapping ──────────────────────────────────────────────────
// Every canonical ingredient name → its store section.
// Organized by section for readability.

const INGREDIENT_SECTIONS: Record<string, StoreSection> = {
  // ── Produce ──────────────────────────────────────────────────────────────
  'apple slices': 'Produce',
  'apples': 'Produce',
  'arugula': 'Produce',
  'avocado': 'Produce',
  'baby carrots': 'Produce',
  'bagged salad': 'Produce',
  'bananas': 'Produce',
  'blackberries': 'Produce',
  'blueberries': 'Produce',
  'brussels sprouts': 'Produce',
  'cantaloupe': 'Produce',
  'carrots': 'Produce',
  'celery': 'Produce',
  'cherry tomatoes': 'Produce',
  'cilantro': 'Produce',
  'cucumber': 'Produce',
  'fresh basil': 'Produce',
  'fresh dill': 'Produce',
  'fresh herbs': 'Produce',
  'fresh mint': 'Produce',
  'fresh parsley': 'Produce',
  'fresh rosemary': 'Produce',
  'fresh thyme': 'Produce',
  'fruit': 'Produce',
  'garlic': 'Produce',
  'grapes': 'Produce',
  'green cabbage': 'Produce',
  'kale': 'Produce',
  'lemons': 'Produce',
  'lettuce': 'Produce',
  'limes': 'Produce',
  'mushrooms': 'Produce',
  'red onion': 'Produce',
  'red potatoes': 'Produce',
  'salad greens': 'Produce',
  'scallions': 'Produce',
  'shallots': 'Produce',
  'shredded carrots': 'Produce',
  'strawberries': 'Produce',
  'sweet onion': 'Produce',
  'tomatoes': 'Produce',
  'watermelon': 'Produce',
  'white onion': 'Produce',
  'yellow onion': 'Produce',

  // ── Dairy & Eggs ─────────────────────────────────────────────────────────
  'almond milk': 'Dairy & Eggs',
  'butter': 'Dairy & Eggs',
  'cheddar cheese': 'Dairy & Eggs',
  'cheese cubes': 'Dairy & Eggs',
  'cheese slices': 'Dairy & Eggs',
  'cheese sticks': 'Dairy & Eggs',
  'cherry Chobani': 'Dairy & Eggs',
  'coconut Chobani': 'Dairy & Eggs',
  'cream cheese': 'Dairy & Eggs',
  'eggs': 'Dairy & Eggs',
  'Fage yogurt': 'Dairy & Eggs',
  'feta cheese': 'Dairy & Eggs',
  'greek yogurt': 'Dairy & Eggs',
  'hard cheese': 'Dairy & Eggs',
  'hard-boiled eggs': 'Dairy & Eggs',
  'heavy cream': 'Dairy & Eggs',
  'jack cheese': 'Dairy & Eggs',
  'mango Chobani': 'Dairy & Eggs',
  'milk': 'Dairy & Eggs',
  'mozzarella cheese': 'Dairy & Eggs',
  'mozzarella sticks': 'Dairy & Eggs',
  'parmesan cheese': 'Dairy & Eggs',
  'pineapple Chobani': 'Dairy & Eggs',
  'ricotta cheese': 'Dairy & Eggs',
  'shredded cheese': 'Dairy & Eggs',
  'shredded mexican cheese': 'Dairy & Eggs',
  'sour cream': 'Dairy & Eggs',
  'swiss cheese': 'Dairy & Eggs',
  'white cheddar': 'Dairy & Eggs',
  'yogurt': 'Dairy & Eggs',
  'yogurt pouches': 'Dairy & Eggs',

  // ── Meat & Seafood ───────────────────────────────────────────────────────
  '80% lean ground beef': 'Meat & Seafood',
  '85% lean ground beef': 'Meat & Seafood',
  '90% lean ground turkey': 'Meat & Seafood',
  '93% lean ground beef': 'Meat & Seafood',
  '99% lean ground chicken': 'Meat & Seafood',
  'bacon': 'Meat & Seafood',
  'bone-in chicken': 'Meat & Seafood',
  'breakfast sausage': 'Meat & Seafood',
  'chicken': 'Meat & Seafood',
  'chicken breasts': 'Meat & Seafood',
  'chicken thighs': 'Meat & Seafood',
  'flounder': 'Meat & Seafood',
  'ground lamb': 'Meat & Seafood',
  'hot dogs': 'Meat & Seafood',
  'italian sausage': 'Meat & Seafood',
  'lean ground beef': 'Meat & Seafood',
  'pork chops': 'Meat & Seafood',
  'pork tenderloin': 'Meat & Seafood',
  'rotisserie chicken': 'Meat & Seafood',
  'salmon': 'Meat & Seafood',
  'steak': 'Meat & Seafood',
  'white fish fillets': 'Meat & Seafood',
  'whole fish': 'Meat & Seafood',

  // ── Deli ─────────────────────────────────────────────────────────────────
  'mini turkey meatballs': 'Deli',
  'pepperoni': 'Deli',
  'salami': 'Deli',
  'sliced ham': 'Deli',
  'sliced turkey': 'Deli',

  // ── Bakery & Bread ───────────────────────────────────────────────────────
  'baguette': 'Bakery & Bread',
  'bread': 'Bakery & Bread',
  'brioche buns': 'Bakery & Bread',
  'corn tortillas': 'Bakery & Bread',
  'country bread': 'Bakery & Bread',
  'crusty bread': 'Bakery & Bread',
  'dinner rolls': 'Bakery & Bread',
  'italian bread': 'Bakery & Bread',
  'naan': 'Bakery & Bread',
  'pita bread': 'Bakery & Bread',
  'rye bread': 'Bakery & Bread',
  'sandwich rolls': 'Bakery & Bread',
  'sourdough bread': 'Bakery & Bread',
  "Thomas' blueberry bagels": 'Bakery & Bread',
  "Thomas' cinnamon raisin bagels": 'Bakery & Bread',
  "Thomas' plain bagels": 'Bakery & Bread',
  'tortillas': 'Bakery & Bread',
  'whole wheat bread': 'Bakery & Bread',

  // ── Frozen ───────────────────────────────────────────────────────────────
  'Eggo pancakes': 'Frozen',
  'Eggo waffles': 'Frozen',
  'fish sticks': 'Frozen',
  'Freschetta five cheese pizza': 'Frozen',
  'Freschetta pepperoni pizza': 'Frozen',
  'frozen broccoli': 'Frozen',
  'frozen pancakes': 'Frozen',
  'frozen shrimp': 'Frozen',
  'frozen strawberries': 'Frozen',
  'frozen vegetables': 'Frozen',
  'Pillsbury pizza dough': 'Frozen',
  'Tyson dinosaur nuggets': 'Frozen',

  // ── Canned & Jarred ──────────────────────────────────────────────────────
  'beef bouillon': 'Canned & Jarred',
  'black beans': 'Canned & Jarred',
  'canned tuna': 'Canned & Jarred',
  'capers': 'Canned & Jarred',
  'chicken broth': 'Canned & Jarred',
  'chipotle in adobo': 'Canned & Jarred',
  'crushed tomatoes': 'Canned & Jarred',
  'kidney beans': 'Canned & Jarred',
  'marinara sauce': 'Canned & Jarred',
  'pasta sauce': 'Canned & Jarred',
  'pinto beans': 'Canned & Jarred',
  'sun-dried tomatoes': 'Canned & Jarred',
  'tomato paste': 'Canned & Jarred',

  // ── Pasta & Grains ───────────────────────────────────────────────────────
  'Barilla lasagna noodles': 'Pasta & Grains',
  'cavatappi': 'Pasta & Grains',
  'flour': 'Pasta & Grains',
  'Kraft mac and cheese': 'Pasta & Grains',
  'linguine': 'Pasta & Grains',
  'microwave rice': 'Pasta & Grains',
  'pancake mix': 'Pasta & Grains',
  'panko bread crumbs': 'Pasta & Grains',
  'rolled oats': 'Pasta & Grains',
  'short pasta': 'Pasta & Grains',
  'spaghetti': 'Pasta & Grains',
  'tortellini': 'Pasta & Grains',

  // ── Snacks & Cereal ──────────────────────────────────────────────────────
  'applesauce pouches': 'Snacks & Cereal',
  'chocolate chips': 'Snacks & Cereal',
  'Frosted Mini Wheats': 'Snacks & Cereal',
  'Goldfish crackers': 'Snacks & Cereal',
  'graham crackers': 'Snacks & Cereal',
  'granola': 'Snacks & Cereal',
  'Honey Nut Cheerios': 'Snacks & Cereal',
  "Lay's potato chips": 'Snacks & Cereal',
  'Nature Valley granola bar': 'Snacks & Cereal',
  'Nutri-Grain bars': 'Snacks & Cereal',
  'potato chips': 'Snacks & Cereal',
  'protein granola': 'Snacks & Cereal',
  'Quaker oatmeal variety pack': 'Snacks & Cereal',
  'Raisin Bran': 'Snacks & Cereal',
  'Ritz crackers': 'Snacks & Cereal',
  'Special K Fruit & Yogurt': 'Snacks & Cereal',
  'Tostitos lime chips': 'Snacks & Cereal',

  // ── Condiments & Spreads ─────────────────────────────────────────────────
  'apple butter': 'Condiments & Spreads',
  'barbecue sauce': 'Condiments & Spreads',
  'blackberry jam': 'Condiments & Spreads',
  'fig preserves': 'Condiments & Spreads',
  'guacamole': 'Condiments & Spreads',
  'hot sauce': 'Condiments & Spreads',
  'hummus': 'Condiments & Spreads',
  'jam': 'Condiments & Spreads',
  'jelly': 'Condiments & Spreads',
  'lemon juice': 'Condiments & Spreads',
  'lime juice': 'Condiments & Spreads',
  'maple syrup': 'Condiments & Spreads',
  'mayonnaise': 'Condiments & Spreads',
  'mustard': 'Condiments & Spreads',
  'peach preserves': 'Condiments & Spreads',
  'peanut butter': 'Condiments & Spreads',
  'pickle relish': 'Condiments & Spreads',
  'raspberry jam': 'Condiments & Spreads',
  'soy sauce': 'Condiments & Spreads',
  'sunbutter': 'Condiments & Spreads',
  'Tostitos salsa': 'Condiments & Spreads',
  'tzatziki': 'Condiments & Spreads',
  "Welch's grape jelly": 'Condiments & Spreads',
  'Worcestershire sauce': 'Condiments & Spreads',

  // ── Pantry Staples ───────────────────────────────────────────────────────
  'balsamic vinegar': 'Pantry Staples',
  'apple cider vinegar': 'Pantry Staples',
  'beer': 'Pantry Staples',
  'black pepper': 'Pantry Staples',
  'brown sugar': 'Pantry Staples',
  'cayenne': 'Pantry Staples',
  'chia seeds': 'Pantry Staples',
  'chili powder': 'Pantry Staples',
  'chipotle powder': 'Pantry Staples',
  'cinnamon': 'Pantry Staples',
  'cocoa powder': 'Pantry Staples',
  'cooking spray': 'Pantry Staples',
  'cumin': 'Pantry Staples',
  'dill pickles': 'Pantry Staples',
  'dried oregano': 'Pantry Staples',
  'dry vermouth': 'Pantry Staples',
  'garlic powder': 'Pantry Staples',
  'ground cloves': 'Pantry Staples',
  'ground coriander': 'Pantry Staples',
  'herbes de Provence': 'Pantry Staples',
  'honey': 'Pantry Staples',
  'onion powder': 'Pantry Staples',
  'paprika': 'Pantry Staples',
  'peanut oil': 'Pantry Staples',
  'pickled onion': 'Pantry Staples',
  'poppy seeds': 'Pantry Staples',
  'powdered sugar': 'Pantry Staples',
  'red pepper flakes': 'Pantry Staples',
  'red wine vinegar': 'Pantry Staples',
  'sea salt': 'Pantry Staples',
  'vanilla extract': 'Pantry Staples',
  'walnuts': 'Pantry Staples',
  'pecans': 'Pantry Staples',
};

// ─── Batch Helper ────────────────────────────────────────────────────────────

class BatchWriter {
  private batch: WriteBatch;
  private count = 0;
  private totalWrites = 0;
  private readonly MAX_BATCH = 450;

  constructor(private db: Firestore) {
    this.batch = db.batch();
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isProd = process.argv.includes('--prod');
  const isDryRun = process.argv.includes('--dry-run');
  const prefix = isProd ? '' : 'dev_';
  const collectionName = `${prefix}ingredients`;

  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    console.error('ERROR: FIRESTORE_EMULATOR_HOST is not set.');
    console.error('Start the emulator first: npm run emulators');
    console.error('Then run: FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/assign-store-sections.ts');
    process.exit(1);
  }

  console.log(`Target: ${isProd ? 'PRODUCTION' : 'dev'} collection "${collectionName}"`);
  console.log(`Emulator: ${process.env['FIRESTORE_EMULATOR_HOST']}`);
  if (isDryRun) console.log('MODE: dry run (no writes)');

  // Validate the mapping covers all 11 sections
  const sectionsUsed = new Set(Object.values(INGREDIENT_SECTIONS));
  const missingSections = STORE_SECTIONS.filter((s) => !sectionsUsed.has(s));
  if (missingSections.length > 0) {
    console.error(`ERROR: No ingredients mapped to sections: ${missingSections.join(', ')}`);
    process.exit(1);
  }

  // Initialize Firebase
  const app: App = initializeApp({ projectId: 'brad-os-app' });
  const db: Firestore = getFirestore(app);

  // Read all ingredient documents
  console.log(`\nReading ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  console.log(`  Found ${snapshot.size} ingredient documents`);

  if (snapshot.empty) {
    console.error('ERROR: No ingredients found. Run the migration script first.');
    process.exit(1);
  }

  // Classify each ingredient
  const sectionCounts: Record<string, number> = {};
  for (const section of STORE_SECTIONS) {
    sectionCounts[section] = 0;
  }

  const unmatched: string[] = [];
  const alreadySet: string[] = [];
  let updatedCount = 0;
  let skippedCount = 0;

  const writer = new BatchWriter(db);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = data['name'] as string;

    // Check if storeSection is already set
    if (data['storeSection']) {
      alreadySet.push(name);
      skippedCount++;
      continue;
    }

    // Look up the section
    const section = INGREDIENT_SECTIONS[name];
    if (!section) {
      unmatched.push(`  "${name}" (doc: ${doc.id})`);
      continue;
    }

    sectionCounts[section]++;

    if (!isDryRun) {
      writer.update(doc.ref, {
        storeSection: section,
        updatedAt: new Date().toISOString(),
      });
      await writer.flushIfNeeded();
    }

    updatedCount++;
  }

  if (!isDryRun) {
    await writer.flush();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n── Section Counts ──');
  for (const section of STORE_SECTIONS) {
    const count = sectionCounts[section] ?? 0;
    console.log(`  ${section.padEnd(22)} ${count}`);
  }

  console.log(`\n── Results ──`);
  console.log(`  Total documents:     ${snapshot.size}`);
  console.log(`  Updated:             ${updatedCount}`);
  console.log(`  Already had section: ${skippedCount}`);
  console.log(`  Unmatched:           ${unmatched.length}`);

  if (alreadySet.length > 0) {
    console.log(`\n  Skipped (already set): ${alreadySet.join(', ')}`);
  }

  if (unmatched.length > 0) {
    console.log('\n  Unmatched ingredients:');
    for (const u of unmatched) {
      console.log(u);
    }
  }

  // ── Validation Gate ──────────────────────────────────────────────────────
  const totalClassified = updatedCount + skippedCount;
  const hasUnmatched = unmatched.length > 0;

  console.log('\n── Validation ──');
  if (hasUnmatched) {
    console.log('  FAIL: Some ingredients have no storeSection assignment.');
    process.exit(1);
  } else if (totalClassified === snapshot.size) {
    console.log(`  PASS: All ${snapshot.size} ingredients have a storeSection.`);
  } else {
    console.log(`  FAIL: ${totalClassified} classified but ${snapshot.size} documents exist.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Script failed:', err);
  process.exit(1);
});
