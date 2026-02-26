import { describe, it, expect } from 'vitest';
import { cyclingCoachResponseSchema, generateScheduleResponseSchema } from './cycling.schema.js';

describe('cyclingCoachResponseSchema', () => {
  it('accepts a valid coaching response', () => {
    const payload = {
      session: {
        type: 'threshold',
        durationMinutes: 45,
        pelotonClassTypes: ['Power Zone', 'Sweat Steady'],
        pelotonTip: 'Choose a 45-min steady effort class.',
        targetTSS: { min: 45, max: 65 },
        targetZones: 'Zone 4 with short easy recoveries',
      },
      reasoning: 'Good balance after recovery check.',
      coachingTips: ['Fuel before class', 'Stay hydrated'],
      warnings: [{ type: 'fatigue', message: 'Watch your form today.' }],
      suggestFTPTest: true,
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects invalid session type', () => {
    const payload = {
      session: {
        type: 'cruising',
        durationMinutes: 30,
        pelotonClassTypes: ['Music'],
        pelotonTip: 'Take it easy.',
        targetTSS: { min: 20, max: 30 },
        targetZones: 'Zone 1',
      },
      reasoning: 'Invalid type',
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects coaching tips not as string array', () => {
    const payload = {
      session: {
        type: 'vo2max',
        durationMinutes: 30,
        pelotonClassTypes: ['Power Zone Max'],
        pelotonTip: 'Push hard',
        targetTSS: { min: 30, max: 50 },
        targetZones: 'Zone 5',
      },
      reasoning: 'Test',
      coachingTips: 'this should be an array',
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe('generateScheduleResponseSchema', () => {
  it('accepts a valid generated schedule response', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'vo2max',
          pelotonClassTypes: ['Power Zone Max'],
          suggestedDurationMinutes: 30,
          description: 'Hard day',
        },
        {
          order: 2,
          sessionType: 'recovery',
          pelotonClassTypes: ['Recovery Ride'],
          suggestedDurationMinutes: 20,
          description: 'Easy day',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 3.5,
        phases: [{ name: 'Build', weeks: '1-2', description: 'Increase volume.' }],
      },
      rationale: 'Balanced workload.',
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects schedule responses with invalid sessionType', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'off',
          pelotonClassTypes: ['Rest'],
          suggestedDurationMinutes: 0,
          description: 'Rest day',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 0,
        phases: [],
      },
      rationale: 'Off not valid for schedule.',
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects generated schedule responses missing rationale', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'fun',
          pelotonClassTypes: ['Music'],
          suggestedDurationMinutes: 30,
          description: 'Fun ride',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 0.5,
        phases: [],
      },
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(false);
  });
});

