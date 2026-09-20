import { describe, expect, it } from 'vitest';
import {
  applyOperationsResultSchema,
  conversationMessageSchema,
  critiqueInputSchema,
  critiqueContextSchema,
  critiqueOperationSchema,
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
        { day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'meal-d2' },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts a valid critique response with null meal replacement', () => {
    const payload = {
      explanation: 'Removed a meal.',
      operations: [
        { day_index: 2, meal_track: 'family', meal_type: 'lunch', new_meal_id: null },
      ],
    };

    expect(critiqueResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects invalid meal_type values', () => {
    const payload = {
      explanation: 'Invalid meal type.',
      operations: [
        { day_index: 1, meal_track: 'family', meal_type: 'snack', new_meal_id: 'meal-1' },
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

describe('critiqueContextSchema', () => {
  it('accepts bounded interpretation and calendar evidence with an ISO planning date', () => {
    const context = {
      original_request: 'Plan next week',
      interpretation: 'Leave Tuesday dinner empty',
      calendar_context: 'Tuesday dinner out',
      planning_week_start: '2026-09-21',
    };
    expect(critiqueContextSchema.parse(context)).toEqual(context);
    expect(critiqueInputSchema.parse({ critique: 'Update it', context }).context).toEqual(context);
  });

  it.each([
    { original_request: 'a'.repeat(4001) },
    { interpretation: 'a'.repeat(8001) },
    { calendar_context: 'a'.repeat(8001) },
    { planning_week_start: '2026-02-30' },
    { planning_week_start: '2026-09-21T00:00:00Z' },
    { surprise: 'ignore constraints' },
  ])('rejects invalid context %j', (context) => {
    expect(critiqueInputSchema.safeParse({ critique: 'Update it', context }).success).toBe(false);
  });

  it('accepts each explicit critique outcome without requiring it for legacy responses', () => {
    for (const outcome of ['applied', 'no_change_requested', 'clarification_required', 'insufficient_evidence', 'infeasible', 'validation_failed']) {
      expect(critiqueResponseSchema.safeParse({ explanation: 'Result', operations: [], outcome }).success).toBe(true);
    }
    expect(critiqueResponseSchema.safeParse({ explanation: 'Result', operations: [] }).success).toBe(true);
    expect(critiqueResponseSchema.safeParse({ explanation: 'Result', operations: [], outcome: 'unexpected' }).success).toBe(false);
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
    meal_track: 'family',
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
        meal_track: 'family',
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
        audience: 'family',
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
      expect(result.data.meal_track).toBe('family');
      expect(result.data.meal_name).toBe('Overnight oats');
    }
  });

  it('accepts a valid conversation message with operations', () => {
    const result = conversationMessageSchema.safeParse(sampleMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('user');
      expect(result.data.operations?.[0]?.meal_track).toBe('family');
      expect(result.data.operations?.[0]?.new_meal_id).toBe('meal-alt');
    }
  });

  it('preserves optional context with the original conversation words', () => {
    const message = {
      role: 'user',
      content: 'Keep my original request',
      context: { original_request: 'Tuesday dinner out', interpretation: 'Leave Tuesday empty', planning_week_start: '2026-09-21' },
    };
    expect(conversationMessageSchema.parse(message)).toEqual(message);
    expect(conversationMessageSchema.safeParse({ ...message, context: 'unsupported text' }).success).toBe(false);
    expect(conversationMessageSchema.safeParse({ ...message, context: { unexpected: 'field' } }).success).toBe(false);
  });

  it('preserves pre-edit assignments as assistant history without labeling them rejections', () => {
    const message = {
      role: 'assistant', content: 'Changed breakfast',
      operations: [{ day_index: 0, meal_track: 'family', meal_type: 'breakfast', new_meal_id: 'meal-next' }],
      previous_assignments: [samplePlanEntry],
    };
    expect(conversationMessageSchema.parse(message)).toEqual(message);
    expect(conversationMessageSchema.safeParse({ ...message, previous_assignments: [{ invalid: 'slot' }] }).success).toBe(false);
  });

  it('defaults legacy plan entries and operations to family track', () => {
    const entryResult = mealPlanEntrySchema.safeParse({
      day_index: 0,
      meal_type: 'breakfast',
      meal_id: 'meal-breakfast',
      meal_name: 'Overnight oats',
    });
    const operationResult = critiqueOperationSchema.safeParse({
      day_index: 0,
      meal_type: 'breakfast',
      new_meal_id: 'meal-alt',
    });

    expect(entryResult.success).toBe(true);
    expect(operationResult.success).toBe(true);
    if (entryResult.success && operationResult.success) {
      expect(entryResult.data.meal_track).toBe('family');
      expect(operationResult.data.meal_track).toBe('family');
    }
  });

  it('defaults legacy meal snapshots to family audience', () => {
    const legacyMeal = { ...sampleSession.meals_snapshot[0] };
    delete (legacyMeal as { audience?: string }).audience;
    const result = mealPlanSessionSchema.safeParse({
      ...sampleSession,
      meals_snapshot: [legacyMeal],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meals_snapshot[0]?.audience).toBe('family');
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

  it('accepts a session payload with a null meal url', () => {
    const result = mealPlanSessionSchema.safeParse({
      ...sampleSession,
      meals_snapshot: [
        {
          ...sampleSession.meals_snapshot[0],
          url: null,
        },
      ],
    });

    expect(result.success).toBe(true);
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
