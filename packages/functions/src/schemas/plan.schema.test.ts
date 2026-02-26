import { describe, expect, it } from 'vitest';
import {
  createPlanDayExerciseSchema,
  createPlanDaySchema,
  createPlanSchema,
  updatePlanDayExerciseSchema,
  updatePlanDaySchema,
  updatePlanSchema,
} from './plan.schema.js';

describe('plan schemas', () => {
  describe('plan schemas', () => {
    it('accepts plan create payload and defaults for duration', () => {
      const result = createPlanSchema.safeParse({
        name: 'Upper Split',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.duration_weeks).toBe(6);
      }
    });

    it('rejects invalid plan names and durations', () => {
      const missingName = createPlanSchema.safeParse({ duration_weeks: 6 });
      const longName = createPlanSchema.safeParse({
        name: 'a'.repeat(101),
        duration_weeks: 6,
      });
      const invalidDuration = createPlanSchema.safeParse({
        name: 'Upper Split',
        duration_weeks: 0,
      });

      expect(missingName.success).toBe(false);
      expect(longName.success).toBe(false);
      expect(invalidDuration.success).toBe(false);
    });

    it('accepts partial plan updates and empty payload', () => {
      const partial = updatePlanSchema.safeParse({ duration_weeks: 8 });
      const empty = updatePlanSchema.safeParse({});

      expect(partial.success).toBe(true);
      expect(empty.success).toBe(true);
    });
  });

  describe('plan day schemas', () => {
    it('accepts valid plan day payload', () => {
      const result = createPlanDaySchema.safeParse({
        plan_id: 'plan-1',
        day_of_week: 3,
        name: 'Leg Day',
        sort_order: 1,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid day of week and sort order', () => {
      const invalidDay = createPlanDaySchema.safeParse({
        plan_id: 'plan-1',
        day_of_week: 7,
        name: 'Leg Day',
        sort_order: 1,
      });
      const negativeSortOrder = createPlanDaySchema.safeParse({
        plan_id: 'plan-1',
        day_of_week: 0,
        name: 'Leg Day',
        sort_order: -1,
      });

      expect(invalidDay.success).toBe(false);
      expect(negativeSortOrder.success).toBe(false);
    });

    it('accepts partial plan day updates', () => {
      const partial = updatePlanDaySchema.safeParse({
        name: 'Push Day',
      });
      const empty = updatePlanDaySchema.safeParse({});

      expect(partial.success).toBe(true);
      expect(empty.success).toBe(true);
    });

    it('rejects invalid partial plan day updates', () => {
      const invalidName = updatePlanDaySchema.safeParse({ name: '' });
      const negativeSortOrder = updatePlanDaySchema.safeParse({ sort_order: -1 });

      expect(invalidName.success).toBe(false);
      expect(negativeSortOrder.success).toBe(false);
    });
  });

  describe('plan day exercise schemas', () => {
    it('accepts valid plan day exercise payload', () => {
      const result = createPlanDayExerciseSchema.safeParse({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sets: 4,
        reps: 8,
        weight: 150,
        rest_seconds: 120,
        sort_order: 2,
        min_reps: 6,
        max_reps: 10,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid required fields and non-positive values', () => {
      const missingPlanDay = createPlanDayExerciseSchema.safeParse({
        exercise_id: 'exercise-1',
        sets: 4,
        reps: 8,
        weight: 150,
        rest_seconds: 120,
        sort_order: 2,
        min_reps: 6,
        max_reps: 10,
      });
      const negativeReps = createPlanDayExerciseSchema.safeParse({
        plan_day_id: 'plan-day-1',
        exercise_id: 'exercise-1',
        sets: 4,
        reps: -1,
        weight: 150,
        rest_seconds: 120,
        sort_order: 2,
        min_reps: 6,
        max_reps: 10,
      });

      expect(missingPlanDay.success).toBe(false);
      expect(negativeReps.success).toBe(false);
    });

    it('accepts partial plan day exercise updates', () => {
      const result = updatePlanDayExerciseSchema.safeParse({
        sets: 5,
        min_reps: 7,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid partial plan day exercise updates', () => {
      const invalidSets = updatePlanDayExerciseSchema.safeParse({
        sets: 0,
      });
      const invalidReps = updatePlanDayExerciseSchema.safeParse({
        reps: 0.5,
      });

      expect(invalidSets.success).toBe(false);
      expect(invalidReps.success).toBe(false);
    });
  });
});
