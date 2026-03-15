import type {
  MealPlanEntry,
  Recipe,
  Ingredient,
  ShoppingListItem,
  ShoppingListSection,
  ShoppingListResult,
} from '../shared.js';

// Re-export types so consumers can import from here or shared
export type { ShoppingListItem, ShoppingListSection, ShoppingListResult };

/** Store section sort order and display names (matches iOS StoreSection enum). */
const STORE_SECTIONS: ReadonlyArray<{ key: string; name: string; sortOrder: number }> = [
  { key: 'produce', name: 'Produce', sortOrder: 1 },
  { key: 'dairy_and_eggs', name: 'Dairy & Eggs', sortOrder: 2 },
  { key: 'meat_and_seafood', name: 'Meat & Seafood', sortOrder: 3 },
  { key: 'deli', name: 'Deli', sortOrder: 4 },
  { key: 'bakery_and_bread', name: 'Bakery & Bread', sortOrder: 5 },
  { key: 'frozen', name: 'Frozen', sortOrder: 6 },
  { key: 'canned_and_jarred', name: 'Canned & Jarred', sortOrder: 7 },
  { key: 'pasta_and_grains', name: 'Pasta & Grains', sortOrder: 8 },
  { key: 'snacks_and_cereal', name: 'Snacks & Cereal', sortOrder: 9 },
  { key: 'condiments_and_spreads', name: 'Condiments & Spreads', sortOrder: 10 },
  { key: 'pantry_staples', name: 'Pantry Staples', sortOrder: 11 },
];

const SECTION_BY_KEY = new Map(STORE_SECTIONS.map((s) => [s.key, s]));
const SECTION_BY_NAME = new Map(STORE_SECTIONS.map((s) => [s.name, s]));
const UNKNOWN_SORT_ORDER = 999;

function lookupSection(storeSection: string): { key: string; name: string; sortOrder: number } | undefined {
  return SECTION_BY_KEY.get(storeSection) ?? SECTION_BY_NAME.get(storeSection);
}

interface AggregatedItem {
  ingredientId: string;
  name: string;
  storeSection: string;
  totalQuantity: number | null;
  unit: string | null;
  mealCount: number;
  /** Tracks whether units have been invalidated due to mismatch. */
  unitConflict: boolean;
}

function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? qty.toString() : qty.toString();
}

function buildDisplayText(name: string, quantity: number | null, unit: string | null): string {
  if (quantity === null || unit === null) {
    return name;
  }
  return `${formatQuantity(quantity)} ${unit} ${name}`;
}

/**
 * Pure function that builds a shopping list from a meal plan, recipes, and ingredients.
 *
 * Aggregates ingredients across all meals in the plan, sums quantities when units match,
 * nulls out both quantity and unit when they differ, and groups/sorts by store section.
 */
export function buildShoppingList(
  plan: ReadonlyArray<MealPlanEntry>,
  recipes: ReadonlyArray<Recipe>,
  ingredients: ReadonlyArray<Ingredient>,
): ShoppingListResult {
  // Build lookup maps
  const recipesByMealId = new Map<string, Recipe>();
  for (const r of recipes) {
    recipesByMealId.set(r.meal_id, r);
  }

  const ingredientsById = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    ingredientsById.set(ing.id, ing);
  }

  // Extract non-null meal_ids from plan (do NOT deduplicate — same meal on multiple days should sum)
  const mealIds = plan
    .map((e) => e.meal_id)
    .filter((id): id is string => id !== null);

  // Aggregate ingredients
  const aggregated = new Map<string, AggregatedItem>();

  for (const mealId of mealIds) {
    const recipeData = recipesByMealId.get(mealId);
    if (recipeData === undefined) {
      continue; // No recipe for this meal — skip gracefully
    }

    for (const recipeIngredient of recipeData.ingredients) {
      const ingredientData = ingredientsById.get(recipeIngredient.ingredient_id);
      if (ingredientData === undefined) {
        continue; // Unknown ingredient — skip gracefully
      }

      const existing = aggregated.get(recipeIngredient.ingredient_id);

      if (existing === undefined) {
        // First occurrence
        aggregated.set(recipeIngredient.ingredient_id, {
          ingredientId: recipeIngredient.ingredient_id,
          name: ingredientData.name,
          storeSection: ingredientData.store_section,
          totalQuantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          mealCount: 1,
          unitConflict: false,
        });
      } else {
        // Subsequent occurrence — aggregate
        existing.mealCount += 1;

        if (existing.unitConflict) {
          // Already conflicted — stays null
          continue;
        }

        const existingUnit = existing.unit;
        const newUnit = recipeIngredient.unit;
        const existingQty = existing.totalQuantity;
        const newQty = recipeIngredient.quantity;

        // Check for unit mismatch: null vs non-null, or different unit strings
        if (existingUnit !== newUnit) {
          existing.totalQuantity = null;
          existing.unit = null;
          existing.unitConflict = true;
        } else if (existingQty !== null && newQty !== null) {
          existing.totalQuantity = existingQty + newQty;
        } else if (existingQty === null && newQty === null) {
          // Both null — keep null
        } else {
          // One is null, the other isn't but units match — treat as conflict
          existing.totalQuantity = null;
          existing.unit = null;
          existing.unitConflict = true;
        }
      }
    }
  }

  // Group by store section
  const sectionMap = new Map<string, AggregatedItem[]>();

  for (const item of aggregated.values()) {
    const existing = sectionMap.get(item.storeSection);
    if (existing !== undefined) {
      existing.push(item);
    } else {
      sectionMap.set(item.storeSection, [item]);
    }
  }

  // Build sections with sort order
  const sections: ShoppingListSection[] = [];

  for (const [sectionKey, items] of sectionMap) {
    const sectionInfo = lookupSection(sectionKey);
    const sortOrder = sectionInfo?.sortOrder ?? UNKNOWN_SORT_ORDER;
    const displayName = sectionInfo?.name ?? sectionKey;

    // Sort items alphabetically by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    sections.push({
      name: displayName,
      sort_order: sortOrder,
      items: items.map((item) => ({
        ingredient_id: item.ingredientId,
        name: item.name,
        store_section: sectionKey,
        total_quantity: item.totalQuantity,
        unit: item.unit,
        meal_count: item.mealCount,
        display_text: buildDisplayText(item.name, item.totalQuantity, item.unit),
      })),
    });
  }

  // Sort sections by sort order
  sections.sort((a, b) => a.sort_order - b.sort_order);

  return { sections };
}
