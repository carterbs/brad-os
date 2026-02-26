import { describe, expect, it } from 'vitest';
import {
  createWorkoutSchema,
  createWorkoutSetSchema,
  logWorkoutSetSchema,
  updateWorkoutSchema,
  updateWorkoutSetSchema,
} from './workout.schema.js';

describe('workout schemas', () => {
  const validDate = '2026-02-25';
  const validDateTime = '2026-02-25T12:34:56.789Z';

  describe('createWorkoutSchema', () => {
    it('accepts a valid payload with required fields', () => {
      const result = createWorkoutSchema.safeParse({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 2,
        scheduled_date: validDate,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid scheduled date format and non-positive week numbers', () => {
      const invalidDate = createWorkoutSchema.safeParse({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 2,
        scheduled_date: '02/25/2026',
      });
      const invalidWeek = createWorkoutSchema.safeParse({
        mesocycle_id: 'meso-1',
        plan_day_id: 'plan-day-1',
        week_number: 0,
        scheduled_date: validDate,
      });

      expect(invalidDate.success).toBe(false);
      expect(invalidWeek.success).toBe(false);
    });
  });

  describe('updateWorkoutSchema', () => {
    it('accepts partial updates and nullable timestamps', () => {
      const result = updateWorkoutSchema.safeParse({
        status: 'completed',
        started_at: null,
        completed_at: validDateTime,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid status and malformed timestamps', () => {
      const invalidStatus = updateWorkoutSchema.safeParse({
        status: 'bad-status',
      });
      const invalidStartedAt = updateWorkoutSchema.safeParse({
        started_at: '2026-02-25 12:34:56',
      });

      expect(invalidStatus.success).toBe(false);
      expect(invalidStartedAt.success).toBe(false);
    });
  });

  describe('createWorkoutSetSchema', () => {
    it('accepts a valid workout set payload', () => {
      const result = createWorkoutSetSchema.safeParse({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 8,
        target_weight: 135.5,
      });

      expect(result.success).toBe(true);
    });

    it('rejects nonpositive set/reps and negative target weight', () => {
      const invalidSetNumber = createWorkoutSetSchema.safeParse({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 0,
        target_reps: 8,
        target_weight: 135.5,
      });
      const invalidTargetReps = createWorkoutSetSchema.safeParse({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 0,
        target_weight: 135.5,
      });
      const negativeWeight = createWorkoutSetSchema.safeParse({
        workout_id: 'workout-1',
        exercise_id: 'exercise-1',
        set_number: 1,
        target_reps: 8,
        target_weight: -1,
      });

      expect(invalidSetNumber.success).toBe(false);
      expect(invalidTargetReps.success).toBe(false);
      expect(negativeWeight.success).toBe(false);
    });
  });

  describe('updateWorkoutSetSchema', () => {
    it('accepts partial updates with valid status and values', () => {
      const result = updateWorkoutSetSchema.safeParse({
        status: 'completed',
        actual_reps: 8,
        actual_weight: 135.5,
      });

      expect(result.success).toBe(true);
    });

    it('accepts nullable measured values', () => {
      const result = updateWorkoutSetSchema.safeParse({
        actual_reps: null,
        actual_weight: null,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid status and negative updates', () => {
      const invalidStatus = updateWorkoutSetSchema.safeParse({
        status: 'pending-review',
      });
      const invalidActualReps = updateWorkoutSetSchema.safeParse({
        actual_reps: -1,
      });
      const invalidTargets = updateWorkoutSetSchema.safeParse({
        target_reps: 0,
        target_weight: -5,
      });

      expect(invalidStatus.success).toBe(false);
      expect(invalidActualReps.success).toBe(false);
      expect(invalidTargets.success).toBe(false);
    });
  });

  describe('logWorkoutSetSchema', () => {
    it('accepts measured set data', () => {
      const result = logWorkoutSetSchema.safeParse({
        actual_reps: 10,
        actual_weight: 145.25,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative or fractional actual values', () => {
      const negativeReps = logWorkoutSetSchema.safeParse({
        actual_reps: -1,
        actual_weight: 145.25,
      });
      const fractionalReps = logWorkoutSetSchema.safeParse({
        actual_reps: 10.5,
        actual_weight: 145.25,
      });
      const negativeWeight = logWorkoutSetSchema.safeParse({
        actual_reps: 10,
        actual_weight: -1,
      });

      expect(negativeReps.success).toBe(false);
      expect(fractionalReps.success).toBe(false);
      expect(negativeWeight.success).toBe(false);
    });
  });
});
