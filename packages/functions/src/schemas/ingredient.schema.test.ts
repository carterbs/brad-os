import { describe, expect, it } from 'vitest';
<<<<<<< Updated upstream
import {
  createIngredientSchema,
  ingredientResponseSchema,
  updateIngredientSchema,
} from './ingredient.schema.js';
=======
import { ingredientResponseSchema } from './ingredient.schema.js';
>>>>>>> Stashed changes

describe('ingredientResponseSchema', () => {
  const validPayload = {
    id: 'ingredient-1',
    name: 'Chicken Breast',
    store_section: 'Meat',
    created_at: '2026-02-25T00:00:00.000Z',
<<<<<<< Updated upstream
    updated_at: '2026-02-05T00:05:00.000Z',
=======
    updated_at: '2026-02-25T00:05:00.000Z',
>>>>>>> Stashed changes
  };

  it('accepts a fully valid payload', () => {
    const result = ingredientResponseSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('ingredient-1');
      expect(result.data.name).toBe('Chicken Breast');
    }
  });

  it('accepts empty strings for string fields', () => {
    const result = ingredientResponseSchema.safeParse({
      id: '',
      name: '',
      store_section: '',
      created_at: '',
      updated_at: '',
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const missing = ingredientResponseSchema.safeParse({
      id: 'ingredient-1',
      name: 'Chicken Breast',
      store_section: 'Meat',
      created_at: '2026-02-25T00:00:00.000Z',
    });

    expect(missing.success).toBe(false);
  });
<<<<<<< Updated upstream
});

describe('ingredient create/update schemas', () => {
  it('accepts a valid create payload', () => {
    const result = createIngredientSchema.safeParse({
      name: 'Chicken Breast',
      store_section: 'Meat',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid create payloads', () => {
    const missingName = createIngredientSchema.safeParse({ store_section: 'Meat' });
    const badType = createIngredientSchema.safeParse({
      name: 123,
      store_section: 'Meat',
    });

    expect(missingName.success).toBe(false);
    expect(badType.success).toBe(false);
  });

  it('accepts a valid partial update payload', () => {
    const result = updateIngredientSchema.safeParse({
      name: 'Organic Chicken',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid update fields', () => {
    const result = updateIngredientSchema.safeParse({
      unknown: 'bad',
    });

    expect(result.success).toBe(false);
=======

  it('rejects wrong types for each required field', () => {
    const wrongTypePayloads = [
      { id: 99, name: 'Chicken', store_section: 'Meat', created_at: '2026-02-25T00:00:00.000Z', updated_at: '2026-02-25T00:00:00.000Z' },
      { id: 'ingredient-1', name: 42, store_section: 'Meat', created_at: '2026-02-25T00:00:00.000Z', updated_at: '2026-02-25T00:00:00.000Z' },
      { id: 'ingredient-1', name: 'Chicken', store_section: true, created_at: '2026-02-25T00:00:00.000Z', updated_at: '2026-02-25T00:00:00.000Z' },
      { id: 'ingredient-1', name: 'Chicken', store_section: 'Meat', created_at: { value: '2026-02-25' }, updated_at: '2026-02-25T00:00:00.000Z' },
      { id: 'ingredient-1', name: 'Chicken', store_section: 'Meat', created_at: '2026-02-25T00:00:00.000Z', updated_at: ['2026-02-25'] },
    ];

    for (const payload of wrongTypePayloads) {
      const result = ingredientResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    }
>>>>>>> Stashed changes
  });
});
