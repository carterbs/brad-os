import { describe, it, expect } from 'vitest';
import { buildShoppingList } from '../../services/shopping-list.service.js';
import type { MealPlanEntry, Recipe, Ingredient } from '../../shared.js';

// --- Helpers ---

function entry(mealId: string | null): MealPlanEntry {
  return {
    day_index: 0,
    meal_type: 'dinner',
    meal_id: mealId,
    meal_name: mealId === null ? 'Eating out' : `Meal ${mealId}`,
  };
}

function recipe(mealId: string, ingredients: Recipe['ingredients']): Recipe {
  return {
    id: `recipe-${mealId}`,
    meal_id: mealId,
    ingredients,
    steps: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function ingredient(id: string, name: string, storeSection: string): Ingredient {
  return {
    id,
    name,
    store_section: storeSection,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

describe('buildShoppingList', () => {
  it('returns empty sections for an empty plan', () => {
    const result = buildShoppingList([], [], []);

    expect(result.sections).toEqual([]);
  });

  it('returns empty sections when plan has only null meal_ids', () => {
    const plan = [entry(null), entry(null)];
    const result = buildShoppingList(plan, [], []);

    expect(result.sections).toEqual([]);
  });

  it('skips meals with no matching recipe gracefully', () => {
    const plan = [entry('meal-1')];
    // No recipes provided
    const result = buildShoppingList(plan, [], []);

    expect(result.sections).toEqual([]);
  });

  it('aggregates quantities for the same ingredient across meals', () => {
    const plan = [entry('meal-1'), entry('meal-2')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-broccoli', quantity: 2, unit: 'cups' }]),
      recipe('meal-2', [{ ingredient_id: 'ing-broccoli', quantity: 1, unit: 'cups' }]),
    ];

    const ingredients = [
      ingredient('ing-broccoli', 'Broccoli', 'produce'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    expect(result.sections).toHaveLength(1);
    const section = result.sections[0];
    expect(section).toBeDefined();
    expect(section!.name).toBe('Produce');
    expect(section!.items).toHaveLength(1);

    const item = section!.items[0];
    expect(item).toBeDefined();
    expect(item!.ingredient_id).toBe('ing-broccoli');
    expect(item!.total_quantity).toBe(3);
    expect(item!.unit).toBe('cups');
    expect(item!.meal_count).toBe(2);
    expect(item!.display_text).toBe('3 cups Broccoli');
  });

  it('nulls out quantity and unit when units differ for same ingredient', () => {
    const plan = [entry('meal-1'), entry('meal-2')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-cheese', quantity: 200, unit: 'g' }]),
      recipe('meal-2', [{ ingredient_id: 'ing-cheese', quantity: 1, unit: 'cups' }]),
    ];

    const ingredients = [
      ingredient('ing-cheese', 'Cheddar Cheese', 'dairy_and_eggs'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    expect(result.sections).toHaveLength(1);
    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.total_quantity).toBeNull();
    expect(item!.unit).toBeNull();
    expect(item!.meal_count).toBe(2);
    expect(item!.display_text).toBe('Cheddar Cheese');
  });

  it('handles ingredients with no quantity (null qty and unit)', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-salt', quantity: null, unit: null }]),
    ];

    const ingredients = [
      ingredient('ing-salt', 'Salt', 'pantry_staples'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.total_quantity).toBeNull();
    expect(item!.unit).toBeNull();
    expect(item!.display_text).toBe('Salt');
  });

  it('formats display_text correctly with quantity', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-rice', quantity: 2, unit: 'cups' }]),
    ];

    const ingredients = [
      ingredient('ing-rice', 'Rice', 'pasta_and_grains'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.display_text).toBe('2 cups Rice');
  });

  it('formats display_text without trailing decimals for whole numbers', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-rice', quantity: 2.0, unit: 'cups' }]),
    ];

    const ingredients = [
      ingredient('ing-rice', 'Rice', 'pasta_and_grains'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    // Should be "2 cups Rice" not "2.0 cups Rice"
    expect(item!.display_text).toBe('2 cups Rice');
  });

  it('formats display_text with decimal quantities', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-oil', quantity: 1.5, unit: 'tbsp' }]),
    ];

    const ingredients = [
      ingredient('ing-oil', 'Olive Oil', 'condiments_and_spreads'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.display_text).toBe('1.5 tbsp Olive Oil');
  });

  it('sorts sections by store section sort order', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [
        { ingredient_id: 'ing-pasta', quantity: 1, unit: 'box' },
        { ingredient_id: 'ing-broccoli', quantity: 1, unit: 'head' },
        { ingredient_id: 'ing-ice-cream', quantity: 1, unit: 'pint' },
      ]),
    ];

    const ingredients = [
      ingredient('ing-pasta', 'Spaghetti', 'pasta_and_grains'),
      ingredient('ing-broccoli', 'Broccoli', 'produce'),
      ingredient('ing-ice-cream', 'Ice Cream', 'frozen'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    expect(result.sections).toHaveLength(3);
    expect(result.sections[0]!.name).toBe('Produce');
    expect(result.sections[0]!.sort_order).toBe(1);
    expect(result.sections[1]!.name).toBe('Frozen');
    expect(result.sections[1]!.sort_order).toBe(6);
    expect(result.sections[2]!.name).toBe('Pasta & Grains');
    expect(result.sections[2]!.sort_order).toBe(8);
  });

  it('sorts items alphabetically within a section', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [
        { ingredient_id: 'ing-zucchini', quantity: 1, unit: 'whole' },
        { ingredient_id: 'ing-avocado', quantity: 2, unit: 'whole' },
        { ingredient_id: 'ing-carrot', quantity: 3, unit: 'whole' },
      ]),
    ];

    const ingredients = [
      ingredient('ing-zucchini', 'Zucchini', 'produce'),
      ingredient('ing-avocado', 'Avocado', 'produce'),
      ingredient('ing-carrot', 'Carrot', 'produce'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    expect(result.sections).toHaveLength(1);
    const names = result.sections[0]!.items.map((i) => i.name);
    expect(names).toEqual(['Avocado', 'Carrot', 'Zucchini']);
  });

  it('handles ingredient not found in lookup (skips gracefully)', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [
        { ingredient_id: 'ing-unknown', quantity: 1, unit: 'cups' },
        { ingredient_id: 'ing-known', quantity: 2, unit: 'cups' },
      ]),
    ];

    const ingredients = [
      ingredient('ing-known', 'Flour', 'pantry_staples'),
      // ing-unknown is NOT in the ingredients list
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.items).toHaveLength(1);
    expect(result.sections[0]!.items[0]!.name).toBe('Flour');
  });

  it('deduplicates meal_ids from the plan before processing', () => {
    // Same meal_id appears twice in the plan (e.g., same meal on two days)
    const plan = [entry('meal-1'), entry('meal-1')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-rice', quantity: 1, unit: 'cups' }]),
    ];

    const ingredients = [
      ingredient('ing-rice', 'Rice', 'pasta_and_grains'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    // Should count both occurrences (not deduplicate meals, just sum)
    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.total_quantity).toBe(2);
    expect(item!.meal_count).toBe(2);
  });

  it('handles mixed: some ingredients have qty, some do not', () => {
    const plan = [entry('meal-1'), entry('meal-2')];

    const recipes = [
      recipe('meal-1', [{ ingredient_id: 'ing-salt', quantity: null, unit: null }]),
      recipe('meal-2', [{ ingredient_id: 'ing-salt', quantity: 1, unit: 'tsp' }]),
    ];

    const ingredients = [
      ingredient('ing-salt', 'Salt', 'pantry_staples'),
    ];

    const result = buildShoppingList(plan, recipes, ingredients);

    // One appearance has null qty, the other has a qty — units effectively differ
    const item = result.sections[0]!.items[0];
    expect(item).toBeDefined();
    expect(item!.total_quantity).toBeNull();
    expect(item!.unit).toBeNull();
    expect(item!.meal_count).toBe(2);
    expect(item!.display_text).toBe('Salt');
  });

  it('includes all known store sections with correct display names', () => {
    const plan = [entry('meal-1')];

    const sectionKeys = [
      'produce', 'dairy_and_eggs', 'meat_and_seafood', 'deli',
      'bakery_and_bread', 'frozen', 'canned_and_jarred', 'pasta_and_grains',
      'snacks_and_cereal', 'condiments_and_spreads', 'pantry_staples',
    ];

    const recipeIngredients = sectionKeys.map((key, i) => ({
      ingredient_id: `ing-${i}`,
      quantity: 1,
      unit: 'unit',
    }));

    const recipes = [recipe('meal-1', recipeIngredients)];

    const ingredientsList = sectionKeys.map((key, i) =>
      ingredient(`ing-${i}`, `Item ${i}`, key)
    );

    const result = buildShoppingList(plan, recipes, ingredientsList);

    const sectionNames = result.sections.map((s) => s.name);
    expect(sectionNames).toEqual([
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
    ]);
  });

  it('places unknown store sections at the end', () => {
    const plan = [entry('meal-1')];

    const recipes = [
      recipe('meal-1', [
        { ingredient_id: 'ing-1', quantity: 1, unit: 'unit' },
        { ingredient_id: 'ing-2', quantity: 1, unit: 'unit' },
      ]),
    ];

    const ingredientsList = [
      ingredient('ing-1', 'Mystery Item', 'unknown_section'),
      ingredient('ing-2', 'Broccoli', 'produce'),
    ];

    const result = buildShoppingList(plan, recipes, ingredientsList);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.name).toBe('Produce');
    expect(result.sections[1]!.name).toBe('unknown_section');
  });
});
