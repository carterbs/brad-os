import { describe, it, expect } from 'vitest';
import { createMealSchema, updateMealSchema } from './meal.schema.js';

describe('createMealSchema', () => {
  it('should accept valid meal data', () => {
    const result = createMealSchema.safeParse({
      name: 'Chicken Stir Fry',
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: 'https://example.com/recipe',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Chicken Stir Fry');
      expect(result.data.meal_type).toBe('dinner');
      expect(result.data.effort).toBe(5);
      expect(result.data.has_red_meat).toBe(false);
      expect(result.data.url).toBe('https://example.com/recipe');
    }
  });

  it('should accept all valid meal types', () => {
    const types = ['breakfast', 'lunch', 'dinner'] as const;
    for (const mealType of types) {
      const result = createMealSchema.safeParse({
        name: 'Test Meal',
        meal_type: mealType,
        effort: 3,
        has_red_meat: false,
        prep_ahead: false,
        url: '',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept effort values from 1 to 10', () => {
    for (let effort = 1; effort <= 10; effort++) {
      const result = createMealSchema.safeParse({
        name: 'Test Meal',
        meal_type: 'dinner',
        effort,
        has_red_meat: false,
        prep_ahead: false,
        url: '',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept empty url string', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 3,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = createMealSchema.safeParse({
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = createMealSchema.safeParse({
      name: '',
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name exceeding max length', () => {
    const result = createMealSchema.safeParse({
      name: 'a'.repeat(201),
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid meal_type', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'snack',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject effort below 1', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 0,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject effort above 10', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 11,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer effort', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 3.5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing meal_type', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing effort', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      has_red_meat: false,
      prep_ahead: false,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing has_red_meat', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 5,
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing url', () => {
    const result = createMealSchema.safeParse({
      name: 'Test Meal',
      meal_type: 'dinner',
      effort: 5,
      has_red_meat: false,
      prep_ahead: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateMealSchema', () => {
  it('should accept all fields', () => {
    const result = updateMealSchema.safeParse({
      name: 'Updated Meal',
      meal_type: 'lunch',
      effort: 3,
      has_red_meat: true,
      prep_ahead: false,
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (no updates)', () => {
    const result = updateMealSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial updates - name only', () => {
    const result = updateMealSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept partial updates - effort only', () => {
    const result = updateMealSchema.safeParse({ effort: 7 });
    expect(result.success).toBe(true);
  });

  it('should accept partial updates - meal_type only', () => {
    const result = updateMealSchema.safeParse({ meal_type: 'breakfast' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid meal_type in update', () => {
    const result = updateMealSchema.safeParse({ meal_type: 'brunch' });
    expect(result.success).toBe(false);
  });

  it('should reject empty name in update', () => {
    const result = updateMealSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject effort below 1 in update', () => {
    const result = updateMealSchema.safeParse({ effort: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject effort above 10 in update', () => {
    const result = updateMealSchema.safeParse({ effort: 11 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer effort in update', () => {
    const result = updateMealSchema.safeParse({ effort: 4.5 });
    expect(result.success).toBe(false);
  });
});
