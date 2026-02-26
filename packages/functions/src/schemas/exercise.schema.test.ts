import { describe, expect, it } from 'vitest';
import { createExerciseSchema, updateExerciseSchema } from './exercise.schema.js';

describe('exercise schema', () => {
  it('accepts valid create payload with defaults', () => {
    const result = createExerciseSchema.safeParse({ name: 'Bench Press' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Bench Press');
      expect(result.data.weight_increment).toBe(5);
      expect(result.data.is_custom).toBe(true);
    }
  });

  it('rejects create payload missing or invalid name', () => {
    const missingName = createExerciseSchema.safeParse({ weight_increment: 5, is_custom: true });
    const emptyName = createExerciseSchema.safeParse({
      name: '',
      weight_increment: 5,
      is_custom: true,
    });
    const longName = createExerciseSchema.safeParse({
      name: 'a'.repeat(101),
      weight_increment: 5,
      is_custom: true,
    });

    expect(missingName.success).toBe(false);
    expect(emptyName.success).toBe(false);
    expect(longName.success).toBe(false);
  });

  it('rejects non-positive weight increment in create schema', () => {
    const result = createExerciseSchema.safeParse({ name: 'Squat', weight_increment: 0 });
    const negativeResult = createExerciseSchema.safeParse({ name: 'Squat', weight_increment: -2.5 });

    expect(result.success).toBe(false);
    expect(negativeResult.success).toBe(false);
  });

  it('accepts partial updates for exercise', () => {
    const nameOnly = updateExerciseSchema.safeParse({ name: 'Deadlift' });
    const weightOnly = updateExerciseSchema.safeParse({ weight_increment: 2.5 });
    const emptyPayload = updateExerciseSchema.safeParse({});

    expect(nameOnly.success).toBe(true);
    expect(weightOnly.success).toBe(true);
    expect(emptyPayload.success).toBe(true);
  });

  it('rejects invalid partial updates for exercise', () => {
    const invalidName = updateExerciseSchema.safeParse({ name: '' });
    const longName = updateExerciseSchema.safeParse({ name: 'a'.repeat(101) });
    const invalidWeight = updateExerciseSchema.safeParse({ weight_increment: 0 });

    expect(invalidName.success).toBe(false);
    expect(longName.success).toBe(false);
    expect(invalidWeight.success).toBe(false);
  });
});
