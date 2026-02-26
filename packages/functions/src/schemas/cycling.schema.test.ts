import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  calculateVO2MaxSchema,
  createCyclingActivitySchema,
  createFTPEntrySchema,
  createTrainingBlockSchema,
  createWeightGoalSchema,
  experienceLevelSchema,
  ftpSourceSchema,
  generateScheduleSchema,
  stravaCallbackSchema,
  stravaWebhookEventSchema,
  stravaWebhookSchema,
  stravaWebhookValidationSchema,
  syncStravaTokensSchema,
  trainingGoalSchema,
  updateCyclingProfileSchema,
  cyclingCoachResponseSchema,
  generateScheduleResponseSchema,
} from './cycling.schema.js';

const buildValidTrainingBlock = (): z.input<typeof createTrainingBlockSchema> => ({
  startDate: '2026-03-01',
  endDate: '2026-03-14',
  goals: ['regain_fitness'],
});

const buildValidScheduleRequest = (): z.input<typeof generateScheduleSchema> => ({
  sessionsPerWeek: 3,
  preferredDays: [1, 3, 5],
  goals: ['regain_fitness'],
  experienceLevel: 'intermediate',
  weeklyHoursAvailable: 10,
});

const buildValidCyclingActivity = (): z.input<typeof createCyclingActivitySchema> => ({
  stravaId: 123456,
  date: '2026-03-01',
  durationMinutes: 45,
  avgPower: 200,
  normalizedPower: 210,
  maxPower: 250,
  avgHeartRate: 140,
  maxHeartRate: 170,
  tss: 42,
  intensityFactor: 0.78,
  type: 'vo2max',
  source: 'strava',
});

const buildValidWebhookEvent = (): z.input<typeof stravaWebhookEventSchema> => ({
  aspect_type: 'create',
  event_time: 1710000000,
  object_id: 9001,
  object_type: 'activity',
  owner_id: 321,
  subscription_id: 77,
});

describe('cycling schemas', () => {
  describe('trainingGoalSchema', () => {
    it('accepts all allowed training goals', () => {
      expect(trainingGoalSchema.safeParse('regain_fitness').success).toBe(true);
      expect(trainingGoalSchema.safeParse('maintain_muscle').success).toBe(true);
      expect(trainingGoalSchema.safeParse('lose_weight').success).toBe(true);
    });

    it('rejects invalid training goals', () => {
      expect(trainingGoalSchema.safeParse('bulk').success).toBe(false);
    });
  });

  describe('experienceLevelSchema', () => {
    it('accepts beginner, intermediate, and advanced', () => {
      expect(experienceLevelSchema.safeParse('beginner').success).toBe(true);
      expect(experienceLevelSchema.safeParse('intermediate').success).toBe(true);
      expect(experienceLevelSchema.safeParse('advanced').success).toBe(true);
    });

    it('rejects invalid experience levels', () => {
      expect(experienceLevelSchema.safeParse('pro').success).toBe(false);
    });
  });

  describe('ftpSourceSchema', () => {
    it('accepts manual and test values', () => {
      expect(ftpSourceSchema.safeParse('manual').success).toBe(true);
      expect(ftpSourceSchema.safeParse('test').success).toBe(true);
    });

    it('rejects invalid source values', () => {
      expect(ftpSourceSchema.safeParse('auto').success).toBe(false);
    });
  });

  describe('createFTPEntrySchema', () => {
    const validPayload = {
      value: 300,
      date: '2026-03-01',
      source: 'manual' as const,
    };

    it('accepts valid payload and boundary values', () => {
      expect(createFTPEntrySchema.safeParse(validPayload).success).toBe(true);
      expect(createFTPEntrySchema.safeParse({ ...validPayload, value: 1 }).success).toBe(true);
      expect(createFTPEntrySchema.safeParse({ ...validPayload, value: 500 }).success).toBe(true);
    });

    it('rejects invalid value boundaries and non-integer values', () => {
      expect(createFTPEntrySchema.safeParse({ ...validPayload, value: 0 }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validPayload, value: 501 }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validPayload, value: 42.5 }).success).toBe(false);
    });

    it('rejects invalid date format and source', () => {
      expect(createFTPEntrySchema.safeParse({ ...validPayload, date: '03/01/2026' }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validPayload, source: 'manual1' as const }).success).toBe(false);
    });
  });

  describe('createTrainingBlockSchema', () => {
    it('accepts minimal valid payload', () => {
      expect(createTrainingBlockSchema.safeParse(buildValidTrainingBlock()).success).toBe(true);
    });

    it('accepts full payload with weekly sessions and preferred days', () => {
      const payload: z.input<typeof createTrainingBlockSchema> = {
        ...buildValidTrainingBlock(),
        daysPerWeek: 3,
        weeklySessions: [
          {
            order: 1,
            sessionType: 'VO2max',
            pelotonClassTypes: ['interval'],
            suggestedDurationMinutes: 45,
            description: 'Tuesday intervals',
            preferredDay: 1,
          },
        ],
        preferredDays: [0, 2, 4],
        experienceLevel: 'advanced',
        weeklyHoursAvailable: 12,
      };

      expect(createTrainingBlockSchema.safeParse(payload).success).toBe(true);
    });

    it('rejects goals outside 1..3 range', () => {
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), goals: [] }).success).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...buildValidTrainingBlock(),
          goals: ['regain_fitness', 'maintain_muscle', 'lose_weight', 'regain_fitness'],
        }).success
      ).toBe(false);
    });

    it('rejects daysPerWeek outside accepted bounds', () => {
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), daysPerWeek: 1 }).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), daysPerWeek: 6 }).success).toBe(false);
    });

    it('rejects non-integer daysPerWeek', () => {
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), daysPerWeek: 3.5 }).success).toBe(false);
    });

    it('rejects invalid preferredDays entries', () => {
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), preferredDays: [-1] }).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), preferredDays: [7] }).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), preferredDays: [1.5] }).success).toBe(false);
    });

    it('rejects invalid weekly session entries', () => {
      const base = {
        ...buildValidTrainingBlock(),
        weeklySessions: [
          {
            order: 0,
            sessionType: 'VO2max',
            pelotonClassTypes: ['interval'],
            suggestedDurationMinutes: 45,
            description: 'Tuesday intervals',
            preferredDay: 1,
          },
        ],
      };
      const emptySessionType = {
        ...buildValidTrainingBlock(),
        weeklySessions: [
          {
            order: 1,
            sessionType: '',
            pelotonClassTypes: ['interval'],
            suggestedDurationMinutes: 45,
            description: 'Tuesday intervals',
            preferredDay: 1,
          },
        ],
      };
      const nonPositiveDuration = {
        ...buildValidTrainingBlock(),
        weeklySessions: [
          {
            order: 1,
            sessionType: 'VO2max',
            pelotonClassTypes: ['interval'],
            suggestedDurationMinutes: 0,
            description: 'Tuesday intervals',
            preferredDay: 1,
          },
        ],
      };
      const invalidPreferredDay = {
        ...buildValidTrainingBlock(),
        weeklySessions: [
          {
            order: 1,
            sessionType: 'VO2max',
            pelotonClassTypes: ['interval'],
            suggestedDurationMinutes: 45,
            description: 'Tuesday intervals',
            preferredDay: 8,
          },
        ],
      };

      expect(createTrainingBlockSchema.safeParse(base).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse(emptySessionType).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse(nonPositiveDuration).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse(invalidPreferredDay).success).toBe(false);
    });

    it('rejects weeklyHoursAvailable outside 1..20', () => {
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), weeklyHoursAvailable: 0 }).success).toBe(false);
      expect(createTrainingBlockSchema.safeParse({ ...buildValidTrainingBlock(), weeklyHoursAvailable: 21 }).success).toBe(false);
    });
  });

  describe('generateScheduleSchema', () => {
    it('accepts valid required payload', () => {
      expect(generateScheduleSchema.safeParse(buildValidScheduleRequest()).success).toBe(true);
    });

    it('accepts payload with optional ftp', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), ftp: 240 }).success).toBe(true);
    });

    it('rejects sessionsPerWeek outside 2..5', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), sessionsPerWeek: 1 }).success).toBe(false);
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), sessionsPerWeek: 6 }).success).toBe(false);
    });

    it('rejects invalid preferredDays values', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), preferredDays: [1, 7] }).success).toBe(false);
    });

    it('rejects goals outside 1..3', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), goals: [] }).success).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...buildValidScheduleRequest(),
          goals: ['regain_fitness', 'maintain_muscle', 'lose_weight', 'lose_weight'],
        }).success
      ).toBe(false);
    });

    it('rejects invalid experienceLevel', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), experienceLevel: 'champion' as const }).success).toBe(false);
    });

    it('rejects weeklyHoursAvailable outside bounds', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), weeklyHoursAvailable: 0 }).success).toBe(false);
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), weeklyHoursAvailable: 21 }).success).toBe(false);
    });

    it('rejects ftp outside positive to 500 bounds', () => {
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), ftp: 0 }).success).toBe(false);
      expect(generateScheduleSchema.safeParse({ ...buildValidScheduleRequest(), ftp: 501 }).success).toBe(false);
    });
  });

  describe('createWeightGoalSchema', () => {
    const validPayload = {
      targetWeightLbs: 175,
      targetDate: '2026-06-01',
      startWeightLbs: 190,
      startDate: '2026-01-01',
    };

    it('accepts valid payload with realistic numeric values', () => {
      expect(createWeightGoalSchema.safeParse(validPayload).success).toBe(true);
      expect(createWeightGoalSchema.safeParse({
        targetWeightLbs: 175.7,
        targetDate: '2026-06-01',
        startWeightLbs: 190.3,
        startDate: '2026-01-01',
      }).success).toBe(true);
    });

    it('rejects non-positive or excessive weight values', () => {
      expect(createWeightGoalSchema.safeParse({ ...validPayload, targetWeightLbs: 0 }).success).toBe(false);
      expect(createWeightGoalSchema.safeParse({ ...validPayload, targetWeightLbs: 501 }).success).toBe(false);
      expect(createWeightGoalSchema.safeParse({ ...validPayload, startWeightLbs: 0 }).success).toBe(false);
      expect(createWeightGoalSchema.safeParse({ ...validPayload, startWeightLbs: 501 }).success).toBe(false);
    });

    it('rejects invalid date formats', () => {
      expect(createWeightGoalSchema.safeParse({ ...validPayload, targetDate: '06/01/2026' }).success).toBe(false);
      expect(createWeightGoalSchema.safeParse({ ...validPayload, startDate: '2026/01/01' }).success).toBe(false);
    });
  });

  describe('stravaCallbackSchema', () => {
    const validPayload = {
      code: 'auth-code',
      state: 'some-state',
      scope: 'read,activity:read',
    };

    it('accepts required code and optional fields', () => {
      expect(stravaCallbackSchema.safeParse({ code: 'auth-code' }).success).toBe(true);
      expect(stravaCallbackSchema.safeParse(validPayload).success).toBe(true);
    });

    it('rejects empty code', () => {
      expect(stravaCallbackSchema.safeParse({ code: '' }).success).toBe(false);
    });
  });

  describe('syncStravaTokensSchema', () => {
    const validPayload = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1700000000,
      athleteId: 123,
    };

    it('accepts valid payload', () => {
      expect(syncStravaTokensSchema.safeParse(validPayload).success).toBe(true);
    });

    it('rejects empty token strings', () => {
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, accessToken: '' }).success).toBe(false);
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, refreshToken: '' }).success).toBe(false);
    });

    it('rejects non-positive and non-integer expiresAt and athleteId', () => {
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, expiresAt: 0 }).success).toBe(false);
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, athleteId: 0 }).success).toBe(false);
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, expiresAt: 1.5 }).success).toBe(false);
      expect(syncStravaTokensSchema.safeParse({ ...validPayload, athleteId: 1.5 }).success).toBe(false);
    });
  });

  describe('stravaWebhookValidationSchema', () => {
    const validPayload = {
      'hub.mode': 'subscribe',
      'hub.challenge': 'abc123',
      'hub.verify_token': 'token',
    };

    it('accepts exact subscribe payload', () => {
      expect(stravaWebhookValidationSchema.safeParse(validPayload).success).toBe(true);
    });

    it('rejects wrong modes and missing fields', () => {
      expect(
        stravaWebhookValidationSchema.safeParse({
          'hub.mode': 'unsubscribe',
          'hub.challenge': 'abc123',
          'hub.verify_token': 'token',
        }).success
      ).toBe(false);
      expect(stravaWebhookValidationSchema.safeParse({ 'hub.challenge': 'abc123', 'hub.verify_token': 'token' }).success).toBe(false);
    });
  });

  describe('stravaWebhookEventSchema', () => {
    it('accepts all valid aspect_type enum values', () => {
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), aspect_type: 'create' }).success).toBe(true);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), aspect_type: 'update' }).success).toBe(true);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), aspect_type: 'delete' }).success).toBe(true);
    });

    it('accepts optional updates object', () => {
      expect(
        stravaWebhookEventSchema.safeParse({
          ...buildValidWebhookEvent(),
          updates: { title: 'Test', title_slug: 'test' },
        }).success
      ).toBe(true);
    });

    it('rejects invalid enums and non-positive IDs/timestamps', () => {
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), aspect_type: 'invalid' as const }).success).toBe(false);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), object_type: 'bike' as const }).success).toBe(false);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), event_time: 0 }).success).toBe(false);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), object_id: 0 }).success).toBe(false);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), owner_id: -1 }).success).toBe(false);
      expect(stravaWebhookEventSchema.safeParse({ ...buildValidWebhookEvent(), subscription_id: 0 }).success).toBe(false);
    });
  });

  describe('stravaWebhookSchema', () => {
    it('accepts validation payload branch', () => {
      expect(
        stravaWebhookSchema.safeParse({
          'hub.mode': 'subscribe',
          'hub.challenge': 'abc123',
          'hub.verify_token': 'token',
        }).success
      ).toBe(true);
    });

    it('accepts event payload branch', () => {
      expect(stravaWebhookSchema.safeParse(buildValidWebhookEvent()).success).toBe(true);
    });

    it('rejects payloads that match neither branch', () => {
      expect(stravaWebhookSchema.safeParse({ foo: 'bar' }).success).toBe(false);
    });
  });

  describe('calculateVO2MaxSchema', () => {
    it('accepts weight above 0 and up to 300', () => {
      expect(calculateVO2MaxSchema.safeParse({ weightKg: 70 }).success).toBe(true);
      expect(calculateVO2MaxSchema.safeParse({ weightKg: 300 }).success).toBe(true);
    });

    it('rejects zero and overweight values', () => {
      expect(calculateVO2MaxSchema.safeParse({ weightKg: 0 }).success).toBe(false);
      expect(calculateVO2MaxSchema.safeParse({ weightKg: 301 }).success).toBe(false);
    });
  });

  describe('updateCyclingProfileSchema', () => {
    const validPayload = {
      weightKg: 75,
      maxHR: 180,
      restingHR: 55,
    };

    it('accepts required weight and optional heart rates', () => {
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75 }).success).toBe(true);
      expect(updateCyclingProfileSchema.safeParse(validPayload).success).toBe(true);
    });

    it('rejects out-of-range, non-integer, and non-positive heart rate values', () => {
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, maxHR: 0 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, maxHR: 251 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, maxHR: 180.5 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, restingHR: 0 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, restingHR: 151 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, restingHR: 55.5 }).success).toBe(false);
    });
  });

  describe('createCyclingActivitySchema', () => {
    it('accepts valid minimal payload', () => {
      expect(createCyclingActivitySchema.safeParse(buildValidCyclingActivity()).success).toBe(true);
    });

    it('accepts optional fields', () => {
      expect(
        createCyclingActivitySchema.safeParse({
          ...buildValidCyclingActivity(),
          ef: 0.5,
          peak5MinPower: 210,
          peak20MinPower: 190,
          hrCompleteness: 88,
          userId: 'user-123',
          createdAt: '2026-03-01T07:00:00.000Z',
        }).success
      ).toBe(true);
    });

    it('rejects invalid enum values', () => {
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), type: 'invalid' as const }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), source: 'fitbit' as const }).success).toBe(false);
    });

    it('rejects negative metrics where minimum is zero', () => {
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), avgPower: -1 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), normalizedPower: -1 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), maxPower: -1 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), tss: -1 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), hrCompleteness: -1 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), hrCompleteness: 101 }).success).toBe(false);
    });

    it('rejects non-positive optional power and efficiency fields', () => {
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), ef: 0 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), peak5MinPower: 0 }).success).toBe(false);
      expect(createCyclingActivitySchema.safeParse({ ...buildValidCyclingActivity(), peak20MinPower: 0 }).success).toBe(false);
    });
  });
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

});
