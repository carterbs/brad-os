import { describe, expect, it } from 'vitest';
import { critiqueInputSchema, critiqueResponseSchema } from './mealplan.schema.js';

describe('critiqueResponseSchema', () => {
  it('accepts a valid critique response with a meal change', () => {
    const payload = {
      explanation: 'Adjusted Monday dinner.',
      operations: [
        { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-d2' },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts a valid critique response with null meal replacement', () => {
    const payload = {
      explanation: 'Removed a meal.',
      operations: [
        { day_index: 2, meal_type: 'lunch', new_meal_id: null },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects invalid meal_type values', () => {
    const payload = {
      explanation: 'Invalid meal type.',
      operations: [
        { day_index: 1, meal_type: 'snack', new_meal_id: 'meal-1' },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects missing required operation fields', () => {
    const payload = {
      explanation: 'Missing field.',
      operations: [
        { day_index: 1, new_meal_id: 'meal-1' },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe('critiqueInputSchema', () => {
  it('accepts valid critique text', () => {
    const result = critiqueInputSchema.safeParse({
      critique: 'Great meal plan with good variety and balance.',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.critique).toBe('Great meal plan with good variety and balance.');
    }
  });

  it('accepts boundary text lengths', () => {
    const min = critiqueInputSchema.safeParse({
      critique: 'a',
    });
    const max = critiqueInputSchema.safeParse({
      critique: 'a'.repeat(2000),
    });

    expect(min.success).toBe(true);
    expect(max.success).toBe(true);
  });

  it('rejects empty and too long critique text', () => {
    const empty = critiqueInputSchema.safeParse({
      critique: '',
    });
    const tooLong = critiqueInputSchema.safeParse({
      critique: 'a'.repeat(2001),
    });

    expect(empty.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });

  it('rejects missing critique and non-string critique', () => {
    const missing = critiqueInputSchema.safeParse({});
    const numeric = critiqueInputSchema.safeParse({ critique: 123 });

    expect(missing.success).toBe(false);
    expect(numeric.success).toBe(false);
  });
});
