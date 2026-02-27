import { describe, it, expect } from 'vitest';
<<<<<<< Updated upstream
import {
  todayCoachRequestSchema,
  todayCoachResponseSchema,
} from './today-coach.schema.js';
=======
import { todayCoachResponseSchema } from './today-coach.schema.js';
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
describe('todayCoachRequestSchema', () => {
  const baseRequest = {
    recovery: {
      date: '2026-02-25',
      hrvMs: 62,
      hrvVsBaseline: 2,
      rhrBpm: 45,
      rhrVsBaseline: 1,
      sleepHours: 7,
      sleepEfficiency: 83,
      deepSleepPercent: 22,
      score: 78,
      state: 'ready',
    },
    recoveryHistory: [
      {
        date: '2026-02-24',
        score: 76,
        state: 'moderate',
        hrvMs: 58,
        rhrBpm: 46,
        sleepHours: 6.5,
      },
    ],
    todaysWorkout: {
      planDayName: 'Leg Day',
      weekNumber: 3,
      isDeload: false,
      exerciseCount: 6,
      status: 'pending',
      completedAt: null,
    },
    liftingHistory: [],
    liftingSchedule: {
      today: { planned: true, workoutName: 'Leg Day', isLowerBody: true },
      tomorrow: { planned: false },
      yesterday: { completed: true, workoutName: 'Push Day' },
    },
    mesocycleContext: {
      currentWeek: 3,
      isDeloadWeek: false,
      planName: 'Strength Block',
    },
    cyclingContext: {
      ftp: 255,
      trainingLoad: { atl: 45, ctl: 52, tsb: 7 },
      weekInBlock: 3,
      totalWeeks: 8,
      nextSession: {
        type: 'tempo',
        description: 'Tempo intervals',
      },
      recentActivities: [],
      vo2max: {
        current: 51.2,
        date: '2026-02-20',
        method: 'ftp_derived',
        history: [{ date: '2026-02-20', value: 51.2 }],
      },
      efTrend: {
        recent4WeekAvg: 1.15,
        previous4WeekAvg: 1.1,
        trend: 'improving',
      },
      ftpStaleDays: 14,
      lastRideStreams: {
        avgPower: 192,
        maxPower: 420,
        normalizedPower: 205,
        peak5MinPower: 340,
        peak20MinPower: null,
        avgHR: 140,
        maxHR: 168,
        hrCompleteness: 91,
        avgCadence: 90,
        sampleCount: 3600,
        durationSeconds: 3600,
        powerZoneDistribution: { z1: 12, z2: 64, z3: 24 },
      },
    },
    stretchingContext: {
      lastSessionDate: '2026-02-20',
      daysSinceLastSession: 2,
      sessionsThisWeek: 1,
      lastRegions: ['quads', 'hamstrings'],
    },
    meditationContext: {
      lastSessionDate: null,
      daysSinceLastSession: null,
      sessionsThisWeek: 0,
      totalMinutesThisWeek: 0,
      currentStreak: 0,
    },
    weightMetrics: {
      currentLbs: 178.5,
      trend7DayLbs: -1.2,
      trend30DayLbs: 0.8,
      goal: {
        userId: 'user-1',
        targetWeightLbs: 170,
        targetDate: '2026-03-15',
        startWeightLbs: 182,
        startDate: '2026-01-01',
      },
    },
    healthTrends: {
      hrv7DayAvgMs: 50,
      hrv30DayAvgMs: 47,
      hrvTrend: 'rising',
      rhr7DayAvgBpm: 48,
      rhr30DayAvgBpm: 50,
      rhrTrend: 'declining',
    },
    timezone: 'UTC',
    currentDate: '2026-02-25',
    timeContext: {
      timeOfDay: 'morning',
      currentHour: 9,
    },
    completedActivities: {
      hasLiftedToday: true,
      liftedAt: '2026-02-25T09:00:00.000Z',
      hasCycledToday: false,
      cycledAt: null,
      hasStretchedToday: true,
      stretchedAt: '2026-02-25T11:00:00.000Z',
      hasMeditatedToday: false,
      meditatedAt: null,
    },
  };

  it('accepts a fully valid request payload', () => {
    const result = todayCoachRequestSchema.safeParse(baseRequest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recovery.state).toBe('ready');
      expect(result.data.timeContext.currentHour).toBe(9);
    }
  });

  it('accepts request payload with nullable nested fields', () => {
    const payload = {
      ...baseRequest,
      todaysWorkout: null,
      cyclingContext: null,
      mesocycleContext: null,
      meditationContext: {
        ...baseRequest.meditationContext,
        lastSessionDate: null,
      },
      weightMetrics: null,
      healthTrends: null,
    };

    const result = todayCoachRequestSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mesocycleContext).toBeNull();
      expect(result.data.weightMetrics).toBeNull();
    }
  });

  it('rejects invalid request timeOfDay value', () => {
    const result = todayCoachRequestSchema.safeParse({
      ...baseRequest,
      timeContext: {
        timeOfDay: 'sunset',
        currentHour: 9,
      },
    });

    expect(result.success).toBe(false);
  });
});
=======
>>>>>>> Stashed changes
