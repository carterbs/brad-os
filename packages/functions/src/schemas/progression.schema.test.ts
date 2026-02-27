import { describe, expect, it } from 'vitest';
import {
  dynamicProgressionResultSchema,
  exerciseProgressionSchema,
  nextWeekResponseSchema,
  progressionReasonSchema,
  weekTargetsSchema,
} from './progression.schema.js';

describe('progressionReasonSchema', () => {
  it('accepts supported reasons', () => {
    const valid = progressionReasonSchema.safeParse('hit_target');
    const invalid = progressionReasonSchema.safeParse('boost');

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('exerciseProgressionSchema', () => {
  const validPayload = {
    exerciseId: 'exercise-1',
    planExerciseId: 'plan-ex-1',
    baseWeight: 135,
    baseReps: 8,
    baseSets: 3,
    weightIncrement: 5,
    minReps: 6,
    maxReps: 12,
  };

  it('accepts a valid progression configuration', () => {
    const result = exerciseProgressionSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseWeight).toBe(135);
      expect(result.data.weightIncrement).toBe(5);
    }
  });

  it('rejects missing required progression fields', () => {
    const payload = {
      ...validPayload,
    };
    delete (payload as { planExerciseId?: string }).planExerciseId;

    const result = exerciseProgressionSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('dynamic progression and weekly result schemas', () => {
  const validResult = {
    targetWeight: 145,
    targetReps: 9,
    targetSets: 3,
    isDeload: false,
    reason: 'hold',
  };

  it('accepts a valid dynamic progression result', () => {
    const result = dynamicProgressionResultSchema.safeParse(validResult);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('hold');
    }
  });

  it('rejects invalid reason for dynamic result', () => {
    const result = dynamicProgressionResultSchema.safeParse({
      ...validResult,
      reason: 'skip',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid next-week response payload', () => {
    const result = nextWeekResponseSchema.safeParse({
      mesocycleId: 1,
      weekNumber: 3,
      isDeload: false,
      exercises: [
        {
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          targetWeight: 135,
          targetReps: 10,
          targetSets: 3,
          willProgress: true,
          previousWeekCompleted: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exercises).toHaveLength(1);
    }
  });

  it('rejects unknown fields in week targets', () => {
    const result = weekTargetsSchema.safeParse({
      exerciseId: 'exercise-1',
      planExerciseId: 'plan-ex-1',
      targetWeight: 135,
      targetReps: 10,
      targetSets: 3,
      weekNumber: 3,
      isDeload: false,
      unknownField: true,
    });

    expect(result.success).toBe(false);
  });
});
