import { describe, expect, it } from 'vitest';
import {
  addedExerciseSchema,
  modifiedExerciseSchema,
  planDiffSchema,
  planUpdateResponseSchema,
  updateWorkoutSetTargetsSchema,
} from './plan-modification.schema.js';

describe('plan modification schemas', () => {
  const planDayExercise = {
    id: 'pde-1',
    plan_day_id: 'pd-1',
    exercise_id: 'ex-1',
    sets: 3,
    reps: 10,
    weight: 135,
    rest_seconds: 90,
    sort_order: 0,
    min_reps: 8,
    max_reps: 12,
  };

  it('accepts a valid plan diff payload', () => {
    const payload = {
      addedExercises: [
        {
          planDayId: 'pd-1',
          exerciseId: 'ex-1',
          planDayExercise,
        },
      ],
      removedExercises: [],
      modifiedExercises: [
        {
          planDayId: 'pd-1',
          exerciseId: 'ex-1',
          planDayExerciseId: 'pde-1',
          changes: {
            sets: 4,
            rest_seconds: 120,
          },
        },
      ],
      addedDays: [],
      removedDays: [],
    };

    const result = planDiffSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addedExercises).toHaveLength(1);
      expect(result.data.removedExercises).toHaveLength(0);
    }
  });

  it('rejects added exercise without plan day exercise', () => {
    const result = addedExerciseSchema.safeParse({
      planDayId: 'pd-1',
      exerciseId: 'ex-1',
      planDayExercise: {
        ...planDayExercise,
        weight: '135',
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts optional plan changes', () => {
    const result = modifiedExerciseSchema.safeParse({
      planDayId: 'pd-1',
      exerciseId: 'ex-1',
      planDayExerciseId: 'pde-1',
      changes: {
        sets: 4,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.changes).toHaveProperty('sets', 4);
    }
  });

  it('accepts valid plan update response payload', () => {
    const result = planUpdateResponseSchema.safeParse({
      success: true,
      data: {
        planId: 'plan-1',
        affectedWorkouts: 2,
        warnings: ['none'],
        hasActiveMesocycle: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid workout update DTO', () => {
    const result = updateWorkoutSetTargetsSchema.safeParse({
      targetReps: -1,
      targetWeight: '135',
    });

    expect(result.success).toBe(false);
  });
});
