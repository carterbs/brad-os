import { describe, expect, it } from 'vitest';
import {
  createRecipeSchema,
  recipeIngredientSchema,
  recipeResponseSchema,
  recipeStepSchema,
  updateRecipeSchema,
} from './recipe.schema.js';

describe('recipeIngredientSchema', () => {
  const validIngredient = {
    ingredient_id: 'ingredient-1',
    quantity: 1.5,
    unit: 'cup',
  };

  it('accepts a valid ingredient row', () => {
    const result = recipeIngredientSchema.safeParse(validIngredient);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ingredient_id).toBe('ingredient-1');
      expect(result.data.quantity).toBe(1.5);
      expect(result.data.unit).toBe('cup');
    }
  });

  it('accepts nullable quantity and unit', () => {
    const result = recipeIngredientSchema.safeParse({
      ...validIngredient,
      quantity: null,
      unit: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBeNull();
      expect(result.data.unit).toBeNull();
    }
  });

  it('rejects invalid ingredient_id and invalid nullable field values', () => {
    const invalidIngredientId = recipeIngredientSchema.safeParse({
      ingredient_id: 1,
      quantity: 1,
      unit: 'cup',
    });
    const invalidQuantity = recipeIngredientSchema.safeParse({
      ingredient_id: 'ingredient-1',
      quantity: '1',
      unit: 'cup',
    });
    const invalidUnit = recipeIngredientSchema.safeParse({
      ingredient_id: 'ingredient-1',
      quantity: 1,
      unit: 2,
    });

    expect(invalidIngredientId.success).toBe(false);
    expect(invalidQuantity.success).toBe(false);
    expect(invalidUnit.success).toBe(false);
  });
});

describe('recipeStepSchema', () => {
  const validStep = {
    step_number: 1,
    instruction: 'Preheat oven to 350°F',
  };

  it('accepts a valid step payload', () => {
    const result = recipeStepSchema.safeParse(validStep);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step_number).toBe(1);
    }
  });

  it('accepts boundary step_number value 0', () => {
    const result = recipeStepSchema.safeParse({
      ...validStep,
      step_number: 0,
    });

    expect(result.success).toBe(true);
  });

  it('rejects negative and non-integer step_number', () => {
    const negative = recipeStepSchema.safeParse({
      ...validStep,
      step_number: -1,
    });
    const fractional = recipeStepSchema.safeParse({
      ...validStep,
      step_number: 1.5,
    });

    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
  });

  it('rejects non-string instruction', () => {
    const result = recipeStepSchema.safeParse({
      step_number: 1,
      instruction: null,
    });

    expect(result.success).toBe(false);
  });
});

describe('recipeResponseSchema', () => {
  const validPayload = {
    id: 'recipe-1',
    meal_id: 'meal-1',
    ingredients: [
      {
        ingredient_id: 'ingredient-1',
        quantity: 1,
        unit: 'cup',
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: 'Chop onions',
      },
    ],
    created_at: '2026-02-25T00:00:00.000Z',
    updated_at: '2026-02-25T00:00:00.000Z',
  };

  it('accepts valid payload with nested arrays', () => {
    const result = recipeResponseSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ingredients).toHaveLength(1);
      expect(result.data.steps?.[0].instruction).toBe('Chop onions');
    }
  });

  it('accepts steps set to null and empty ingredients array', () => {
    const result = recipeResponseSchema.safeParse({
      ...validPayload,
      ingredients: [],
      steps: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.steps).toBeNull();
      expect(result.data.ingredients).toHaveLength(0);
    }
  });

  it('rejects missing top-level required fields', () => {
    const missing = recipeResponseSchema.safeParse({
      id: 'recipe-1',
      meal_id: 'meal-1',
      ingredients: [],
      steps: null,
    });

    expect(missing.success).toBe(false);
  });

  it('rejects invalid nested ingredient and step entries', () => {
    const invalidIngredient = recipeResponseSchema.safeParse({
      ...validPayload,
      ingredients: [
        {
          ingredient_id: 2,
          quantity: 1,
          unit: 'cup',
        },
      ],
    });
    const invalidStep = recipeResponseSchema.safeParse({
      ...validPayload,
      steps: [
        {
          step_number: -1,
          instruction: 'invalid',
        },
      ],
    });

    expect(invalidIngredient.success).toBe(false);
    expect(invalidStep.success).toBe(false);
  });
});

describe('recipe create/update DTO schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createRecipeSchema.safeParse({
      meal_id: 'meal-1',
      ingredients: [{ ingredient_id: 'ingredient-1', quantity: 2, unit: 'cup' }],
      steps: [{ step_number: 1, instruction: 'Boil water.' }],
    });

    expect(result.success).toBe(true);
  });

  it('requires meal_id for create', () => {
    const result = createRecipeSchema.safeParse({
      ingredients: [],
      steps: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a partial update payload', () => {
    const result = updateRecipeSchema.safeParse({
      meal_id: 'meal-2',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown fields in update payload', () => {
    const result = updateRecipeSchema.safeParse({
      meal_id: 'meal-2',
      unknownField: 'bad',
    });

    expect(result.success).toBe(false);
  });
});
