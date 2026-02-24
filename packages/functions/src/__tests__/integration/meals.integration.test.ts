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
    const mealData = createValidMeal();

    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealData),
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
    const mealData = createValidMeal({ name: 'Oatmeal Bowl', meal_type: 'breakfast', effort: 2 });

    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealData),
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
    const mealData = createValidMeal({ meal_type: 'snack' });

    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject effort out of range', async () => {
    const mealData = createValidMeal({ effort: 11 });

    const response = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should list all meals', async () => {
    // Create a meal first to ensure the list is non-empty
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
  });

  it('should get a meal by id', async () => {
    // Create a meal first
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;
    createdMealIds.push(mealId);

    // Get by ID
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
    // Create a meal first
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;
    createdMealIds.push(mealId);

    // Update the meal
    const response = await fetch(`${MEALS_URL}/${mealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Chicken Stir Fry' }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<Meal>;
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Updated Chicken Stir Fry');
  });

  it('should delete a meal', async () => {
    // Create a meal first
    const createResponse = await fetch(MEALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeal()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Meal>;
    const mealId = createResult.data.id;

    // Delete the meal
    const response = await fetch(`${MEALS_URL}/${mealId}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<{ deleted: boolean }>;
    expect(result.success).toBe(true);
    expect(result.data.deleted).toBe(true);
    // No need to add to createdMealIds since it's already deleted
  });
});

describe('Ingredients API (Integration)', () => {
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

  it('should list ingredients', async () => {
    const response = await fetch(INGREDIENTS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Ingredient[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe('Recipes API (Integration)', () => {
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

  it('should list recipes', async () => {
    const response = await fetch(RECIPES_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Recipe[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
