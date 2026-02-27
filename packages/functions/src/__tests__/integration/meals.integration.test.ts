/**
 * Integration Tests for Meal Planning API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const MEALS_URL = `${FUNCTIONS_URL}/devMeals`;
const INGREDIENTS_URL = `${FUNCTIONS_URL}/devIngredients`;
const RECIPES_URL = `${FUNCTIONS_URL}/devRecipes`;

interface Meal {
  id: string;
  name: string;
  meal_type: string;
  effort: number;
  has_red_meat: boolean;
  prep_ahead: boolean;
  url: string;
  last_planned: string | null;
  created_at: string;
  updated_at: string;
}

interface Ingredient {
  id: string;
  name: string;
  store_section: string;
  created_at: string;
  updated_at: string;
}

interface Recipe {
  id: string;
  meal_id: string;
  ingredients: Array<{ ingredient_id: string; quantity: number; unit: string }>;
  steps: Array<{ step_number: number; instruction: string }>;
  created_at: string;
  updated_at: string;
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function createValidMeal(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    name: 'Test Chicken Stir Fry',
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    prep_ahead: false,
    url: 'https://example.com/recipe',
    ...overrides,
  };
}

function createValidIngredient(): Record<string, unknown> {
  return {
    name: 'Integration Carrot',
    store_section: 'Produce',
  };
}

function createValidRecipe(mealId: string): Record<string, unknown> {
  return {
    meal_id: mealId,
    ingredients: [
      {
        ingredient_id: 'integration-ingredient-id',
        quantity: 150,
        unit: 'g',
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: 'Prepare ingredients',
      },
    ],
  };
}

describe('Meals API (Integration)', () => {
  const createdMealIds: string[] = [];

  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  afterEach(async () => {
    for (const id of createdMealIds) {
      try {
        await fetch(`${MEALS_URL}/${id}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
    }
    createdMealIds.length = 0;
  });

  it('should create a meal with valid data', async () => {
    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<Meal>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBeDefined();
    expect(result.data.name).toBe('Test Chicken Stir Fry');
    expect(result.data.meal_type).toBe('dinner');
    expect(result.data.effort).toBe(5);
    expect(result.data.has_red_meat).toBe(false);
    expect(result.data.prep_ahead).toBe(false);
    expect(result.data.url).toBe('https://example.com/recipe');
    createdMealIds.push(result.data.id);
  });

  it('should create a breakfast meal', async () => {
    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal({ name: 'Oatmeal Bowl', meal_type: 'breakfast', effort: 2 })),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<Meal>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBeDefined();
    expect(result.data.name).toBe('Oatmeal Bowl');
    expect(result.data.meal_type).toBe('breakfast');
    expect(result.data.effort).toBe(2);
    createdMealIds.push(result.data.id);
  });

  it('should reject missing name', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _name, ...mealWithoutName } = createValidMeal();

    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealWithoutName),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid meal_type', async () => {
    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal({ meal_type: 'snack' })),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject effort out of range', async () => {
    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal({ effort: 11 })),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should list all meals', async () => {
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    createdMealIds.push(createResult.data.id);

    const response = await fetch(MEALS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Meal[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should get a meal by id', async () => {
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;
    createdMealIds.push(mealId);

    const response = await fetch(`${MEALS_URL}/${mealId}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Meal>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBe(mealId);
    expect(result.data.name).toBe('Test Chicken Stir Fry');
    expect(result.data.meal_type).toBe('dinner');
  });

  it('should return 404 for non-existent meal', async () => {
    const response = await fetch(`${MEALS_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should update a meal', async () => {
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;
    createdMealIds.push(mealId);

    const updateResponse = await fetch(`${MEALS_URL}/${mealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Chicken Stir Fry' }),
    });

    expect(updateResponse.status).toBe(200);
    const updateResult = (await updateResponse.json()) as ApiResponse<Meal>;
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.name).toBe('Updated Chicken Stir Fry');
  });

  it('should delete a meal', async () => {
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;

    const response = await fetch(`${MEALS_URL}/${mealId}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<{ deleted: boolean }>;
    expect(result.success).toBe(true);
    expect(result.data.deleted).toBe(true);
  });
});

describe('Ingredients API (Integration)', () => {
  const createdIngredientIds: string[] = [];

  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  afterEach(async () => {
    for (const id of createdIngredientIds) {
      try {
        await fetch(`${INGREDIENTS_URL}/${id}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
    }
    createdIngredientIds.length = 0;
  });

  it('should create and retrieve an ingredient', async () => {
    const createResponse = await fetch(INGREDIENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidIngredient()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Ingredient>;

    expect(createResponse.status).toBe(201);
    expect(createResult.success).toBe(true);
    expect(createResult.data.name).toBe('Integration Carrot');
    createdIngredientIds.push(createResult.data.id);

    const getResponse = await fetch(`${INGREDIENTS_URL}/${createResult.data.id}`);
    expect(getResponse.status).toBe(200);
    const getResult = (await getResponse.json()) as ApiResponse<Ingredient>;

    expect(getResult.success).toBe(true);
    expect(getResult.data.id).toBe(createResult.data.id);
    expect(getResult.data.store_section).toBe('Produce');
  });

  it('should list ingredients', async () => {
    await fetch(INGREDIENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidIngredient()),
    }).then(async (response) => {
      const result = (await response.json()) as ApiResponse<Ingredient>;
      if (result.success) {
        createdIngredientIds.push(result.data.id);
      }
    });

    const response = await fetch(INGREDIENTS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Ingredient[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should update an ingredient', async () => {
    const createResponse = await fetch(INGREDIENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidIngredient()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Ingredient>;
    const ingredientId = createResult.data.id;
    createdIngredientIds.push(ingredientId);

    const updateResponse = await fetch(`${INGREDIENTS_URL}/${ingredientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Integration Carrot Updated' }),
    });
    expect(updateResponse.status).toBe(200);

    const updateResult = (await updateResponse.json()) as ApiResponse<Ingredient>;
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.name).toBe('Integration Carrot Updated');
  });

  it('should delete an ingredient', async () => {
    const createResponse = await fetch(INGREDIENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidIngredient()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Ingredient>;

    const response = await fetch(`${INGREDIENTS_URL}/${createResult.data.id}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<{ deleted: boolean }>;
    expect(result.success).toBe(true);
    expect(result.data.deleted).toBe(true);
  });

  it('should return 404 for invalid ingredient id', async () => {
    const response = await fetch(`${INGREDIENTS_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('Recipes API (Integration)', () => {
  const createdRecipeIds: string[] = [];
  const createdMealIds: string[] = [];

  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  afterEach(async () => {
    for (const id of createdRecipeIds) {
      try {
        await fetch(`${RECIPES_URL}/${id}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
    }
    createdRecipeIds.length = 0;

    for (const id of createdMealIds) {
      try {
        await fetch(`${MEALS_URL}/${id}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
    }
    createdMealIds.length = 0;
  });

  async function createDependencyMeal(): Promise<string> {
    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const result = (await response.json()) as ApiResponse<Meal>;
    createdMealIds.push(result.data.id);
    return result.data.id;
  }

  it('should create and retrieve a recipe', async () => {
    const mealId = await createDependencyMeal();

    const createResponse = await fetch(RECIPES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRecipe(mealId)),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Recipe>;

    expect(createResponse.status).toBe(201);
    expect(createResult.success).toBe(true);
    expect(createResult.data.meal_id).toBe(mealId);
    createdRecipeIds.push(createResult.data.id);

    const getResponse = await fetch(`${RECIPES_URL}/${createResult.data.id}`);
    expect(getResponse.status).toBe(200);
    const getResult = (await getResponse.json()) as ApiResponse<Recipe>;

    expect(getResult.success).toBe(true);
    expect(getResult.data.id).toBe(createResult.data.id);
    expect(getResult.data.meal_id).toBe(mealId);
  });

  it('should list recipes', async () => {
    const mealId = await createDependencyMeal();
    const createResponse = await fetch(RECIPES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRecipe(mealId)),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Recipe>;
    createdRecipeIds.push(createResult.data.id);

    const response = await fetch(RECIPES_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Recipe[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should update a recipe', async () => {
    const mealId = await createDependencyMeal();
    const createResponse = await fetch(RECIPES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRecipe(mealId)),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Recipe>;
    const recipeId = createResult.data.id;
    createdRecipeIds.push(recipeId);

    const updateResponse = await fetch(`${RECIPES_URL}/${recipeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        steps: [{ step_number: 1, instruction: 'Updated mix' }],
      }),
    });

    expect(updateResponse.status).toBe(200);
    const updateResult = (await updateResponse.json()) as ApiResponse<Recipe>;
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.steps?.[0]?.instruction).toBe('Updated mix');
  });

  it('should delete a recipe', async () => {
    const mealId = await createDependencyMeal();
    const createResponse = await fetch(RECIPES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRecipe(mealId)),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Recipe>;

    const response = await fetch(`${RECIPES_URL}/${createResult.data.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<{ deleted: boolean }>;
    expect(result.success).toBe(true);
    expect(result.data.deleted).toBe(true);
  });

  it('should return 404 for non-existent recipe', async () => {
    const response = await fetch(`${RECIPES_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
