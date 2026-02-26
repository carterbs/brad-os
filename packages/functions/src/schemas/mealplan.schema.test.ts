import { describe, it, expect } from 'vitest';
import { critiqueResponseSchema } from './mealplan.schema.js';

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

