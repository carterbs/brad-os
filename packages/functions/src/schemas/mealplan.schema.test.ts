import { describe, expect, it } from 'vitest';
import {
  applyOperationsResultSchema,
  conversationMessageSchema,
  critiqueInputSchema,
  critiqueResponseSchema,
  createMealPlanSessionSchema,
  mealPlanEntrySchema,
  mealPlanSessionSchema,
  updateMealPlanSessionSchema,
} from './mealplan.schema.js';

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

describe('meal plan session schemas', () => {
  const samplePlanEntry = {
    day_index: 0,
    meal_type: 'breakfast',
    meal_id: 'meal-breakfast',
    meal_name: 'Overnight oats',
  };

  const sampleMessage = {
    role: 'user',
    content: 'Adjust Tuesday breakfast',
    operations: [
      {
        day_index: 2,
        meal_type: 'breakfast',
        new_meal_id: 'meal-alt',
      },
    ],
  };

  const sampleSession = {
    id: 'session-1',
    plan: [samplePlanEntry],
    meals_snapshot: [
      {
        id: 'meal-breakfast',
        name: 'Overnight oats',
        meal_type: 'breakfast',
        effort: 5,
        has_red_meat: false,
        prep_ahead: true,
        url: 'https://example.com',
        last_planned: null,
        created_at: '2026-02-25T00:00:00.000Z',
        updated_at: '2026-02-25T00:00:00.000Z',
      },
    ],
    history: [sampleMessage],
    is_finalized: false,
    created_at: '2026-02-25T00:00:00.000Z',
    updated_at: '2026-02-25T00:00:00.000Z',
  };

  it('accepts a valid plan entry', () => {
    const result = mealPlanEntrySchema.safeParse(samplePlanEntry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meal_type).toBe('breakfast');
      expect(result.data.meal_name).toBe('Overnight oats');
    }
  });

  it('accepts a valid conversation message with operations', () => {
    const result = conversationMessageSchema.safeParse(sampleMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('user');
      expect(result.data.operations?.[0]?.new_meal_id).toBe('meal-alt');
    }
  });

  it('accepts a full meal plan session payload', () => {
    const result = mealPlanSessionSchema.safeParse(sampleSession);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toHaveLength(1);
      expect(result.data.history).toHaveLength(1);
    }
  });

  it('rejects malformed meal session operations payload', () => {
    const result = mealPlanSessionSchema.safeParse({
      ...sampleSession,
      meals_snapshot: [],
      history: [
        {
          role: 'coach',
          content: 'Bad role',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts create and update DTO schemas', () => {
    const createResult = createMealPlanSessionSchema.safeParse({
      plan: [samplePlanEntry],
      meals_snapshot: sampleSession.meals_snapshot,
      history: [sampleMessage],
      is_finalized: false,
    });
    const updateResult = updateMealPlanSessionSchema.safeParse({
      is_finalized: true,
      history: [sampleMessage],
    });

    expect(createResult.success).toBe(true);
    expect(updateResult.success).toBe(true);
  });

  it('accepts apply operations result payload', () => {
    const result = applyOperationsResultSchema.safeParse({
      updatedPlan: [samplePlanEntry],
      errors: ['none'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(1);
    }
  });
});
