import { describe, expect, it } from 'vitest';
import { createMeditationSessionSchema } from './meditation.schema.js';

describe('meditation.schema', () => {
  const validPayload = {
    completedAt: '2026-02-25T12:34:56.789Z',
    sessionType: 'guided-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 540,
    completedFully: false,
  };

  it('accepts a valid meditation session payload', () => {
    const result = createMeditationSessionSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts boundary values for durations', () => {
    const minResult = createMeditationSessionSchema.safeParse({
      ...validPayload,
      plannedDurationSeconds: 1,
      actualDurationSeconds: 0,
      completedFully: true,
    });

    expect(minResult.success).toBe(true);
  });

  it('rejects invalid datetime, empty sessionType, and negative durations', () => {
    const result = createMeditationSessionSchema.safeParse({
      ...validPayload,
      completedAt: '2026-02-25 12:34:56',
      sessionType: '',
      plannedDurationSeconds: -10,
      actualDurationSeconds: -1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-integer durations', () => {
    const result = createMeditationSessionSchema.safeParse({
      ...validPayload,
      plannedDurationSeconds: 600.5,
      actualDurationSeconds: 400.1,
    });

    expect(result.success).toBe(false);
  });
});
