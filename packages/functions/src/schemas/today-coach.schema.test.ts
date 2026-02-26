import { describe, it, expect } from 'vitest';
import { todayCoachResponseSchema } from './today-coach.schema.js';

describe('todayCoachResponseSchema', () => {
  it('accepts a fully populated valid payload', () => {
    const payload = {
      dailyBriefing: 'You are ready for a balanced recovery day.',
      sections: {
        recovery: {
          insight: 'Recovery is improving.',
          status: 'good',
        },
        lifting: {
          insight: 'Leg work scheduled later today.',
          workout: {
            planDayName: 'Leg Day',
            weekNumber: 4,
            isDeload: false,
            exerciseCount: 6,
            status: 'pending',
          },
          priority: 'high',
        },
        cycling: {
          insight: 'Keep today light.',
          session: {
            type: 'recovery',
            durationMinutes: 20,
            pelotonClassTypes: ['Recovery Ride'],
            pelotonTip: 'Start with a 20-min Recovery Ride.',
            targetTSS: { min: 20, max: 30 },
            targetZones: 'Zone 1-2 recovery',
          },
          priority: 'skip',
        },
        stretching: {
          insight: 'Spend extra time on lower body.',
          suggestedRegions: ['hamstrings', 'quads'],
          priority: 'high',
        },
        meditation: {
          insight: 'A short breath reset can help.',
          suggestedDurationMinutes: 10,
          priority: 'normal',
        },
        weight: {
          insight: 'Weight trend is stable.',
        },
      },
      warnings: [{ type: 'under_fueling', message: 'Fuel around workouts.' }],
    };

    expect(todayCoachResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts nullable sections for lifting and cycling', () => {
    const payload = {
      dailyBriefing: 'Nothing required today.',
      sections: {
        recovery: {
          insight: 'Recovery is solid.',
          status: 'great',
        },
        lifting: null,
        cycling: null,
        stretching: {
          insight: 'Stretching is optional.',
          suggestedRegions: ['back'],
          priority: 'low',
        },
        meditation: {
          insight: 'Keep breathing work calm.',
          suggestedDurationMinutes: 5,
          priority: 'low',
        },
        weight: null,
      },
      warnings: [],
    };

    expect(todayCoachResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects invalid recovery status enum', () => {
    const payload = {
      dailyBriefing: 'Invalid status payload.',
      sections: {
        recovery: {
          insight: 'Recovery is unknown.',
          status: 'excellent',
        },
        lifting: null,
        cycling: null,
        stretching: {
          insight: 'Stretch.',
          suggestedRegions: ['back'],
          priority: 'normal',
        },
        meditation: {
          insight: 'Calm.',
          suggestedDurationMinutes: 10,
          priority: 'normal',
        },
        weight: null,
      },
      warnings: [],
    };

    expect(todayCoachResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects missing nested required fields', () => {
    const payload = {
      dailyBriefing: 'Missing session fields.',
      sections: {
        recovery: {
          insight: 'Recovery is mixed.',
          status: 'caution',
        },
        lifting: {
          insight: 'Need workout details.',
          priority: 'normal',
        },
        cycling: null,
        stretching: {
          insight: 'Stretch.',
          suggestedRegions: ['back'],
          priority: 'low',
        },
        meditation: {
          insight: 'Meditate.',
          suggestedDurationMinutes: 5,
          priority: 'normal',
        },
        weight: null,
      },
      warnings: [],
    };

    expect(todayCoachResponseSchema.safeParse(payload).success).toBe(false);
  });
});

